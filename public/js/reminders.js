// محرك التنبيهات الآلية — يفحص كل الاستحقاقات القريبة والمتأخرة عبر جميع الوحدات
// ويولّد تنبيهات داخل النظام (لا تتكرر خلال اليوم) وملخّصاً بريدياً اختيارياً.
// المصدر الوحيد للاستحقاقات هو السجلات نفسها (متطلبات/مراقبة/مخاطر/ملاحظات/فحوصات/مراسلات/تدريب/اجتماعات)
// فلا تُنشأ نسخ مهام موازية — يبقى نموذج المهمة مصدراً واحداً للحقيقة.
import { store } from "./state.js";
import * as db from "./db.js";
import { daysUntil, todayISO, fmtDate } from "./ui.js";
import { APPROVER_ROLES } from "./meta.js";

// عتبات «يستحق قريباً» بالأيام لكل نوع — قابلة للتهيئة من إعدادات النظام
export const DEFAULT_DUE_SOON = {
  requirement: 30,
  monitoring: 14,
  risk: 14,
  finding: 14,
  assessment: 7,
  correspondence: 7,
  training: 14,
  meeting: 3,
};

// جامع الاستحقاقات من كل الوحدات → عناصر موحّدة {kind, icon, code, title, date, view, ownerDeptId}
function collectDeadlines() {
  const out = [];
  const add = (kind, icon, code, title, date, view, ownerDeptId = null) => {
    if (!date) return;
    out.push({ kind, icon, code: code || "", title: title || "", date: String(date).slice(0, 10), view, ownerDeptId });
  };
  for (const r of store.requirements) if (r.status !== "CANCELLED") add("requirement", "📖", r.code, `مراجعة المتطلب: ${r.title}`, r.nextReviewDate, "library", r.ownerDeptId);
  for (const m of store.monitoring) if (!["COMPLETED", "CLOSED"].includes(m.status)) add("monitoring", "🔍", m.code, `نهاية نشاط المراقبة: ${m.name}`, m.endDate, "monitoring", m.ownerDeptId);
  for (const r of store.risks) if (["OPEN", "IN_TREATMENT"].includes(r.status)) add("risk", "⚠", r.code, `استحقاق معالجة الخطر: ${r.title}`, r.dueDate, "risks", r.ownerDeptId);
  for (const f of store.findings) if (f.status !== "CLOSED") add("finding", "🛠", f.code, `استحقاق خطة التصحيح: ${f.title}`, f.dueDate, "findings", f.departmentId);
  for (const a of store.assessments) if (["SENT", "SUBMITTED"].includes(a.status)) add("assessment", "📋", a.code || "", `استحقاق الفحص الذاتي: ${a.title}`, a.dueDate, "assessments", a.departmentId);
  for (const c of store.correspondence) if (c.status === "OPEN") add("correspondence", "📨", c.code, `استحقاق الرد على المراسلة: ${c.subject}`, c.dueDate, "correspondence", c.departmentId);
  for (const t of store.trainings) if (["PLANNED", "IN_PROGRESS"].includes(t.status)) add("training", "🎓", t.code, `نشاط تدريب/توعية: ${t.title}`, t.dueDate || t.date, "training", t.departmentId);
  for (const mt of store.cmeetings || []) if (mt.status !== "CANCELLED" && mt.status !== "APPROVED") add("meeting", "🗓", mt.code || "", `اجتماع: ${mt.title}`, mt.startAt, "cmeetings", mt.departmentId);
  return out;
}

// تصنيف كل استحقاق: overdue (متأخر) أو soon (قريب ضمن العتبة) أو null (بعيد)
function classify(item, thresholds) {
  const d = daysUntil(item.date);
  if (d === null) return null;
  const limit = thresholds[item.kind] ?? DEFAULT_DUE_SOON[item.kind] ?? 14;
  if (d < 0) return { bucket: "overdue", days: d };
  if (d <= limit) return { bucket: "soon", days: d };
  return null;
}

function itemText(item, cls) {
  const d = cls.days;
  const when = cls.bucket === "overdue" ? `متأخر ${-d} يوماً` : d === 0 ? "يستحق اليوم" : `يستحق خلال ${d} يوماً`;
  return `${item.code ? item.code + " — " : ""}${item.title} (${when})`;
}

// ---------- التنبيهات داخل النظام (بلا تكرار خلال اليوم) ----------
async function generateInApp(active) {
  const today = todayISO();
  const existing = new Set((store.notifications || []).map((n) => n.dedupeKey).filter(Boolean));
  let created = 0;
  for (const { item, cls } of active) {
    // مفتاح ثابت لكل عنصر لكل تصنيف لكل يوم → تنبيه واحد على الأكثر يومياً
    const key = `rem:${item.kind}:${item.code || item.title}:${cls.bucket}:${today}`;
    if (existing.has(key)) continue;
    existing.add(key);
    await db.notify({
      title: cls.bucket === "overdue" ? `${item.icon} استحقاق متأخر` : `${item.icon} استحقاق قريب`,
      message: itemText(item, cls),
      type: "REMINDER",
      link: item.view,
      roleTarget: "COMPLIANCE_MANAGER",
      dedupeKey: key,
    });
    created++;
  }
  return created;
}

// ---------- الملخّص البريدي اليومي (اختياري، متوافق مع إضافة Trigger Email) ----------
function digestHtml(overdue, soon) {
  const list = (arr) =>
    arr.length
      ? `<ul style="padding-inline-start:18px;margin:6px 0">${arr
          .map((x) => `<li style="margin:3px 0">${x.item.icon} <b>${x.item.code || ""}</b> ${x.item.title} — <span style="color:${x.cls.bucket === "overdue" ? "#b3402e" : "#b8860b"}">${x.cls.bucket === "overdue" ? `متأخر ${-x.cls.days} يوماً` : x.cls.days === 0 ? "يستحق اليوم" : `خلال ${x.cls.days} يوماً`}</span> · ${fmtDate(x.item.date)}</li>`)
          .join("")}</ul>`
      : '<p style="color:#5d6c66">لا يوجد</p>';
  return `<div dir="rtl" style="font-family:'Segoe UI',Tahoma,sans-serif;color:#14251f;max-width:640px">
    <h2 style="color:#0d5243">تنبيهات الالتزام — ${fmtDate(todayISO())}</h2>
    <h3 style="color:#b3402e;margin-bottom:2px">⚠ استحقاقات متأخرة (${overdue.length})</h3>
    ${list(overdue)}
    <h3 style="color:#0d5243;margin-bottom:2px">⏳ استحقاقات قريبة (${soon.length})</h3>
    ${list(soon)}
    <p style="color:#5d6c66;font-size:12px;margin-top:16px">رسالة آلية من نظام إدارة الالتزام (CMS) — لا تتطلب رداً.</p>
  </div>`;
}

async function generateEmail(overdue, soon) {
  const today = todayISO();
  const recipients = (store.users || []).filter(
    (u) => u.active !== false && u.email && APPROVER_ROLES.includes(String(u.role || "").toUpperCase())
  );
  if (!recipients.length) return 0;
  const html = digestHtml(overdue, soon);
  const subject = `تنبيهات الالتزام — ${overdue.length} متأخر و${soon.length} قريب (${fmtDate(today)})`;
  let sent = 0;
  for (const u of recipients) {
    // معرّف ثابت لكل مستخدم لكل يوم يمنع إرسال الملخّص أكثر من مرة
    const ok = await db.queueEmail(`digest_${u.id}_${today}`, u.email, subject, html);
    if (ok) sent++;
  }
  return sent;
}

let ran = false;

// يُشغَّل مرة واحدة بعد الدخول (للمحررين) — لا يعطّل الواجهة، ويُبلّغ بالملخّص فقط
export async function runReminders(force = false) {
  if (ran && !force) return { inApp: 0, emails: 0, overdue: 0, soon: 0 };
  ran = true;
  const cfg = await db.getConfig("reminders", { emailEnabled: false, dueSoonDays: {} });
  const thresholds = { ...DEFAULT_DUE_SOON, ...(cfg.dueSoonDays || {}) };

  const active = [];
  for (const item of collectDeadlines()) {
    const cls = classify(item, thresholds);
    if (cls) active.push({ item, cls });
  }
  const overdue = active.filter((x) => x.cls.bucket === "overdue").sort((a, b) => a.cls.days - b.cls.days);
  const soon = active.filter((x) => x.cls.bucket === "soon").sort((a, b) => a.cls.days - b.cls.days);

  const inApp = await generateInApp([...overdue, ...soon]).catch(() => 0);
  let emails = 0;
  if (cfg.emailEnabled && active.length) emails = await generateEmail(overdue, soon).catch(() => 0);

  return { inApp, emails, overdue: overdue.length, soon: soon.length };
}

// إرسال الملخّص البريدي فوراً بطلب صريح من المدير (يتجاهل مفتاح التفعيل)
export async function sendDigestNow() {
  const { overdue, soon } = currentDigest();
  return generateEmail(overdue, soon);
}

// قائمة المستلمين (المعتمِدون النشطون بعناوين بريد) — لرابط mailto الاحتياطي وعرض الإعدادات
export function digestRecipients() {
  return (store.users || [])
    .filter((u) => u.active !== false && u.email && APPROVER_ROLES.includes(String(u.role || "").toUpperCase()))
    .map((u) => u.email);
}

// ملخّص الاستحقاقات الحالي (لواجهة الإعدادات وزر «إرسال الآن»)
export function currentDigest() {
  const active = [];
  for (const item of collectDeadlines()) {
    const cls = classify(item, DEFAULT_DUE_SOON);
    if (cls) active.push({ item, cls });
  }
  return {
    overdue: active.filter((x) => x.cls.bucket === "overdue").sort((a, b) => a.cls.days - b.cls.days),
    soon: active.filter((x) => x.cls.bucket === "soon").sort((a, b) => a.cls.days - b.cls.days),
  };
}

// رابط mailto احتياطي عندما لا تكون إضافة البريد مفعّلة — يفتح بريد المستخدم بالملخّص جاهزاً
export function digestMailto(recipientsCsv) {
  const { overdue, soon } = currentDigest();
  const line = (x) => `• ${x.item.code || ""} ${x.item.title} — ${x.cls.bucket === "overdue" ? `متأخر ${-x.cls.days} يوماً` : x.cls.days === 0 ? "يستحق اليوم" : `خلال ${x.cls.days} يوماً`} (${fmtDate(x.item.date)})`;
  const body =
    `تنبيهات الالتزام — ${fmtDate(todayISO())}\n\n` +
    `استحقاقات متأخرة (${overdue.length}):\n${overdue.map(line).join("\n") || "لا يوجد"}\n\n` +
    `استحقاقات قريبة (${soon.length}):\n${soon.map(line).join("\n") || "لا يوجد"}\n`;
  const subject = `تنبيهات الالتزام — ${overdue.length} متأخر و${soon.length} قريب`;
  return `mailto:${encodeURIComponent(recipientsCsv || "")}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
