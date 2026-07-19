// محرك الانعكاس الآلي — المتطلبات النظامية انعكاس لبنود ومواد الوثائق التشريعية:
// 1) كل بند/مادة منطبقة في وثيقة محلَّلة تنعكس متطلباً مستقلاً في المكتبة المفصلة
//    (بالإدارة المالكة والأهمية المشتقة من درجة الخطر والغرامات)
// 2) تُشتق مخاطر من البنود عالية الخطر أو ذات الغرامات وتُربط بمتطلباتها
// 3) كل متطلب يدوي بلا خطر مرتبط يُنشأ له خطر عدم التزام تلقائي
// المحرك آمن التكرار: لا يُنشئ سجلاً موجوداً (مفتاح مصدر ثابت لكل بند)
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

// خريطة درجة خطر البند إلى أهمية المتطلب
const RISK_TO_CRIT = { "عالي": "HIGH", "متوسط": "MEDIUM", "منخفض": "LOW" };

// ---------- انعكاس بند واحد متطلباً في المكتبة المفصلة ----------
async function ensureArticleRequirement(reg, a, pen) {
  const sourceKey = `${reg.id}::${a.number}`;
  const existing = store.requirements.find((q) => q.sourceKey === sourceKey);
  if (existing) return { req: existing, created: false };
  // بند بغرامة قصوى (سجن/إلغاء ترخيص/ملايين) = متطلب حرج
  const criticality = pen.found && pen.impact === 5 ? "CRITICAL" : RISK_TO_CRIT[a.risk_level] || "MEDIUM";
  const code = await db.nextCode("REQ");
  const req = await db.setRow("requirements", code, {
    code,
    title: `${a.number} — ${(a.title || reg.name).slice(0, 120)}`,
    summary: (a.text || "").slice(0, 1500),
    type: "REGULATION",
    category: "GOVERNANCE",
    criticality,
    authorityId: null,
    ownerDeptId: deptIdByName(a.owning_department),
    issueDate: null,
    nextReviewDate: null,
    status: "ACTIVE",
    attachmentUrl: null,
    penalty: (a.penalty || pen.snippet || "").slice(0, 300),
    createdById: store.user?.uid || null,
    approvedById: null,
    source: "AUTO_REGULATION",
    regulationId: reg.id,
    sourceKey,
    lastUpdated: db.now(),
    createdAt: db.now(),
  });
  store.requirements.push(req);
  await db.audit("CREATE", "Requirement", code, `انعكاس البند ${a.number} من «${reg.name}» متطلباً في المكتبة المفصلة`);
  return { req, created: true };
}

// ---------- انعكاس وثيقة محلَّلة: بنودها متطلبات، وبنود الغرامات/الخطر العالي مخاطر ----------
async function reflectRegulation(reg) {
  let createdReqs = 0;
  let createdRisks = 0;
  for (const a of reg.articles) {
    if (a.applicability !== "تنطبق") continue;
    const pen = detectPenalty(`${a.penalty || ""}\n${a.text || ""}`);
    const { req, created } = await ensureArticleRequirement(reg, a, pen);
    if (created) createdReqs++;

    if (!pen.found && a.risk_level !== "عالي") continue;
    // مفتاح المصدر ثابت عبر إعادة التحليل (رقم البند لا معرّفه المتغير)
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
    createdRisks++;
    await db.audit("CREATE", "Risk", rcode, `اشتقاق خطر آلياً من ${a.number} في «${reg.name}» وفق الغرامات/العقوبات المذكورة`);
  }
  return { createdReqs, createdRisks };
}

// ---------- دمج نظام واحد بعد اكتمال تحليله (يُستدعى من وحدة التحليل الذكي) ----------
export async function autoIntegrateRegulation(regId) {
  const reg = await db.getRegulation(regId);
  if (!reg || reg.status !== "ready" || !reg.articles.length) return { createdReqs: 0, createdRisks: 0 };
  await reload("requirements", "risks");
  const summary = await reflectRegulation(reg);
  if (summary.createdReqs || summary.createdRisks) {
    await db.notify({
      title: "انعكاس آلي بعد التحليل الذكي",
      message: `«${reg.name}»: انعكست بنودها ${summary.createdReqs} متطلباً في المكتبة المفصلة و${summary.createdRisks} خطراً وفق الغرامات والمخالفات`,
      type: "RISK_AUTO",
      link: "library",
      roleTarget: "COMPLIANCE_MANAGER",
    });
    await reload("requirements", "risks", "notifications");
  }
  return summary;
}

// ---------- خطر عدم التزام عام لكل متطلب يدوي بلا مخاطر ----------
// المتطلبات المنعكسة من البنود (لها sourceKey) تُدار مخاطرها من reflectRegulation
// حسب الغرامات ودرجة الخطر — فلا تُغرق السجل بمخاطر عامة لكل بند
async function coverBareRequirements() {
  let created = 0;
  for (const q of store.requirements) {
    if (q.status === "CANCELLED") continue;
    if (q.sourceKey) continue;
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

  onProgress("فحص الوثائق المحلَّلة وانعكاس بنودها…");
  const regs = await db.allRegulations().catch(() => []);
  for (const reg of regs) {
    if (reg.status !== "ready" || !reg.articles.length) continue;
    const res = await reflectRegulation(reg);
    summary.createdReqs += res.createdReqs;
    summary.createdRisks += res.createdRisks;
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
