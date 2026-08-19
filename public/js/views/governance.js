// حوكمة البيانات والخصوصية — تصنيف البيانات وجدول الاحتفاظ والتخلّص،
// ومواءمة مع نظام حماية البيانات الشخصية (PDPL) وضوابط الأمن السيبراني (NCA ECC).
import { store, reload } from "../state.js";
import * as db from "../db.js";
import {
  $, esc, toast, modal, confirmBox, fld, txt, sel, num, val, fmtDate, emptyMsg,
} from "../ui.js";
import { canEdit } from "../auth.js";

// مستويات تصنيف البيانات (بحسب أدلة تصنيف البيانات الوطنية و NCA)
const CLASSES = {
  PUBLIC: { label: "عام", role: "good", desc: "لا يضر الإفصاح عنه — متاح للعموم." },
  INTERNAL: { label: "داخلي", role: "warning", desc: "للاستخدام الداخلي؛ إفصاحه غير المصرّح به أثره محدود." },
  CONFIDENTIAL: { label: "سري", role: "serious", desc: "يشمل بيانات شخصية؛ إفصاحه يسبب ضرراً ملموساً." },
  SECRET: { label: "سري للغاية", role: "critical", desc: "بيانات شخصية حساسة أو حرجة؛ إفصاحه يسبب ضرراً جسيماً." },
};

// جدول الاحتفاظ الافتراضي (قابل للتعديل) — يغطّي مجموعات النظام
const DEFAULT_RETENTION = [
  { recordType: "المتطلبات والمكتبة", collection: "requirements", classification: "INTERNAL", personalData: false, retentionYears: 10, legalBasis: "متطلب تنظيمي (ISO 37301)", disposal: "أرشفة" },
  { recordType: "سجل المخاطر", collection: "risks", classification: "CONFIDENTIAL", personalData: false, retentionYears: 7, legalBasis: "الحوكمة الداخلية", disposal: "أرشفة" },
  { recordType: "الملاحظات والتصحيح", collection: "findings", classification: "CONFIDENTIAL", personalData: true, retentionYears: 7, legalBasis: "PDPL م.18", disposal: "حذف آمن" },
  { recordType: "الإفصاحات وتعارض المصالح", collection: "disclosures", classification: "SECRET", personalData: true, retentionYears: 7, legalBasis: "PDPL م.18 (بيانات حساسة)", disposal: "حذف آمن" },
  { recordType: "المراسلات", collection: "correspondence", classification: "CONFIDENTIAL", personalData: true, retentionYears: 5, legalBasis: "متطلب تنظيمي", disposal: "أرشفة ثم حذف" },
  { recordType: "التدقيق الداخلي وأوراق العمل", collection: "audits", classification: "CONFIDENTIAL", personalData: false, retentionYears: 10, legalBasis: "معايير التدقيق", disposal: "أرشفة" },
  { recordType: "محاضر الاجتماعات", collection: "meetings", classification: "INTERNAL", personalData: true, retentionYears: 5, legalBasis: "الحوكمة الداخلية", disposal: "أرشفة" },
  { recordType: "المستخدمون والصلاحيات", collection: "users", classification: "SECRET", personalData: true, retentionYears: 2, legalBasis: "PDPL + NCA ECC 2-2", disposal: "حذف عند إنهاء الخدمة" },
  { recordType: "سجل التدقيق (Audit Trail)", collection: "auditLog", classification: "CONFIDENTIAL", personalData: true, retentionYears: 10, legalBasis: "NCA ECC 2-3", disposal: "احتفاظ إلزامي (غير قابل للتعديل)" },
];

// مواءمة ميزات النظام مع ضوابط PDPL و NCA ECC (استرشادية)
const CONTROL_MAP = [
  ["سجل تدقيق غير قابل للتعديل", "NCA ECC 2-3 · PDPL المساءلة", "قواعد Firestore تمنع تعديل/حذف auditLog"],
  ["التحكم بالصلاحيات حسب الدور (RBAC)", "NCA ECC 2-2 · إدارة الهويات والصلاحيات", "أدوار وقواعد أمان لكل مجموعة"],
  ["التحقق بخطوتين (MFA)", "NCA ECC 2-2-3", "TOTP عبر Identity Platform"],
  ["الدخول الموحّد (SSO)", "NCA ECC 2-2", "OIDC/SAML عبر Identity Platform"],
  ["تشفير النقل", "NCA ECC 2-8", "HTTPS إلزامي عبر الاستضافة"],
  ["تصنيف البيانات والاحتفاظ", "NCA ECC 2-7 · PDPL م.18", "هذه الشاشة وجدول الاحتفاظ"],
  ["حقوق صاحب البيانات (الوصول/التصحيح/الحذف)", "PDPL م.4-9", "إدارة السجلات وإجراءات الحذف الآمن"],
  ["الإبلاغ عن تسريب البيانات", "PDPL م.20 · NCA ECC 2-13", "إجراء تصعيد وإخطار موثّق"],
];

export async function renderGovernance(el, nav, refresh) {
  const editable = canEdit(store.user);
  el.innerHTML = `<div class="page-head"><h1>🛡 حوكمة البيانات والخصوصية</h1></div><section class="card">${'<p class="muted">جاري التحميل…</p>'}</section>`;

  const cfg = await db.getConfig("dataGovernance", {});
  const retention = Array.isArray(cfg.retention) && cfg.retention.length ? cfg.retention : DEFAULT_RETENTION;

  el.innerHTML = `
    <div class="page-head">
      <h1>🛡 حوكمة البيانات والخصوصية</h1>
      ${editable ? '<button id="gov-print" class="secondary" title="طباعة جدول الاحتفاظ">🖨 طباعة الجدول</button>' : ""}
    </div>
    <p class="muted">مواءمة مع نظام حماية البيانات الشخصية (PDPL) وضوابط الأمن السيبراني الأساسية (NCA ECC). التصنيفات والمدد استرشادية تُقرّها الجهة.</p>

    <section class="card">
      <h2>مستويات تصنيف البيانات</h2>
      <div class="stats">
        ${Object.entries(CLASSES).map(([, c]) => `<div class="stat"><div class="lbl"><span class="lvl lvl-${c.role}"><span class="dot"></span>${esc(c.label)}</span></div><div class="sub muted">${esc(c.desc)}</div></div>`).join("")}
      </div>
    </section>

    <section class="card">
      <div class="row" style="justify-content:space-between;align-items:flex-start">
        <h2>جدول الاحتفاظ والتخلّص من البيانات</h2>
        ${editable ? '<button id="gov-add" class="secondary small">＋ سجل</button>' : ""}
      </div>
      <div style="overflow-x:auto">
        <table>
          <thead><tr><th>نوع السجل</th><th>التصنيف</th><th>بيانات شخصية</th><th>مدة الاحتفاظ</th><th>الأساس النظامي</th><th>التخلّص</th>${editable ? "<th></th>" : ""}</tr></thead>
          <tbody>
            ${retention.map((r, i) => `<tr>
              <td><strong>${esc(r.recordType)}</strong><div class="muted" style="font-size:0.76rem">${esc(r.collection || "")}</div></td>
              <td><span class="lvl lvl-${CLASSES[r.classification]?.role || "neutral"}"><span class="dot"></span>${esc(CLASSES[r.classification]?.label || r.classification)}</span></td>
              <td>${r.personalData ? "نعم" : "لا"}</td>
              <td>${esc(r.retentionYears)} سنوات</td>
              <td class="muted">${esc(r.legalBasis || "")}</td>
              <td class="muted">${esc(r.disposal || "")}</td>
              ${editable ? `<td><button class="secondary small" data-edit="${i}">تعديل</button> <button class="danger small" data-del="${i}">✕</button></td>` : ""}
            </tr>`).join("") || `<tr><td colspan="${editable ? 7 : 6}">${emptyMsg("لا توجد سجلات")}</td></tr>`}
          </tbody>
        </table>
      </div>
      ${!cfg.retention ? '<p class="muted">هذا الجدول افتراضي — عدّله ليُحفظ في إعدادات النظام.</p>' : `<p class="muted">آخر تحديث: ${fmtDate(cfg.updatedAt)}</p>`}
    </section>

    <section class="card">
      <h2>مواءمة الضوابط (PDPL · NCA ECC)</h2>
      <div style="overflow-x:auto">
        <table>
          <thead><tr><th>الضابط في النظام</th><th>المرجع</th><th>آلية التطبيق</th></tr></thead>
          <tbody>${CONTROL_MAP.map(([a, b, c]) => `<tr><td><strong>${esc(a)}</strong></td><td class="muted">${esc(b)}</td><td>${esc(c)}</td></tr>`).join("")}</tbody>
        </table>
      </div>
      <p class="muted">المواءمة استرشادية لدعم الامتثال ولا تُغني عن تقييم رسمي.</p>
    </section>`;

  const rerender = () => renderGovernance(el, nav, refresh);
  const save = async (list) => {
    await db.setConfig("dataGovernance", { retention: list });
    await db.audit("UPDATE", "Config", "dataGovernance", "تعديل جدول الاحتفاظ وتصنيف البيانات");
    await reload("notifications").catch(() => {});
    toast("حُفظ الجدول");
    rerender();
  };
  $("#gov-add", el)?.addEventListener("click", () => openRow(null, retention, save));
  el.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => openRow(Number(b.dataset.edit), retention, save)));
  el.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", async () => {
    if (!(await confirmBox("حذف هذا السجل من الجدول؟"))) return;
    const list = retention.filter((_, i) => i !== Number(b.dataset.del));
    save(list);
  }));
  $("#gov-print", el)?.addEventListener("click", () => printSchedule(retention));
}

function openRow(idx, list, save) {
  const r = idx === null ? {} : list[idx];
  const ov = modal(`
    <h2>${idx === null ? "إضافة سجل احتفاظ" : "تعديل سجل احتفاظ"}</h2>
    <div class="form-grid">
      ${fld("نوع السجل *", txt("g-type", r.recordType))}
      ${fld("المجموعة (collection)", txt("g-col", r.collection))}
      ${fld("التصنيف", sel("g-class", Object.fromEntries(Object.entries(CLASSES).map(([k, c]) => [k, c.label])), r.classification || "INTERNAL"))}
      ${fld("بيانات شخصية", sel("g-pd", { yes: "نعم", no: "لا" }, r.personalData ? "yes" : "no"))}
      ${fld("مدة الاحتفاظ (سنوات)", num("g-years", r.retentionYears ?? 5, 0, 100))}
      ${fld("الأساس النظامي", txt("g-basis", r.legalBasis))}
      ${fld("إجراء التخلّص", txt("g-disp", r.disposal))}
    </div>
    <div class="row" style="margin-top:14px">
      <button id="g-save">حفظ</button>
      <button class="secondary" id="g-cancel">إلغاء</button>
    </div>`, { wide: true });
  $("#g-cancel", ov).onclick = () => ov.remove();
  $("#g-save", ov).onclick = () => {
    const recordType = val("g-type", ov);
    if (!recordType) return toast("نوع السجل إلزامي", true);
    const row = {
      recordType, collection: val("g-col", ov),
      classification: val("g-class", ov), personalData: val("g-pd", ov) === "yes",
      retentionYears: Number(val("g-years", ov)) || 0, legalBasis: val("g-basis", ov), disposal: val("g-disp", ov),
    };
    const next = idx === null ? [...list, row] : list.map((x, i) => (i === idx ? row : x));
    ov.remove();
    save(next);
  };
}

function printSchedule(retention) {
  const rows = retention.map((r) => `<tr><td>${esc(r.recordType)}</td><td>${esc(CLASSES[r.classification]?.label || r.classification)}</td><td>${r.personalData ? "نعم" : "لا"}</td><td>${esc(r.retentionYears)} سنوات</td><td>${esc(r.legalBasis || "")}</td><td>${esc(r.disposal || "")}</td></tr>`).join("");
  const html = `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8" /><title>جدول الاحتفاظ من البيانات</title>
    <style>body{font-family:Tahoma,sans-serif;color:#14251f;padding:28px}h1{color:#0d5243}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:6px 10px;text-align:right;font-size:0.9rem}@media print{button{display:none}}</style>
    </head><body><h1>جدول الاحتفاظ والتخلّص من البيانات — CMS</h1>
    <p>مواءمة مع PDPL و NCA ECC — استرشادي.</p>
    <table><thead><tr><th>نوع السجل</th><th>التصنيف</th><th>بيانات شخصية</th><th>الاحتفاظ</th><th>الأساس النظامي</th><th>التخلّص</th></tr></thead><tbody>${rows}</tbody></table>
    <script>window.onload=function(){window.print();};<\/script></body></html>`;
  const w = window.open("", "_blank");
  if (!w) return toast("مانع النوافذ يمنع الطباعة", true);
  w.document.write(html); w.document.close();
}
