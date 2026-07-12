import express from "express";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import * as store from "./src/store.js";
import { analyzeRegulation } from "./src/analyzer.js";
import { extractText } from "./src/extract.js";
import { DEPARTMENTS, RISK_LEVELS, APPLICABILITY } from "./src/meta.js";
import { login, logout, authenticate, requireManager } from "./src/auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "10mb" }));
app.use(authenticate);
app.use(express.static(path.join(__dirname, "public")));

// ---------- المصادقة ----------
app.post("/api/login", (req, res) => {
  const { username, password } = req.body || {};
  const session = login(username, password);
  if (!session) return res.status(401).json({ error: "اسم المستخدم أو كلمة المرور غير صحيحة" });
  res.json(session);
});

app.post("/api/logout", (req, res) => {
  const header = req.headers.authorization || "";
  if (header.startsWith("Bearer ")) logout(header.slice(7));
  res.json({ ok: true });
});

app.get("/api/me", (req, res) => {
  res.json({ user: req.user });
});

// ---------- القوائم المرجعية ----------
app.get("/api/meta", (_req, res) => {
  res.json({
    departments: DEPARTMENTS,
    risk_levels: RISK_LEVELS,
    applicability: APPLICABILITY,
    ai_enabled: Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN),
  });
});

// ---------- استخراج النص من ملف PDF / Word ----------
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB
});

app.post("/api/extract", requireManager, (req, res) => {
  upload.single("file")(req, res, async (err) => {
    if (err) {
      const msg =
        err.code === "LIMIT_FILE_SIZE" ? "حجم الملف يتجاوز الحد المسموح (25 م.ب)" : err.message;
      return res.status(400).json({ error: msg });
    }
    if (!req.file) return res.status(400).json({ error: "لم يُرفق أي ملف" });
    try {
      const text = await extractText(
        req.file.originalname,
        req.file.buffer,
        req.file.mimetype
      );
      res.json({ filename: req.file.originalname, chars: text.length, text });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });
});

// ---------- الأنظمة واللوائح ----------
app.get("/api/regulations", (_req, res) => {
  res.json({ regulations: store.listRegulations() });
});

app.get("/api/regulations/:id", (req, res) => {
  const reg = store.getRegulation(req.params.id);
  if (!reg) return res.status(404).json({ error: "النظام غير موجود" });
  res.json(reg);
});

function runAnalysis(regId, text, orgContext) {
  store.updateRegulation(regId, { status: "processing", analysis_error: null });
  analyzeRegulation(text, orgContext)
    .then(({ method, articles, warning }) => {
      const withIds = articles.map((a) => ({
        ...a,
        id: store.newId("art"),
        edited_by: null,
        updated_at: new Date().toISOString(),
      }));
      store.replaceArticles(regId, withIds);
      store.updateRegulation(regId, {
        status: "ready",
        analysis_method: method,
        analysis_error: warning || null,
      });
    })
    .catch((err) => {
      store.updateRegulation(regId, { status: "failed", analysis_error: err.message });
    });
}

// إضافة نظام/لائحة: يُنشأ السجل ثم يبدأ التحليل في الخلفية وتتابع الواجهة الحالة
app.post("/api/regulations", requireManager, (req, res) => {
  const { name, description, text, org_context } = req.body || {};
  if (!name?.trim() || !text?.trim()) {
    return res.status(400).json({ error: "اسم النظام ونصه الكامل حقلان إلزاميان" });
  }
  const reg = store.createRegulation({ name: name.trim(), description, text });
  runAnalysis(reg.id, text, org_context);
  res.status(201).json(store.getRegulation(reg.id));
});

app.post("/api/regulations/:id/reanalyze", requireManager, (req, res) => {
  const reg = store.getRegulation(req.params.id);
  if (!reg) return res.status(404).json({ error: "النظام غير موجود" });
  if (reg.status === "processing") {
    return res.status(409).json({ error: "التحليل قيد التنفيذ حالياً" });
  }
  runAnalysis(reg.id, reg.text, req.body?.org_context);
  res.json(store.getRegulation(reg.id));
});

app.patch("/api/regulations/:id", requireManager, (req, res) => {
  const { name, description } = req.body || {};
  const patch = {};
  if (typeof name === "string" && name.trim()) patch.name = name.trim();
  if (typeof description === "string") patch.description = description;
  const reg = store.updateRegulation(req.params.id, patch);
  if (!reg) return res.status(404).json({ error: "النظام غير موجود" });
  res.json(reg);
});

app.delete("/api/regulations/:id", requireManager, (req, res) => {
  if (!store.deleteRegulation(req.params.id)) {
    return res.status(404).json({ error: "النظام غير موجود" });
  }
  res.json({ ok: true });
});

// ---------- المواد والبنود ----------
app.post("/api/regulations/:id/articles", requireManager, (req, res) => {
  const article = store.addArticle(req.params.id, {
    ...req.body,
    edited_by: req.user.display_name,
  });
  if (!article) return res.status(404).json({ error: "النظام غير موجود" });
  res.status(201).json(article);
});

app.patch("/api/regulations/:id/articles/:articleId", requireManager, (req, res) => {
  const { applicability, risk_level, owning_department } = req.body || {};
  if (applicability && !APPLICABILITY.includes(applicability)) {
    return res.status(400).json({ error: "قيمة الانطباق غير صحيحة" });
  }
  if (risk_level && !RISK_LEVELS.includes(risk_level)) {
    return res.status(400).json({ error: "درجة الخطر غير صحيحة" });
  }
  if (owning_department && !DEPARTMENTS.includes(owning_department)) {
    return res.status(400).json({ error: "الإدارة المالكة غير مدرجة في القائمة المعتمدة" });
  }
  const article = store.updateArticle(
    req.params.id,
    req.params.articleId,
    req.body,
    req.user.display_name
  );
  if (!article) return res.status(404).json({ error: "المادة غير موجودة" });
  res.json(article);
});

app.delete("/api/regulations/:id/articles/:articleId", requireManager, (req, res) => {
  if (!store.deleteArticle(req.params.id, req.params.articleId)) {
    return res.status(404).json({ error: "المادة غير موجودة" });
  }
  res.json({ ok: true });
});

app.listen(PORT, () => {
  const ai = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN;
  console.log(`CHCC compliance server running on http://localhost:${PORT}`);
  console.log(`AI analysis: ${ai ? "enabled (Claude API)" : "disabled — heuristic fallback only (set ANTHROPIC_API_KEY)"}`);
});
