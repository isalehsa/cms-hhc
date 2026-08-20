// محرك الرصد التنظيمي وإدارة التغيير (Regulatory Intelligence & Change Management)
//
// المسار الكامل:
//   مصدر رصد → فحص (مجدول أسبوعياً في الخادم أو يدوي) → مستجد تنظيمي
//   → تحليل بالذكاء الاصطناعي (انطباق + التزامات + مخاطر + مواعيد)
//   → مراجعة الالتزام → اعتماد → دمج آلي في وحدات النظام القائمة:
//     سجل التغيّر التنظيمي · مكتبة الالتزام · سجل المخاطر والضوابط ·
//     برنامج المراقبة · الخطة السنوية · الفحص الذاتي · الملاحظات وخطط التصحيح
//
// المحرك لا ينشئ وحدات موازية: كل مخرجاته سجلات في المجموعات القائمة،
// مربوطة بحقل regUpdateId ليمكن التنقّل في الاتجاهين.
import { store, reload } from "./state.js";
import * as db from "./db.js";
import { idToken } from "./auth.js";
import { rankBySimilarity } from "./similarity.js";
import { detectPenalty, estimateFine } from "./sync.js";
import { analyzeRegulatoryUpdate, aiEnabled } from "./ai-assist.js";
import { DOC_TO_REQ_TYPE, REQ_CATEGORIES, CRITICALITY } from "./meta.js";
import {
  updateKey, normalizeUrl, validateSourceUrl, scoreApplicability, extractDeadlines,
  weekRange, summarizeWeek, sanitizeForPrompt,
} from "./regintel-core.js";

export const SCAN_LOCK_KEY = "regintelScanLock";
export const CONFIG_KEY = "regintel";

const DEFAULT_CONFIG = {
  orgContext:
    "شركة صحية قابضة تدير عشرين تجمعاً صحياً في المملكة العربية السعودية، وتخضع لأنظمة وزارة الصحة " +
    "والهيئة العامة للغذاء والدواء والمجلس الصحي السعودي وهيئة التخصصات الصحية ومجلس الضمان الصحي، " +
    "إضافة إلى أنظمة حماية البيانات الشخصية والأمن السيبراني والمنافسات والمشتريات والزكاة والضريبة والعمل.",
  autoAnalyze: true,
  weeklyEmail: true,
  maxItemsPerSource: 25,
};

export const loadConfig = () => db.getConfig(CONFIG_KEY, DEFAULT_CONFIG);
export const saveConfig = (data) => db.setConfig(CONFIG_KEY, data);

const deptIdByName = (name) => {
  if (!name) return null;
  const n = String(name).trim();
  const exact = store.departments.find((d) => d.name === n);
  if (exact) return exact.id;
  const loose = store.departments.find((d) => d.name && (d.name.includes(n) || n.includes(d.name)));
  return loose?.id || null;
};

const CRIT_IMPACT = { CRITICAL: 5, HIGH: 4, MEDIUM: 3, LOW: 2 };
const IMPACT_CRIT = { HIGH: "HIGH", MEDIUM: "MEDIUM", LOW: "LOW" };
const CHANGE_TO_DOC = { NEW: "LAW", AMENDMENT: "REGULATION", REPEAL: "DECISION", CIRCULAR: "CIRCULAR", REQUIREMENT: "STANDARD" };

// ---------- مصادر الرصد ----------

export async function saveSource(data, existingId = null) {
  const type = data.type || "HTML";
  let url = String(data.url || "").trim();
  if (type !== "MANUAL") {
    const check = validateSourceUrl(url);
    if (!check.ok) throw new Error(`رابط المصدر غير مقبول: ${check.reason}`);
    url = check.url;
  } else {
    url = url ? normalizeUrl(url) : "";
  }
  const row = {
    name: String(data.name || "").trim(),
    url,
    type,
    sector: data.sector || "",
    authorityId: data.authorityId || null,
    linkPattern: (data.linkPattern || "").trim() || null,
    active: data.active !== false,
    notes: (data.notes || "").trim() || null,
    updatedAt: db.now(),
  };
  if (!row.name) throw new Error("اسم المصدر إلزامي");

  if (existingId) {
    await db.updateRow("regSources", existingId, row);
    await db.audit("UPDATE", "RegSource", existingId, `تعديل مصدر رصد تنظيمي: ${row.name}`);
  } else {
    const created = await db.addRow("regSources", {
      ...row,
      lastScanAt: null,
      lastStatus: "NEVER",
      lastError: null,
      lastItemCount: 0,
      totalDetected: 0,
      createdById: store.user?.uid || null,
      createdAt: db.now(),
    });
    await db.audit("CREATE", "RegSource", created.id, `إضافة مصدر رصد تنظيمي: ${row.name} (${url || "يدوي"})`);
  }
  await reload("regSources");
}

export async function deleteSource(id) {
  const s = store.regSources.find((x) => x.id === id);
  await db.removeRow("regSources", id);
  await db.audit("DELETE", "RegSource", id, `حذف مصدر الرصد: ${s?.name || id}`);
  await reload("regSources");
}

// بذر قائمة المصادر الرسمية — تُضاف معطّلة حتى يتحقق مدير الالتزام من كل مصدر
export async function seedSources(seed) {
  let added = 0;
  for (const s of seed) {
    if (store.regSources.some((x) => normalizeUrl(x.url) === normalizeUrl(s.url))) continue;
    await db.addRow("regSources", {
      name: s.name,
      url: normalizeUrl(s.url),
      type: s.type || "HTML",
      sector: s.sector || "",
      authorityId: null,
      linkPattern: null,
      active: false, // تُفعَّل يدوياً بعد التحقق من صيغة المصدر
      notes: "مصدر رسمي مقترح — فعّله بعد التحقق من توفّر تغذية قابلة للقراءة الآلية",
      lastScanAt: null,
      lastStatus: "NEVER",
      lastError: null,
      lastItemCount: 0,
      totalDetected: 0,
      createdById: store.user?.uid || null,
      createdAt: db.now(),
      updatedAt: db.now(),
    });
    added++;
  }
  if (added) {
    await db.audit("CREATE", "RegSource", null, `بذر ${added} مصدر رصد تنظيمي رسمي (معطّلة حتى التحقق)`);
    await reload("regSources");
  }
  return added;
}

// ---------- تسجيل مستجد تنظيمي ----------

// إنشاء سجل مستجد بمفتاح ثابت يمنع التكرار عبر عمليات الفحص المتتالية
export async function ingestUpdate(item, { sourceId = null, sourceName = "إدخال يدوي", trigger = "MANUAL" } = {}) {
  const key = updateKey(sourceId, item);
  const existing = store.regUpdates.find((u) => u.dedupeKey === key);
  if (existing) return { created: false, update: existing };

  const code = await db.nextCode("RGU");
  const row = await db.setRow("regUpdates", code, {
    code,
    dedupeKey: key,
    sourceId,
    sourceName,
    title: String(item.title || "مستجد تنظيمي").slice(0, 400),
    url: item.url ? normalizeUrl(item.url) : null,
    externalId: item.externalId || null,
    publishedAt: item.publishedAt || null,
    rawExcerpt: sanitizeForPrompt(item.summary || "", 8000),
    authorityId: item.authorityId || null,
    status: "DETECTED",
    applicability: "UNKNOWN",
    impact: "LOW",
    analysis: null,
    analysisMethod: null,
    analysisAt: null,
    analysisError: null,
    deadlines: [],
    reviewedById: null,
    reviewedByName: null,
    reviewedAt: null,
    reviewNotes: null,
    generated: null,
    regChangeId: null,
    trigger,
    detectedAt: db.now(),
    createdById: store.user?.uid || null,
    createdAt: db.now(),
    updatedAt: db.now(),
  });
  await db.audit("CREATE", "RegUpdate", code, `رصد مستجد تنظيمي: ${row.title} (${sourceName})`);
  return { created: true, update: row };
}

// ---------- التحليل ----------

// تحليل مبدئي بلا ذكاء اصطناعي — يعتمد الكلمات المفتاحية وأنماط العقوبات والمواعيد
export function heuristicAnalysis(update) {
  const text = `${update.title || ""}\n${update.rawExcerpt || ""}`;
  const score = scoreApplicability(text);
  const pen = detectPenalty(text);
  const deadlines = extractDeadlines(text, update.publishedAt || update.detectedAt);
  const impact = pen.found ? "HIGH" : score.impact;
  return {
    isRegulatory: true,
    summary:
      `تحليل نصي مبدئي (بلا ذكاء اصطناعي): رُصدت ${score.matched.length} كلمة مفتاحية ذات صلة` +
      `${pen.found ? ` مع ذكر عقوبة/غرامة: ${pen.snippet}` : " دون ذكر عقوبات صريحة"}. ` +
      "يلزم مراجعة مدير الالتزام لتأكيد الانطباق واشتقاق الالتزامات.",
    changeType: "CIRCULAR",
    authorityName: "",
    applicability: score.applicability,
    applicabilityRationale: score.matched.length
      ? `تطابق مع: ${score.matched.slice(0, 8).join("، ")}`
      : "لم تُرصد كلمات مفتاحية ذات صلة بنشاط المنشأة",
    impact,
    effectiveDate: deadlines[0]?.date || "",
    affectedDepartments: [],
    obligations: [],
    risks: [],
    deadlines: deadlines.map((d) => ({ date: d.date, label: d.label })),
    monitoringSuggestion: "",
    recommendedActions: [],
    confidence: Math.min(0.5, score.score),
    penaltySnippet: pen.found ? pen.snippet : "",
  };
}

export async function analyzeUpdate(update, onProgress = () => {}) {
  const content = `${update.title || ""}\n\n${update.rawExcerpt || ""}`.trim();
  let analysis;
  let method = "heuristic";
  if (aiEnabled()) {
    try {
      onProgress("جاري تحليل المستجد بالذكاء الاصطناعي…");
      analysis = await analyzeRegulatoryUpdate(
        {
          title: update.title,
          sourceName: update.sourceName,
          url: update.url,
          publishedAt: update.publishedAt,
          content,
          deptNames: store.departments.filter((d) => d.active !== false).map((d) => d.name),
          orgContext: (await loadConfig()).orgContext,
        },
        onProgress
      );
      method = "ai";
    } catch (err) {
      console.warn("regintel AI analysis failed", err);
      analysis = heuristicAnalysis(update);
      analysis.warning = `تعذّر التحليل بالذكاء الاصطناعي (${err.message}) — استُخدم التحليل النصي المبدئي`;
    }
  } else {
    analysis = heuristicAnalysis(update);
  }

  // دمج المواعيد المستخرجة نصياً مع ما استخرجه النموذج (بلا تكرار)
  const textual = extractDeadlines(content, update.publishedAt || update.detectedAt);
  const merged = [...(analysis.deadlines || [])];
  for (const d of textual) if (!merged.some((x) => x.date === d.date)) merged.push({ date: d.date, label: d.label });
  if (analysis.effectiveDate && !merged.some((x) => x.date === analysis.effectiveDate)) {
    merged.unshift({ date: analysis.effectiveDate, label: "تاريخ النفاذ" });
  }
  const deadlines = merged
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.date || ""))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 12);

  const patch = {
    status: "ANALYZED",
    applicability: analysis.applicability || "UNKNOWN",
    impact: analysis.impact || "LOW",
    analysis,
    analysisMethod: method,
    analysisAt: db.now(),
    analysisError: analysis.warning || null,
    deadlines,
  };
  await db.updateRow("regUpdates", update.id, patch);
  await db.audit(
    "REVIEW", "RegUpdate", update.code,
    `تحليل المستجد ${update.code} (${method === "ai" ? "ذكاء اصطناعي" : "تحليل نصي"}): ` +
      `${patch.applicability} — ${(analysis.obligations || []).length} التزام مقترح`
  );
  await reload("regUpdates");
  return { ...update, ...patch };
}

// ---------- الاعتماد والدمج في وحدات النظام ----------

const reqText = (r) => `${r.title || ""} ${r.summary || ""} ${r.penalty || ""}`;

function affectedRequirements(text, limit = 12) {
  const ranked = rankBySimilarity(
    text,
    store.requirements.filter((r) => r.status !== "CANCELLED"),
    reqText,
    { limit, threshold: 0.1 }
  );
  return ranked.map((x) => ({ id: x.item.id, code: x.item.code, title: x.item.title, score: x.score }));
}

// اعتماد مستجد تنظيمي: ينشئ سجلاته في الوحدات القائمة ويربطها ببعضها
// options: { createMonitoring, createPlanItem, createAssessment, deptId }
export async function approveUpdate(update, options = {}, onProgress = () => {}) {
  if (update.status === "APPROVED") throw new Error("هذا المستجد معتمد ومدمج مسبقاً");
  const a = update.analysis || heuristicAnalysis(update);
  const generated = {
    regChangeId: null,
    requirementIds: [],
    riskIds: [],
    monitoringIds: [],
    planItemIds: [],
    findingIds: [],
    assessmentIds: [],
  };
  const baseText = `${update.title || ""} ${update.rawExcerpt || ""} ${a.summary || ""}`;
  const effective = a.effectiveDate && /^\d{4}-\d{2}-\d{2}$/.test(a.effectiveDate)
    ? new Date(`${a.effectiveDate}T12:00:00Z`).toISOString()
    : update.deadlines?.[0]?.date
      ? new Date(`${update.deadlines[0].date}T12:00:00Z`).toISOString()
      : null;
  const defaultDue = effective || new Date(Date.now() + 60 * 86400000).toISOString();

  // 1) سجل التغيّر التنظيمي القائم — لا نُنشئ سجلاً موازياً
  onProgress("تسجيل التغيّر في سجل التغيّر التنظيمي…");
  const affected = affectedRequirements(baseText);
  const rchCode = await db.nextCode("RCH");
  await db.setRow("regChanges", rchCode, {
    code: rchCode,
    title: update.title,
    changeType: a.changeType || "CIRCULAR",
    authorityId: update.authorityId || null,
    authorityName: a.authorityName || update.sourceName || null,
    effectiveDate: effective,
    sourceUrl: update.url || null,
    summary: a.summary || update.rawExcerpt || update.title,
    affected,
    status: "IMPACTED",
    reviewTasksCreated: true,
    reviewTasksAt: db.now(),
    source: "REG_INTEL",
    regUpdateId: update.id,
    externalId: update.externalId || null,
    createdById: store.user?.uid || null,
    createdAt: db.now(),
    updatedAt: db.now(),
  });
  generated.regChangeId = rchCode;

  // 2) مكتبة الالتزام — كل التزام مشتق يصبح متطلباً نظامياً
  onProgress("إنشاء الالتزامات في مكتبة الالتزام…");
  const obligations = Array.isArray(a.obligations) ? a.obligations : [];
  const reqByIndex = new Map();
  for (let i = 0; i < obligations.length; i++) {
    const ob = obligations[i];
    if (!ob?.title) continue;
    const sourceKey = `regupd::${update.id}::${i}`;
    if (store.requirements.some((r) => r.sourceKey === sourceKey)) continue;
    const due = /^\d{4}-\d{2}-\d{2}$/.test(ob.dueDate || "")
      ? new Date(`${ob.dueDate}T12:00:00Z`).toISOString()
      : defaultDue;
    const code = await db.nextCode("REQ");
    const req = await db.setRow("requirements", code, {
      code,
      title: String(ob.title).slice(0, 200),
      summary: String(ob.description || "").slice(0, 1500),
      type: DOC_TO_REQ_TYPE[CHANGE_TO_DOC[a.changeType] || "REGULATION"] || "REGULATION",
      category: REQ_CATEGORIES[ob.category] ? ob.category : "GOVERNANCE",
      criticality: CRITICALITY[ob.criticality] ? ob.criticality : IMPACT_CRIT[a.impact] || "MEDIUM",
      authorityId: update.authorityId || null,
      ownerDeptId: deptIdByName(ob.ownerDepartment) || options.deptId || null,
      issueDate: update.publishedAt || null,
      nextReviewDate: due,
      status: "ACTIVE",
      attachmentUrl: update.url || null,
      evidenceRequired: String(ob.evidenceNeeded || "").slice(0, 300) || null,
      penalty: String(a.penaltySnippet || "").slice(0, 300),
      createdById: store.user?.uid || null,
      approvedById: store.user?.uid || null,
      source: "REG_INTEL",
      regUpdateId: update.id,
      regChangeId: rchCode,
      sourceKey,
      lastUpdated: db.now(),
      createdAt: db.now(),
    });
    store.requirements.push(req);
    generated.requirementIds.push(code);
    reqByIndex.set(i, req);
    await db.audit("CREATE", "Requirement", code, `توليد التزام من المستجد التنظيمي ${update.code}: ${req.title}`);
  }

  // 3) سجل المخاطر والضوابط — خطر لكل التزام (من اقتراح التحليل أو مشتق آلياً)
  onProgress("اشتقاق المخاطر والضوابط…");
  const aiRisks = Array.isArray(a.risks) ? a.risks : [];
  const riskFor = (idx) => aiRisks.find((r) => Number(r.obligationIndex) === idx) || null;
  for (const [idx, req] of reqByIndex) {
    const sourceKey = `regupd::${update.id}::risk::${idx}`;
    if (store.risks.some((r) => r.sourceKey === sourceKey)) continue;
    const suggestion = riskFor(idx);
    const penaltyText = suggestion?.penalty || a.penaltySnippet || "";
    const pen = detectPenalty(`${penaltyText}\n${req.summary || ""}`);
    const likelihood = Number(suggestion?.likelihood) || 3;
    const impact = Number(suggestion?.impact) || (pen.found ? pen.impact : CRIT_IMPACT[req.criticality] || 3);
    const rcode = await db.nextCode("RSK");
    const risk = await db.setRow("risks", rcode, {
      code: rcode,
      title: String(suggestion?.title || `عدم الالتزام — ${req.title}`).slice(0, 200),
      description: String(suggestion?.description || req.summary || "").slice(0, 1500),
      cause: String(suggestion?.cause || "مستجد تنظيمي جديد لم تُستكمل متطلباته بعد").slice(0, 500),
      penalty: String(penaltyText).slice(0, 300),
      fineAmount: estimateFine(`${penaltyText}\n${req.summary || ""}`) || null,
      requirementId: req.id,
      regulationId: null,
      sourceArticleId: null,
      sourceKey,
      source: "REG_INTEL",
      regUpdateId: update.id,
      likelihood: Math.min(5, Math.max(1, likelihood)),
      impact: Math.min(5, Math.max(1, impact)),
      residualLikelihood: Math.min(5, Math.max(1, likelihood)),
      residualImpact: Math.min(5, Math.max(1, impact)),
      controls: (suggestion?.controls || []).slice(0, 6).map((c) => ({
        id: crypto.randomUUID(),
        name: String(c.name || "ضابط مقترح").slice(0, 200),
        type: c.type || "وقائي",
        effectiveness: "غير فعّال",
        ownerDeptId: req.ownerDeptId || null,
        source: "REG_INTEL",
      })),
      ownerDeptId: req.ownerDeptId || null,
      treatmentOwnerId: null,
      treatmentPlan: (a.recommendedActions || []).slice(0, 3).join(" · "),
      kri: "",
      dueDate: req.nextReviewDate || defaultDue,
      status: "OPEN",
      createdAt: db.now(),
      updatedAt: db.now(),
    });
    store.risks.push(risk);
    generated.riskIds.push(rcode);
    await db.audit("CREATE", "Risk", rcode, `اشتقاق خطر من المستجد التنظيمي ${update.code} للمتطلب ${req.code}`);

    // 4) برنامج المراقبة — نشاط رقابي للتحقق من تطبيق الالتزام
    if (options.createMonitoring !== false) {
      const mcode = await db.nextCode("MON");
      await db.setRow("monitoring", mcode, {
        code: mcode,
        name: `التحقق من تطبيق: ${req.title}`.slice(0, 120),
        requirementId: req.id,
        riskId: risk.id,
        type: "DOCUMENT",
        frequency: a.impact === "HIGH" ? "QUARTERLY" : "SEMIANNUAL",
        targetDeptId: req.ownerDeptId || null,
        assigneeId: null,
        startDate: null,
        endDate: req.nextReviewDate || defaultDue,
        status: "PLANNED",
        scope:
          String(a.monitoringSuggestion || `فحص مستندي للتحقق من استيفاء المتطلب ${req.code} الناشئ عن ${update.code}`).slice(0, 600),
        result: null,
        notes: null,
        nonComplianceLevel: null,
        recommendations: null,
        correctionPlan: null,
        source: "REG_INTEL",
        regUpdateId: update.id,
        createdAt: db.now(),
        updatedAt: db.now(),
      });
      generated.monitoringIds.push(mcode);
    }

    // 5) الملاحظات وخطط التصحيح — عند وجود فجوة متوقعة
    const ob = obligations[idx];
    if (ob?.gapExpected) {
      const fcode = await db.nextCode("FND");
      await db.setRow("findings", fcode, {
        code: fcode,
        title: `فجوة امتثال ناشئة عن مستجد تنظيمي: ${req.title}`.slice(0, 200),
        description:
          `المستجد ${update.code} — ${update.title}\n${String(ob.description || "").slice(0, 800)}` +
          `\nالدليل المطلوب: ${ob.evidenceNeeded || "—"}`,
        source: "MANUAL",
        severity: req.criticality === "CRITICAL" ? "CRITICAL" : req.criticality === "HIGH" ? "HIGH" : "MEDIUM",
        requirementId: req.id,
        riskId: risk.id,
        monitoringId: null,
        assessmentId: null,
        departmentId: req.ownerDeptId || null,
        status: "OPEN",
        dueDate: req.nextReviewDate || defaultDue,
        actions: (a.recommendedActions || []).slice(0, 3).map((desc) => ({
          id: crypto.randomUUID(),
          description: String(desc).slice(0, 500),
          ownerId: null,
          departmentId: req.ownerDeptId || null,
          dueDate: req.nextReviewDate || defaultDue,
          status: "OPEN",
          progress: 0,
          closureNotes: null,
          evidenceUrl: null,
          createdAt: db.now(),
        })),
        source_module: "REG_INTEL",
        regUpdateId: update.id,
        createdAt: db.now(),
        updatedAt: db.now(),
      });
      generated.findingIds.push(fcode);
      await db.audit("CREATE", "Finding", fcode, `فتح فجوة امتثال من المستجد التنظيمي ${update.code}`);
    }
  }

  // 6) الخطة السنوية — مبادرة متابعة تنظيمية واحدة للمستجد
  if (options.createPlanItem !== false) {
    onProgress("إضافة مبادرة إلى الخطة السنوية…");
    const dueDate = new Date(defaultDue);
    const item = await db.addRow("planItems", {
      title: `تطبيق مستجد تنظيمي: ${update.title}`.slice(0, 200),
      axis: "GUIDANCE",
      planType: "REGULATORY",
      year: dueDate.getFullYear(),
      quarter: Math.floor(dueDate.getMonth() / 3) + 1,
      departmentId: options.deptId || null,
      ownerId: null,
      source: "REGULATORY",
      requirementId: generated.requirementIds[0] || null,
      riskId: generated.riskIds[0] || null,
      monitoringId: generated.monitoringIds[0] || null,
      status: "NOT_STARTED",
      progress: 0,
      evidenceUrl: update.url || null,
      expectedOutput:
        `استكمال متطلبات «${update.title}» عبر ${generated.requirementIds.length} التزام و` +
        `${generated.riskIds.length} خطر مرتبط قبل ${defaultDue.slice(0, 10)}`,
      regChangeId: rchCode,
      regUpdateId: update.id,
      createdAt: db.now(),
      updatedAt: db.now(),
    });
    generated.planItemIds.push(item.id);
  }

  // 7) الفحص الذاتي — نموذج للإدارة المالكة بأسئلة مبنية على الالتزامات المولّدة
  if (options.createAssessment && generated.requirementIds.length) {
    onProgress("إنشاء نموذج فحص ذاتي للإدارة المعنية…");
    const deptId = options.deptId || [...reqByIndex.values()][0]?.ownerDeptId || null;
    const questions = [...reqByIndex.values()].map((r, i) => ({
      id: crypto.randomUUID(),
      order: i + 1,
      text: `هل استُكمل تطبيق: ${r.title}؟`,
      requirementId: r.id,
      response: null,
    }));
    const asmt = await db.addRow("assessments", {
      title: `فحص ذاتي — مستجد تنظيمي ${update.code}`,
      period: `${new Date().getFullYear()}`,
      departmentId: deptId,
      dueDate: defaultDue,
      status: "SENT",
      questions,
      deptComment: null,
      reviewNotes: null,
      source: "REG_INTEL",
      regUpdateId: update.id,
      createdAt: db.now(),
      updatedAt: db.now(),
    });
    generated.assessmentIds.push(asmt.id);
    await db.notify({
      title: "فحص ذاتي جديد — مستجد تنظيمي",
      message: `${update.code} — ${update.title}`,
      type: "ASSESSMENT_SENT",
      link: "assessments",
      roleTarget: "DEPT_OWNER",
    });
  }

  // 8) إغلاق دورة المستجد وتسجيل الأثر
  await db.updateRow("regUpdates", update.id, {
    status: "APPROVED",
    reviewedById: store.user?.uid || null,
    reviewedByName: store.user?.name || null,
    reviewedAt: db.now(),
    reviewNotes: options.notes || null,
    regChangeId: rchCode,
    generated,
  });
  await db.audit(
    "APPROVE", "RegUpdate", update.code,
    `اعتماد المستجد التنظيمي ${update.code} ودمجه: ${generated.requirementIds.length} التزام، ` +
      `${generated.riskIds.length} خطر، ${generated.monitoringIds.length} نشاط مراقبة، ` +
      `${generated.findingIds.length} فجوة، ${generated.planItemIds.length} مبادرة خطة`
  );
  await db.notify({
    title: "اعتماد مستجد تنظيمي ودمجه",
    message: `${update.code} — ${update.title}: أُنشئ ${generated.requirementIds.length} التزام و${generated.riskIds.length} خطر مرتبط`,
    type: "REGINTEL_APPROVED",
    link: "regintel",
    roleTarget: "COMPLIANCE_MANAGER",
  });
  await reload(
    "regUpdates", "regChanges", "requirements", "risks", "monitoring",
    "planItems", "findings", "assessments", "notifications"
  );
  return generated;
}

export async function rejectUpdate(update, reason) {
  await db.updateRow("regUpdates", update.id, {
    status: "REJECTED",
    reviewedById: store.user?.uid || null,
    reviewedByName: store.user?.name || null,
    reviewedAt: db.now(),
    reviewNotes: reason || null,
  });
  await db.audit("REVIEW", "RegUpdate", update.code, `استبعاد المستجد ${update.code}: ${reason || "غير منطبق"}`);
  await reload("regUpdates");
}

export async function archiveUpdate(update) {
  await db.updateRow("regUpdates", update.id, { status: "ARCHIVED" });
  await db.audit("UPDATE", "RegUpdate", update.code, `أرشفة المستجد ${update.code}`);
  await reload("regUpdates");
}

// ---------- تشغيل الفحص ----------

// الفحص الفعلي يجري في الخادم لأن جلب مصادر خارجية من المتصفح تمنعه سياسة CORS،
// ولأن حماية SSRF وتحليل DNS لا يمكن فرضهما في المتصفح.
//
// للفحص مساران خادميان، كلاهما يستدعي المحرك نفسه في functions/regintel.js:
//   1) دالة Firebase مجدولة + مسار /api/regintel/scan (يشغّله هذا الزر) — تتطلب خطة Blaze
//   2) مهمة GitHub Actions أسبوعية عبر functions/scan-runner.js — تعمل على الخطة المجانية
// فإن لم تكن الدوال منشورة، يبقى الفحص الأسبوعي عاملاً عبر المسار الثاني.
const SCAN_SERVICE_HINT =
  "خدمة الفحص الفوري غير منشورة على هذا المشروع (تتطلب دوال Firebase على خطة Blaze). " +
  "الفحص الأسبوعي يعمل عبر مهمة GitHub Actions المجدولة، ويمكن تشغيله يدوياً من صفحة Actions في المستودع " +
  "(سير العمل: Regulatory Scan ← Run workflow).";
export async function requestScan({ sourceId = null } = {}) {
  const token = await idToken();
  let res;
  try {
    res = await fetch("/api/regintel/scan", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ sourceId }),
    });
  } catch {
    throw new Error(SCAN_SERVICE_HINT);
  }
  const body = await res.json().catch(() => ({}));
  if (res.status === 404) throw new Error(SCAN_SERVICE_HINT);
  if (res.status === 409) throw new Error(body.error || "هناك فحص قيد التشغيل حالياً — انتظر انتهاءه");
  if (!res.ok) throw new Error(body.error || `تعذّر تشغيل الفحص (HTTP ${res.status})`);
  await reload("regUpdates", "regSources", "regScans", "notifications");
  return body;
}

// ---------- المواعيد التنظيمية (تجميع من المستجدات والوحدات المرتبطة) ----------

export function collectDeadlines() {
  const out = [];
  const add = (date, item) => {
    if (!date) return;
    out.push({ date: String(date).slice(0, 10), ...item });
  };
  for (const u of store.regUpdates) {
    if (u.status === "REJECTED" || u.status === "ARCHIVED") continue;
    for (const d of u.deadlines || []) {
      add(d.date, {
        kind: d.label === "تاريخ النفاذ" ? "EFFECTIVE" : "COMPLIANCE",
        title: d.label || "موعد تنظيمي",
        updateId: u.id,
        updateCode: u.code,
        updateTitle: u.title,
        view: "regintel",
        refCode: u.code,
      });
    }
  }
  for (const r of store.requirements) {
    if (!r.regUpdateId || !r.nextReviewDate) continue;
    add(r.nextReviewDate, {
      kind: "REVIEW",
      title: `استحقاق الالتزام: ${r.title}`,
      updateId: r.regUpdateId,
      updateCode: null,
      updateTitle: null,
      view: "library",
      refCode: r.code,
    });
  }
  for (const f of store.findings) {
    if (!f.regUpdateId || f.status === "CLOSED" || !f.dueDate) continue;
    add(f.dueDate, {
      kind: "ACTION",
      title: `إجراء تصحيحي: ${f.title}`,
      updateId: f.regUpdateId,
      updateCode: null,
      updateTitle: null,
      view: "findings",
      refCode: f.code,
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

// ---------- الإجراءات التنظيمية (من الملاحظات ومبادرات الخطة المرتبطة) ----------

export function collectActions() {
  const rows = [];
  for (const f of store.findings) {
    if (!f.regUpdateId) continue;
    for (const act of f.actions || []) {
      rows.push({
        kind: "FINDING",
        findingId: f.id,
        code: f.code,
        title: act.description,
        parentTitle: f.title,
        departmentId: act.departmentId || f.departmentId || null,
        ownerId: act.ownerId || null,
        dueDate: act.dueDate || f.dueDate || null,
        status: act.status || "OPEN",
        progress: Number(act.progress) || 0,
        evidenceUrl: act.evidenceUrl || null,
        regUpdateId: f.regUpdateId,
        view: "findings",
      });
    }
    if (!(f.actions || []).length) {
      rows.push({
        kind: "FINDING",
        findingId: f.id,
        code: f.code,
        title: f.title,
        parentTitle: f.title,
        departmentId: f.departmentId || null,
        ownerId: null,
        dueDate: f.dueDate || null,
        status: f.status || "OPEN",
        progress: 0,
        evidenceUrl: null,
        regUpdateId: f.regUpdateId,
        view: "findings",
      });
    }
  }
  for (const p of store.planItems) {
    if (!p.regUpdateId) continue;
    rows.push({
      kind: "PLAN",
      findingId: null,
      code: p.id.slice(0, 8),
      title: p.title,
      parentTitle: p.expectedOutput || "",
      departmentId: p.departmentId || null,
      ownerId: p.ownerId || null,
      dueDate: null,
      status: p.status || "NOT_STARTED",
      progress: Number(p.progress) || 0,
      evidenceUrl: p.evidenceUrl || null,
      regUpdateId: p.regUpdateId,
      view: "plan",
    });
  }
  return rows;
}

// ---------- التقرير الأسبوعي ----------

export function buildWeeklyReport(refISO = null) {
  const range = weekRange(refISO);
  const summary = summarizeWeek(store.regUpdates, range);
  const deadlines = collectDeadlines().filter((d) => {
    const t = new Date(`${d.date}T00:00:00Z`).getTime();
    return t >= Date.now() - 7 * 86400000 && t <= Date.now() + 60 * 86400000;
  });
  const actions = collectActions();
  return {
    ...summary,
    upcomingDeadlines: deadlines.slice(0, 30),
    openActions: actions.filter((a) => a.status !== "COMPLETED" && a.status !== "CLOSED").length,
    totalActions: actions.length,
    sourcesActive: store.regSources.filter((s) => s.active !== false).length,
    sourcesTotal: store.regSources.length,
    lastScanAt: store.regScans.length
      ? store.regScans.slice().sort((a, b) => String(b.startedAt || "").localeCompare(String(a.startedAt || "")))[0].startedAt
      : null,
  };
}

export async function saveWeeklyReport(refISO = null) {
  const report = buildWeeklyReport(refISO);
  const id = `WK-${report.to.slice(0, 10)}`;
  await db.setRow("regReports", id, {
    ...report,
    id,
    generatedById: store.user?.uid || null,
    generatedByName: store.user?.name || null,
    generatedAt: db.now(),
    trigger: "MANUAL",
  });
  await db.audit("CREATE", "RegReport", id, `توليد التقرير الأسبوعي للرصد التنظيمي (${report.total} مستجد)`);
  await reload("regReports");
  return { ...report, id };
}
