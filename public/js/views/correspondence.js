// سجل المراسلات مع الجهات التنظيمية — مطابق لقالب «سجل المراسلات»
// وفق دليل السياسات: تسجيل جميع المراسلات الرسمية ومتابعة الردود والإجراءات
import { store, reload, userName, userOptions, authName, authOptions } from "../state.js";
import * as db from "../db.js";
import {
  $, esc, toast, modal, confirmBox, fld, txt, area, sel, dateInp, val,
  fmtDate, isoFromInput, statusBadgeFrom, emptyMsg, keepFocus,
} from "../ui.js";
import { CORR_TYPES, CORR_STATUS } from "../meta.js";
import { canEdit } from "../auth.js";

const ST_ROLE = { SENT: "warning", REPLIED: "good", CLOSED: "neutral" };
const filters = { search: "", status: "", type: "" };

export function renderCorrespondence(el, nav, refresh) {
  const editable = canEdit(store.user);
  const rows = store.correspondence.filter((c) => {
    if (filters.search && !`${c.code} ${c.refNo || ""} ${c.subject}`.includes(filters.search)) return false;
    if (filters.status && c.status !== filters.status) return false;
    if (filters.type && c.type !== filters.type) return false;
    return true;
  });
  const awaiting = store.correspondence.filter((c) => c.status === "SENT").length;

  el.innerHTML = `
    <div class="page-head">
      <h1>📨 سجل المراسلات</h1>
      ${editable ? '<button id="add-corr" title="تسجيل مراسلة مع جهة تنظيمية">＋ مراسلة جديدة</button>' : ""}
    </div>
    <div class="stats">
      <div class="stat"><div class="num">${store.correspondence.length}</div><div class="lbl">إجمالي المراسلات</div></div>
      <div class="stat"><div class="num">${awaiting}</div><div class="lbl">بانتظار الرد</div></div>
      <div class="stat"><div class="num">${store.correspondence.filter((c) => c.status === "CLOSED").length}</div><div class="lbl">مغلقة</div></div>
    </div>
    <section class="card">
      <div class="row filters">
        <input type="text" id="f-search" class="grow" placeholder="بحث…" value="${esc(filters.search)}" />
        ${sel("f-type", CORR_TYPES, filters.type, { empty: "كل الأنواع" })}
        ${sel("f-status", CORR_STATUS, filters.status, { empty: "كل الحالات" })}
      </div>
      <div style="overflow-x:auto">
        <table>
          <thead><tr>
            <th>الرقم</th><th>رقم الصادر</th><th>تاريخ الإرسال</th><th>الجهة التنظيمية</th>
            <th>النوع</th><th>الموضوع</th><th>تاريخ الرد</th><th>المسؤول</th><th>الحالة</th>
          </tr></thead>
          <tbody>
            ${rows
              .map((c) => `<tr class="rowlink" data-open="${c.id}">
                <td><strong>${esc(c.code)}</strong></td>
                <td>${esc(c.refNo || "—")}</td>
                <td>${fmtDate(c.sentDate)}</td>
                <td>${esc(authName(c.authorityId))}</td>
                <td>${esc(CORR_TYPES[c.type] || c.type || "—")}</td>
                <td><strong>${esc(c.subject)}</strong></td>
                <td>${fmtDate(c.replyDate)}</td>
                <td>${esc(userName(c.ownerId))}</td>
                <td>${statusBadgeFrom(CORR_STATUS, c.status, ST_ROLE)}</td>
              </tr>`)
              .join("") || `<tr><td colspan="9">${emptyMsg("لا توجد مراسلات مطابقة")}</td></tr>`}
          </tbody>
        </table>
      </div>
      <p class="muted">عدد النتائج: ${rows.length} من ${store.correspondence.length}</p>
    </section>`;

  const rerender = () => renderCorrespondence(el, nav, refresh);
  $("#f-search", el).addEventListener("input", (e) => { filters.search = e.target.value; keepFocus(rerender); });
  $("#f-type", el).onchange = (e) => { filters.type = e.target.value; rerender(); };
  $("#f-status", el).onchange = (e) => { filters.status = e.target.value; rerender(); };
  $("#add-corr", el)?.addEventListener("click", () => openForm(null, rerender));
  el.querySelectorAll("[data-open]").forEach((tr) =>
    tr.addEventListener("click", () => openDetail(tr.dataset.open, rerender))
  );
}

function openForm(c, done) {
  const isNew = !c;
  const ov = modal(
    `
    <h2>${isNew ? "تسجيل مراسلة جديدة" : `تعديل ${esc(c.code)}`}</h2>
    ${fld("موضوع المراسلة *", txt("c-subject", c?.subject))}
    <div class="form-grid">
      ${fld("رقم الصادر", txt("c-ref", c?.refNo))}
      ${fld("تاريخ الإرسال", dateInp("c-sent", c?.sentDate || (isNew ? new Date().toISOString() : "")))}
      ${fld("الجهة التنظيمية", sel("c-auth", authOptions(), c?.authorityId, { empty: "— اختر —" }))}
      ${fld("نوع المراسلة", sel("c-type", CORR_TYPES, c?.type || "INQUIRY"))}
      ${fld("المسؤول", sel("c-owner", userOptions(), c?.ownerId, { empty: "— اختر —" }))}
      ${fld("الحالة", sel("c-status", CORR_STATUS, c?.status || "SENT"))}
    </div>
    ${fld("ملخص المحتوى", area("c-content", c?.contentSummary, "", 2))}
    ${fld("المستندات المرفقة", txt("c-attach", c?.attachments))}
    ${fld("تاريخ الرد", dateInp("c-replydate", c?.replyDate))}
    ${fld("ملخص الرد", area("c-reply", c?.replySummary, "", 2))}
    ${fld("الإجراء المتخذ", area("c-action", c?.actionTaken, "", 2))}
    <div class="row" style="margin-top:14px">
      <button id="c-save">حفظ</button>
      <button class="secondary" id="c-cancel">إلغاء</button>
    </div>`,
    { wide: true }
  );
  $("#c-cancel", ov).onclick = () => ov.remove();
  $("#c-save", ov).onclick = async () => {
    const subject = val("c-subject", ov);
    if (!subject) return toast("موضوع المراسلة إلزامي", true);
    const replyDate = isoFromInput(val("c-replydate", ov));
    let status = val("c-status", ov);
    if (replyDate && status === "SENT") status = "REPLIED"; // ورد الرد فعلياً
    const data = {
      subject,
      refNo: val("c-ref", ov) || null,
      sentDate: isoFromInput(val("c-sent", ov)) || db.now(),
      authorityId: val("c-auth", ov) || null,
      type: val("c-type", ov),
      ownerId: val("c-owner", ov) || null,
      status,
      contentSummary: val("c-content", ov) || null,
      attachments: val("c-attach", ov) || null,
      replyDate,
      replySummary: val("c-reply", ov) || null,
      actionTaken: val("c-action", ov) || null,
    };
    try {
      if (isNew) {
        const code = await db.nextCode("CRS");
        await db.setRow("correspondence", code, { ...data, code, createdAt: db.now(), updatedAt: db.now() });
        await db.audit("CREATE", "Correspondence", code, `تسجيل مراسلة: ${code} — ${subject}`);
      } else {
        await db.updateRow("correspondence", c.id, data);
        await db.audit("UPDATE", "Correspondence", c.code, `تعديل المراسلة ${c.code}`);
      }
      await reload("correspondence");
      ov.remove();
      toast("تم الحفظ");
      done();
    } catch (err) {
      toast(err.message, true);
    }
  };
}

function openDetail(id, done) {
  const c = store.correspondence.find((x) => x.id === id);
  if (!c) return;
  const editable = canEdit(store.user);
  const ov = modal(
    `
    <div class="row" style="justify-content:space-between">
      <h2>${esc(c.code)} — ${esc(c.subject)}</h2>
      <span>${statusBadgeFrom(CORR_STATUS, c.status, ST_ROLE)}</span>
    </div>
    <div class="detail-grid">
      <div><span class="muted">رقم الصادر</span><br/>${esc(c.refNo || "—")}</div>
      <div><span class="muted">تاريخ الإرسال</span><br/>${fmtDate(c.sentDate)}</div>
      <div><span class="muted">الجهة التنظيمية</span><br/>${esc(authName(c.authorityId))}</div>
      <div><span class="muted">النوع</span><br/>${esc(CORR_TYPES[c.type] || "—")}</div>
      <div><span class="muted">المسؤول</span><br/>${esc(userName(c.ownerId))}</div>
      <div><span class="muted">تاريخ الرد</span><br/>${fmtDate(c.replyDate)}</div>
    </div>
    ${c.contentSummary ? `<p><strong>ملخص المحتوى:</strong> ${esc(c.contentSummary)}</p>` : ""}
    ${c.attachments ? `<p><strong>المرفقات:</strong> ${esc(c.attachments)}</p>` : ""}
    ${c.replySummary ? `<p><strong>ملخص الرد:</strong> ${esc(c.replySummary)}</p>` : ""}
    ${c.actionTaken ? `<p><strong>الإجراء المتخذ:</strong> ${esc(c.actionTaken)}</p>` : ""}
    <div class="row" style="margin-top:14px">
      ${editable ? '<button class="secondary" id="c-edit">تعديل</button><button class="danger" id="c-del">حذف</button>' : ""}
      <button class="secondary" id="c-x">إغلاق</button>
    </div>`,
    { wide: true }
  );
  $("#c-x", ov).onclick = () => ov.remove();
  $("#c-edit", ov)?.addEventListener("click", () => { ov.remove(); openForm(c, done); });
  $("#c-del", ov)?.addEventListener("click", async () => {
    ov.remove();
    if (!(await confirmBox(`حذف المراسلة ${c.code}؟`))) return;
    await db.removeRow("correspondence", c.id);
    await db.audit("DELETE", "Correspondence", c.code, `حذف المراسلة ${c.code}`);
    await reload("correspondence");
    toast("تم الحذف");
    done();
  });
}
