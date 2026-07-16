// محرك التحديث الآلي لسجل المخاطر — يربط مكتبة الالتزام والتحليل الذكي بالمخاطر:
// 1) كل نظام مكتمل التحليل يُنشأ له متطلب في مكتبة الالتزام آلياً إن لم يوجد
// 2) تُشتق مخاطر من المواد المنطبقة وفق الغرامات والعقوبات والمخالفات المذكورة في نصوصها
// 3) كل متطلب في المكتبة بلا خطر مرتبط يُنشأ له خطر عدم التزام تلقائي
// المحرك آمن التكرار: لا يُنشئ سجلاً موجوداً (مفتاح مصدر ثابت لكل مادة/متطلب)
import { store, reload } from "./state.js";
import * as db from "./db.js";
import { enDigits } from "./ui.js";

// ---------- كشف الغرامات والعقوبات في النص ----------
// الأنماط مرتبة من الأشد أثراً إلى الأخف — يُعتمد أول تطابق لتحديد الأثر (1-5)
const PENALTY_PATTERNS = [
  { re: /(سجن|حبس|إلغاء الترخيص|سحب الترخيص|شطب القيد|إغلاق المنشأة|الإغلاق النهائي)/, impact: 5 },
  { re: /غرام\S*[^.؛\n]{0,80}?(مليون|ملايين)/, impact: 5 },
  { re: /(غرامة|غرامات|عقوبة مالية|جزاء مالي)/, impact: 4 },
  { re: /(إيقاف|تعليق)[^.؛\n]{0,40}?(الترخيص|ترخيص|النشاط|نشاط|الخدمة|القيد)/, impact: 4 },
  { re: /(يعاقب|يُعاقب|عقوبة|عقوبات|جزاءات|جزاء|إنذار|تشهير|تعويض|مصادرة)/, impact: 3 },
];

// يُعيد { found, impact (1-5), snippet } — المقتطف هو الجملة الحاوية للعقوبة
export function detectPenalty(text) {
  const t = String(text || "");
  if (!t.trim()) return { found: false, impact: 3, snippet: "" };
  for (const p of PENALTY_PATTERNS) {
    const m = t.match(p.re);
    if (!m) continue;
    const idx = m.index ?? 0;
    const start = Math.max(0, t.lastIndexOf("\n", idx) + 1, t.lastIndexOf(".", idx) + 1, t.lastIndexOf("؛", idx) + 1);
    const ends = [t.indexOf(".", idx), t.indexOf("؛", idx), t.indexOf("\n", idx)].filter((i) => i !== -1);
    const end = ends.length ? Math.min(...ends) : Math.min(t.length, idx + 180);
    return { found: true, impact: p.impact, snippet: t.slice(start, end).trim().slice(0, 220) };
  }
  return { found: false, impact: 3, snippet: "" };
}

const deptIdByName = (name) => store.departments.find((d) => d.name === name)?.id || null;

// ---------- تقدير قيمة الغرامة بالريال من نص العقوبة ----------
// يفهم الأرقام الصريحة (500,000 ريال) والمضاعفات (5 ملايين) والأعداد اللفظية الشائعة (خمسمائة ألف)
const NUM_WORDS = {
  واحد: 1, اثنان: 2, اثنين: 2, ثلاثة: 3, ثلاث: 3, أربعة: 4, أربع: 4, خمسة: 5, خمس: 5,
  ستة: 6, ست: 6, سبعة: 7, سبع: 7, ثمانية: 8, ثماني: 8, تسعة: 9, تسع: 9, عشرة: 10, عشر: 10,
  عشرون: 20, عشرين: 20, ثلاثون: 30, ثلاثين: 30, خمسون: 50, خمسين: 50,
  مائة: 100, مئة: 100, مائتين: 200, مئتين: 200, ثلاثمائة: 300, خمسمائة: 500, خمسمئة: 500,
};
const MULTS = { ألف: 1e3, آلاف: 1e3, الف: 1e3, مليون: 1e6, ملايين: 1e6, مليار: 1e9 };
const MULT_RE = Object.keys(MULTS).join("|");

export function estimateFine(text) {
  const t = enDigits(String(text || ""));
  if (!t.trim()) return 0;
  let best = 0;
  // أرقام صريحة مع مضاعف اختياري: "500,000 ريال" / "5 ملايين ريال"
  const reDigits = new RegExp(`(\\d[\\d,]*(?:\\.\\d+)?)\\s*(${MULT_RE})?\\s*(?:ريال|ر\\.س)`, "g");
  for (const m of t.matchAll(reDigits)) {
    const v = parseFloat(m[1].replace(/,/g, "")) * (MULTS[m[2]] || 1);
    if (v > best) best = v;
  }
  // أعداد لفظية: "خمسة ملايين ريال" / "خمسمائة ألف ريال"
  const reWords = new RegExp(`(${Object.keys(NUM_WORDS).join("|")})\\s*(${MULT_RE})\\s*(?:ريال|ر\\.س)`, "g");
  for (const m of t.matchAll(reWords)) {
    const v = NUM_WORDS[m[1]] * MULTS[m[2]];
    if (v > best) best = v;
  }
  // مضاعف وحده: "مليون ريال"
  const reLone = new RegExp(`(?:^|[^\\d\\u0621-\\u064A])(${MULT_RE})\\s*(?:ريال|ر\\.س)`, "g");
  for (const m of t.matchAll(reLone)) {
    const v = MULTS[m[1]];
    if (v > best) best = v;
  }
  return best;
}

const CRIT_IMPACT = { CRITICAL: 5, HIGH: 4, MEDIUM: 3, LOW: 2 };

// ---------- إنشاء متطلب آلي من نظام محلَّل ----------
async function ensureRequirement(reg, articles) {
  if (reg.requirementId) {
    const existing = store.requirements.find((r) => r.id === reg.requirementId);
    if (existing) return { req: existing, created: false };
  }
  const applies = articles.filter((a) => a.applicability === "تنطبق");
  const high = applies.filter((a) => a.risk_level === "عالي").length;
  const hasPenalty = applies.some((a) => detectPenalty(`${a.penalty || ""} ${a.text || ""}`).found);
  const criticality = high > 0 ? (hasPenalty ? "CRITICAL" : "HIGH") : hasPenalty ? "HIGH" : "MEDIUM";

  // الإدارة المالكة الأكثر تكراراً بين المواد المنطبقة
  const freq = {};
  for (const a of applies) freq[a.owning_department] = (freq[a.owning_department] || 0) + 1;
  const topDept = Object.entries(freq).sort((x, y) => y[1] - x[1])[0]?.[0];

  const code = await db.nextCode("REQ");
  const req = await db.setRow("requirements", code, {
    code,
    title: reg.name,
    summary: reg.description || `أُنشئ آلياً من التحليل الذكي — ${articles.length} مادة مستخرجة، منها ${high} بخطر عالٍ`,
    type: "REGULATION",
    category: "GOVERNANCE",
    criticality,
    authorityId: null,
    ownerDeptId: deptIdByName(topDept),
    issueDate: null,
    nextReviewDate: null,
    status: "UNDER_REVIEW",
    attachmentUrl: null,
    createdById: store.user?.uid || null,
    approvedById: null,
    source: "AUTO_REGULATION",
    regulationId: reg.id,
    lastUpdated: db.now(),
    createdAt: db.now(),
  });
  await db.updateRegulation(reg.id, { requirementId: code });
  await db.audit("CREATE", "Requirement", code, `إنشاء متطلب آلياً من تحليل النظام: ${reg.name}`);
  store.requirements.push(req);
  const regRow = store.regulations.find((r) => r.id === reg.id);
  if (regRow) regRow.requirementId = code;
  return { req, created: true };
}

// ---------- اشتقاق المخاطر من مواد نظام محلَّل ----------
// تُنشأ مخاطر للمواد المنطبقة ذات الخطر العالي أو التي تنص على غرامة/عقوبة/مخالفة
async function deriveRisksFromRegulation(reg, req) {
  let created = 0;
  for (const a of reg.articles) {
    if (a.applicability !== "تنطبق") continue;
    const pen = detectPenalty(`${a.penalty || ""}\n${a.text || ""}`);
    if (!pen.found && a.risk_level !== "عالي") continue;
    // مفتاح المصدر ثابت عبر إعادة التحليل (رقم المادة لا معرّفها المتغير)
    const sourceKey = `${reg.id}::${a.number}`;
    if (store.risks.some((r) => r.sourceKey === sourceKey)) continue;

    const likelihood = a.risk_level === "عالي" ? 4 : a.risk_level === "منخفض" ? 2 : 3;
    const impact = pen.found ? pen.impact : 4;
    const rcode = await db.nextCode("RSK");
    const risk = await db.setRow("risks", rcode, {
      code: rcode,
      title: `عدم الالتزام — ${a.number} من ${reg.name}`,
      description: `${a.title || ""}\n${(a.text || "").slice(0, 400)}`.trim(),
      cause: "احتمال مخالفة أحكام المادة المذكورة",
      penalty: (a.penalty || pen.snippet || "").slice(0, 300),
      fineAmount: estimateFine(`${a.penalty || ""}\n${a.text || ""}`) || null,
      requirementId: req.id,
      regulationId: reg.id,
      sourceArticleId: a.id,
      sourceKey,
      source: "AUTO_REGULATION",
      likelihood,
      impact,
      residualLikelihood: likelihood,
      residualImpact: impact,
      controls: [],
      ownerDeptId: deptIdByName(a.owning_department),
      treatmentOwnerId: null,
      treatmentPlan: "",
      kri: "",
      dueDate: null,
      status: "OPEN",
      createdAt: db.now(),
      updatedAt: db.now(),
    });
    store.risks.push(risk);
    created++;
    await db.audit("CREATE", "Risk", rcode, `اشتقاق خطر آلياً من ${a.number} في «${reg.name}» وفق الغرامات/العقوبات المذكورة`);
  }
  return created;
}

// ---------- دمج نظام واحد بعد اكتمال تحليله (يُستدعى من وحدة التحليل الذكي) ----------
export async function autoIntegrateRegulation(regId) {
  const reg = await db.getRegulation(regId);
  const summary = { requirementCreated: false, createdRisks: 0 };
  if (!reg || reg.status !== "ready" || !reg.articles.length) return summary;
  await reload("requirements", "risks");
  const { req, created } = await ensureRequirement(reg, reg.articles);
  summary.requirementCreated = created;
  summary.createdRisks = await deriveRisksFromRegulation(reg, req);
  if (summary.requirementCreated || summary.createdRisks) {
    await db.notify({
      title: "تحديث آلي بعد التحليل الذكي",
      message: `«${reg.name}»: ${summary.requirementCreated ? "أُضيف متطلب لمكتبة الالتزام و" : ""}أُنشئ ${summary.createdRisks} خطر في سجل المخاطر وفق الغرامات والمخالفات`,
      type: "RISK_AUTO",
      link: "risks",
      roleTarget: "COMPLIANCE_MANAGER",
    });
    await reload("requirements", "risks", "notifications");
  }
  return summary;
}

// ---------- خطر عدم التزام عام لكل متطلب بلا مخاطر ----------
async function coverBareRequirements() {
  let created = 0;
  for (const q of store.requirements) {
    if (q.status === "CANCELLED") continue;
    if (store.risks.some((r) => r.requirementId === q.id)) continue;
    const impact = CRIT_IMPACT[q.criticality] || 3;
    const rcode = await db.nextCode("RSK");
    const risk = await db.setRow("risks", rcode, {
      code: rcode,
      title: `خطر عدم الالتزام — ${q.title}`,
      description: `احتمال عدم الالتزام بالمتطلب ${q.code} (${q.title})`,
      cause: "",
      penalty: "",
      fineAmount: null,
      requirementId: q.id,
      regulationId: null,
      sourceArticleId: null,
      sourceKey: `req::${q.id}`,
      source: "AUTO_LIBRARY",
      likelihood: 3,
      impact,
      residualLikelihood: 3,
      residualImpact: impact,
      controls: [],
      ownerDeptId: q.ownerDeptId || null,
      treatmentOwnerId: null,
      treatmentPlan: "",
      kri: "",
      dueDate: null,
      status: "OPEN",
      createdAt: db.now(),
      updatedAt: db.now(),
    });
    store.risks.push(risk);
    created++;
    await db.audit("CREATE", "Risk", rcode, `إنشاء خطر آلياً للمتطلب ${q.code} (تحديث آلي لسجل المخاطر)`);
  }
  return created;
}

// ---------- المزامنة الشاملة: تُشغَّل عند الدخول وبزر «تحديث آلي» في سجل المخاطر ----------
export async function runAutoSync(onProgress = () => {}) {
  const summary = { createdReqs: 0, createdRisks: 0 };
  await reload("requirements", "risks");

  onProgress("فحص الأنظمة المحلَّلة…");
  const regs = await db.allRegulations().catch(() => []);
  for (const reg of regs) {
    if (reg.status !== "ready" || !reg.articles.length) continue;
    const { req, created } = await ensureRequirement(reg, reg.articles);
    if (created) summary.createdReqs++;
    summary.createdRisks += await deriveRisksFromRegulation(reg, req);
  }

  onProgress("فحص متطلبات مكتبة الالتزام…");
  summary.createdRisks += await coverBareRequirements();

  if (summary.createdReqs || summary.createdRisks) {
    await db.notify({
      title: "تحديث آلي لسجل المخاطر",
      message: `أُنشئ ${summary.createdRisks} خطر و${summary.createdReqs} متطلب آلياً وفق أحدث الإضافات والتحليلات`,
      type: "RISK_AUTO",
      link: "risks",
      roleTarget: "COMPLIANCE_MANAGER",
    });
    store.regulations = await db.listRegulations().catch(() => store.regulations);
    await reload("requirements", "risks", "notifications");
  }
  return summary;
}
