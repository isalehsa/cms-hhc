// محرك سير العمل والاعتماد — مسار قابل للتهيئة: مسودة → مراجعة → اعتماد → مغلق
// مع اتفاقيات مستوى خدمة (SLA) لكل مرحلة وتصعيد آلي عند التجاوز.
// يُبنى على نموذج المهام القائم: كل مسار يمكن ربطه بسجل قائم (متطلب/ملاحظة/تغيّر تنظيمي…).
import { store } from "./state.js";
import * as db from "./db.js";
import { daysUntil, todayISO } from "./ui.js";
import { WF_STAGES, WF_STAGE_ROLE, DEFAULT_WORKFLOW_TEMPLATES } from "./meta.js";

// ---------- القوالب (قابلة للتهيئة عبر appConfig) ----------
export async function loadTemplates() {
  const cfg = await db.getConfig("workflowTemplates", { templates: DEFAULT_WORKFLOW_TEMPLATES });
  return Array.isArray(cfg.templates) && cfg.templates.length ? cfg.templates : DEFAULT_WORKFLOW_TEMPLATES;
}
export const saveTemplates = (templates) => db.setConfig("workflowTemplates", { templates });

// ---------- حسابات المرحلة و SLA ----------
const addDays = (iso, days) => new Date(new Date(iso).getTime() + (Number(days) || 0) * 86400000).toISOString();

// موعد استحقاق المرحلة الحالية = دخول المرحلة + SLA المرحلة
export function dueForStage(stage, slaDays, enteredAt) {
  if (stage === "CLOSED" || stage === "REJECTED") return null;
  const d = slaDays?.[stage];
  return d ? addDays(enteredAt, d) : null;
}

// حالة الـ SLA للمسار الحالي: {role, label, daysLeft}
export function slaStatus(wf) {
  if (["CLOSED", "REJECTED"].includes(wf.stage)) return { role: "good", label: "منتهٍ", daysLeft: null };
  if (!wf.dueAt) return { role: "neutral", label: "بلا SLA", daysLeft: null };
  const d = daysUntil(wf.dueAt);
  if (d < 0) return { role: "critical", label: `متأخر ${-d} يوماً`, daysLeft: d };
  if (d <= 1) return { role: "serious", label: d === 0 ? "يستحق اليوم" : "غداً", daysLeft: d };
  if (d <= 3) return { role: "warning", label: `خلال ${d} أيام`, daysLeft: d };
  return { role: "good", label: `خلال ${d} يوماً`, daysLeft: d };
}

// المرحلة التالية وفق الإجراء
const NEXT = {
  submit: { from: "DRAFT", to: "REVIEW", verb: "إرسال للمراجعة" },
  review: { from: "REVIEW", to: "APPROVE", verb: "اعتماد المراجعة ورفعه للاعتماد" },
  approve: { from: "APPROVE", to: "CLOSED", verb: "الاعتماد النهائي" },
  reject: { to: "DRAFT", verb: "الإعادة إلى المسودة" },
  reopen: { to: "DRAFT", verb: "إعادة الفتح" },
};

// بناء تعديل الانتقال لمرحلة جديدة (يعيد patch للحفظ)
export function transition(wf, action, actor, note = "") {
  const move = NEXT[action];
  if (!move) throw new Error("إجراء غير معروف");
  const to = move.to;
  const enteredAt = db.now();
  const entry = { stage: to, action, byId: actor?.uid || null, byName: actor?.name || null, at: enteredAt, note: note || "" };
  return {
    stage: to,
    stageEnteredAt: enteredAt,
    dueAt: dueForStage(to, wf.slaDays, enteredAt),
    escalated: false,
    closedAt: to === "CLOSED" ? enteredAt : null,
    history: [...(wf.history || []), entry],
  };
}

export const actionVerb = (a) => NEXT[a]?.verb || a;

// ---------- إنشاء مسار من قالب ----------
export async function createWorkflow(fields, template, actor) {
  const code = await db.nextCode("WF");
  const enteredAt = db.now();
  const wf = {
    code,
    title: fields.title,
    description: fields.description || "",
    templateId: template.id,
    templateName: template.name,
    slaDays: { ...template.slaDays },
    linkType: fields.linkType || "none",
    linkId: fields.linkId || null,
    linkLabel: fields.linkLabel || "",
    linkView: fields.linkView || null,
    priority: fields.priority || "NORMAL",
    reviewerId: fields.reviewerId || null,
    approverId: fields.approverId || null,
    stage: "DRAFT",
    stageEnteredAt: enteredAt,
    dueAt: dueForStage("DRAFT", template.slaDays, enteredAt),
    escalated: false,
    closedAt: null,
    history: [{ stage: "DRAFT", action: "create", byId: actor?.uid || null, byName: actor?.name || null, at: enteredAt, note: "" }],
    createdById: actor?.uid || null,
    createdAt: enteredAt,
    updatedAt: enteredAt,
  };
  await db.setRow("workflows", code, wf);
  await db.audit("CREATE", "Workflow", code, `إنشاء مسار اعتماد: ${code} — ${fields.title}`);
  return wf;
}

// ---------- التصعيد الآلي عند تجاوز SLA ----------
// يُشغَّل عند دخول المحرر: يُنبّه المعتمِد ومدير الالتزام مرة واحدة لكل مرحلة متأخرة
export async function scanWorkflowEscalations() {
  const today = todayISO();
  const existing = new Set((store.notifications || []).map((n) => n.dedupeKey).filter(Boolean));
  let escalated = 0;
  for (const wf of store.workflows || []) {
    if (["CLOSED", "REJECTED"].includes(wf.stage)) continue;
    if (!wf.dueAt || daysUntil(wf.dueAt) >= 0) continue; // ليس متأخراً بعد
    if (wf.escalated) continue;
    const key = `wf:esc:${wf.code}:${wf.stage}:${today}`;
    if (existing.has(key)) continue;
    existing.add(key);
    await db.updateRow("workflows", wf.id, { escalated: true }).catch(() => {});
    await db.notify({
      title: "⏱ تصعيد مسار اعتماد",
      message: `${wf.code} — ${wf.title}: تجاوز مرحلة «${WF_STAGES[wf.stage]}» موعدها (SLA)`,
      type: "WF_ESCALATION",
      link: "workflow",
      roleTarget: "COMPLIANCE_MANAGER",
      dedupeKey: key,
    });
    escalated++;
  }
  return escalated;
}

// دور لوني للمرحلة (للاستخدام في الواجهة)
export const stageRole = (stage) => WF_STAGE_ROLE[stage] || "neutral";
