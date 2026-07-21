// سجل المراسلات — الخطابات الواردة والصادرة مع الجهات التنظيمية
// مرتبط بمكتبة الالتزام والإدارات، مع تتبع استحقاق الرد والتنبيه على التأخر
import { store, reload, deptName, authName, userName, reqLabel, deptOptions, authOptions, userOptions, reqOptions } from "../state.js";
import * as db from "../db.js";
import {
  $, esc, safeUrl, toast, modal, confirmBox, fld, txt, area, sel, dateInp, val,
  fmtDate, daysUntil, isoFromInput, statusBadgeFrom, emptyMsg, keepFocus,
} from "../ui.js";
import { COR_DIRECTION, COR_PRIORITY, COR_STATUS } from "../meta.js";
import { canEdit } from "../auth.js";

const ST_ROLE = { OPEN: "warning", REPLIED: "good", CLOSED: "neutral" };
const DIR_ROLE = { INCOMING: "serious", OUTGOING: "good" };
const PR_ROLE = { NORMAL: "neutral", URGENT: "critical", CONFIDENTIAL: "warning" };

const filters = { search: "", direction: "", status: "", authority: "", dept: "" };

export function renderCorrespondence(el, nav, refresh) {
  const editable = canEdit(store.user);
  const rows = store.correspondence.filter((c) => {
    if (filters.search && !`${c.code} ${c.subject} ${c.refNumber || ""} ${c.summary || ""}`.includes(filters.search)) return false;
    if (filters.direction && c.direction !== filters.direction) return false;
    if (filters.status && c.status !== filters.status) return false;
    if (filters.authority && c.authorityId !== filters.authority) return false;
    if (filters.dept && c.ownerDeptId !== filters.dept) return false;
    return true;
  });

  const open = store.correspondence.filter((c) => c.status === "OPEN");
  const overdue = open.filter((c) => c.dueDate && daysUntil(c.dueDate) < 0);

  el.innerHTML = `
    <div class="page-head">
      <h1>📨 سجل المراسلات</h1>
      ${editable ? '<button id="add-cor" title="تسجيل مراسلة جديدة واردة أو صادرة">＋ مراسلة جديدة</button>' : ""}
    </div>
    <div class="stats">
      <div class="stat"><div class="num">${store.correspondence.length}</div><div class="lbl">إجمالي المراسلات</div></div>
      <div class="stat"><div class="num">${store.correspondence.filter((c) => c.direction === "INCOMING").length}</div><div class="lbl">واردة</div></div>
      <div class="stat"><div class="num">${store.correspondence.filter((c) => c.direction === "OUTGOING").length}</div><div class="lbl">صادرة</div></div>
      <div class="stat"><div class="num">${open.length}</div><div class="lbl">قيد المعالجة</div></div>
      <div class="stat"><div class="num">${overdue.length}</div><div class="lbl">رد متأخر</div>
        ${overdue.length ? '<div class="sub"><span class="lvl lvl-critical"><span class="dot"></span>تتطلب إجراءً</span></div>' : ""}</div>
    </div>
    <section class="card">
      <div class="row filters">
        <input type="text" id="f-search" class="grow" placeholder="بحث بالرمز أو الموضوع أو الرقم المرجعي…" value="${esc(filters.search)}" />
        ${sel("f-dir", COR_DIRECTION, filters.direction, { empty: "واردة وصادرة" })}
        ${sel("f-status", COR_STATUS, filters.status, { empty: "كل الحالات" })}
        ${sel("f-auth", authOptions(), filters.authority, { empty: "كل الجهات" })}
        ${sel("f-dept", deptOptions(), filters.dept, { empty: "كل الإدارات" })}
      </div>
      <div style="overflow-x:auto">
        <table>
          <thead><tr>
            <th>الرقم</th><th>الموضوع</th><th>الاتجاه</th><th>الجهة</th><th>تاريخ الخطاب</th>
            <th>استحقاق الرد</th><th>الإدارة المعنية</th><th>الأولوية</th><th>الحالة</th>
          </tr></thead>
          <tbody>
            ${rows
              .map((c) => {
                const d = daysUntil(c.dueDate);
                const late = c.status === "OPEN" && d !== null && d < 0;
                return `<tr class="rowlink" data-open="${c.id}">
                  <td><strong>${esc(c.code)}</strong>${c.refNumber ? `<div class="muted">مرجع: ${esc(c.refNumber)}</div>` : ""}</td>
                  <td><strong>${esc(c.subject)}</strong><div class="muted clamp">${esc(c.summary || "")}</div></td>
                  <td>${statusBadgeFrom(COR_DIRECTION, c.direction, DIR_ROLE)}</td>
                  <td>${esc(authName(c.authorityId))}</td>
                  <td>${fmtDate(c.date)}</td>
                  <td>${fmtDate(c.dueDate)}${late ? ' <span class="lvl lvl-critical"><span class="dot"></span>متأخر</span>' : c.status === "OPEN" && d !== null && d <= 3 ? ' <span class="lvl lvl-warning"><span class="dot"></span>قريب</span>' : ""}</td>
                  <td>${esc(deptName(c.ownerDeptId))}</td>
                  <td>${statusBadgeFrom(COR_PRIORITY, c.priority || "NORMAL", PR_ROLE)}</td>
                  <td>${statusBadgeFrom(COR_STATUS, c.status, ST_ROLE)}</td>
                </tr>`;
              })
              .join("") || `<tr><td colspan="9">${emptyMsg("لا توجد مراسلات مطابقة")}</td></tr>`}
          </tbody>
        </table>
      </div>
      <p class="muted">عدد النتائج: ${rows.length} من ${store.correspondence.length}</p>
    </section>`;

  const rerender = () => renderCorrespondence(el, nav, refresh);
  $("#f-search", el).addEventListener("input", (e) => { filters.search = e.target.value; keepFocus(rerender); });
  $("#f-dir", el).onchange = (e) => { filters.direction = e.target.value; rerender(); };
  $("#f-status", el).onchange = (e) => { filters.status = e.target.value; rerender(); };
  $("#f-auth", el).onchange = (e) => { filters.authority = e.target.value; rerender(); };
  $("#f-dept", el).onchange = (e) => { filters.dept = e.target.value; rerender(); };
  $("#add-cor", el)?.addEventListener("click", () => openForm(null, rerender));
  el.querySelectorAll("[data-open]").forEach((tr) =>
    tr.addEventListener("click", () => openDetail(tr.dataset.open, nav, rerender))
  );
}

function openForm(cor, done) {
  const isNew = !cor;
  const ov = modal(
    `
    <h2>${isNew ? "تسجيل مراسلة جديدة" : `تعديل ${esc(cor.code)}`}</h2>
    <div class="form-grid">
      ${fld("موضوع المراسلة *", txt("c-subject", cor?.subject))}
      ${fld("الاتجاه", sel("c-dir", COR_DIRECTION, cor?.direction || "INCOMING"))}
      ${fld("الجهة", sel("c-auth", authOptions(), cor?.authorityId, { empty: "— اختر —" }))}
      ${fld("الرقم المرجعي للخطاب", txt("c-ref", cor?.refNumber, "مثال: 45/1234"))}
      ${fld("تاريخ الخطاب", dateInp("c-date", cor?.date))}
      ${fld("تاريخ استحقاق الرد", dateInp("c-due", cor?.dueDate))}
      ${fld("الإدارة المعنية", sel("c-dept", deptOptions(), cor?.ownerDeptId, { empty: "— اختر —" }))}
      ${fld("المسؤول عن المتابعة", sel("c-owner", userOptions(), cor?.assigneeId, { empty: "— اختر —" }))}
      ${fld("المتطلب المرتبط", sel("c-req", reqOptions(), cor?.requirementId, { empty: "— بلا ربط —" }))}
      ${fld("الأولوية", sel("c-priority", COR_PRIORITY, cor?.priority || "NORMAL"))}
      ${fld("الحالة", sel("c-status", COR_STATUS, cor?.status || "OPEN"))}
      ${fld("رابط المرفق (اختياري)", txt("c-attach", cor?.attachmentUrl || "", "https://…"))}
    </div>
    ${fld("ملخص المحتوى", area("c-summary", cor?.summary, "", 3))}
    ${fld("الرد / الإجراء المتخذ", area("c-reply", cor?.replyNotes, "", 3))}
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
    const data = {
      subject,
      direction: val("c-dir", ov),
      authorityId: val("c-auth", ov) || null,
      refNumber: val("c-ref", ov) || null,
      date: isoFromInput(val("c-date", ov)),
      dueDate: isoFromInput(val("c-due", ov)),
      ownerDeptId: val("c-dept", ov) || null,
      assigneeId: val("c-owner", ov) || null,
      requirementId: val("c-req", ov) || null,
      priority: val("c-priority", ov),
      status: val("c-status", ov),
      attachmentUrl: val("c-attach", ov) || null,
      summary: val("c-summary", ov),
      replyNotes: val("c-reply", ov),
    };
    try {
      if (isNew) {
        const code = await db.nextCode("COR");
        await db.setRow("correspondence", code, { ...data, code, createdById: store.user.uid, createdAt: db.now(), updatedAt: db.now() });
        await db.audit("CREATE", "Correspondence", code, `تسجيل مراسلة: ${code} — ${subject}`);
        if (data.priority === "URGENT" && data.direction === "INCOMING") {
          await db.notify({
            title: "مراسلة واردة عاجلة",
            message: `${code} — ${subject}${data.dueDate ? ` (الرد مستحق ${fmtDate(data.dueDate)})` : ""}`,
            type: "COR_URGENT",
            link: "correspondence",
            roleTarget: "COMPLIANCE_MANAGER",
          });
        }
      } else {
        await db.updateRow("correspondence", cor.id, data);
        await db.audit("UPDATE", "Correspondence", cor.code, `تعديل المراسلة ${cor.code}`);
      }
      await reload("correspondence", "notifications");
      ov.remove();
      toast("تم الحفظ");
      done();
    } catch (err) {
      toast(err.message, true);
    }
  };
}

export function openDetail(id, nav, done) {
  const c = store.correspondence.find((x) => x.id === id);
  if (!c) return;
  const editable = canEdit(store.user);
  const d = daysUntil(c.dueDate);
  const late = c.status === "OPEN" && d !== null && d < 0;

  const ov = modal(
    `
    <div class="row" style="justify-content:space-between">
      <h2>${esc(c.code)} — ${esc(c.subject)}</h2>
      <span>${statusBadgeFrom(COR_STATUS, c.status, ST_ROLE)}</span>
    </div>
    <div class="detail-grid">
      <div><span class="muted">الاتجاه</span><br/>${statusBadgeFrom(COR_DIRECTION, c.direction, DIR_ROLE)}</div>
      <div><span class="muted">الجهة</span><br/>${esc(authName(c.authorityId))}</div>
      <div><span class="muted">الرقم المرجعي</span><br/>${esc(c.refNumber || "—")}</div>
      <div><span class="muted">تاريخ الخطاب</span><br/>${fmtDate(c.date)}</div>
      <div><span class="muted">استحقاق الرد</span><br/>${fmtDate(c.dueDate)}${late ? ' <span class="lvl lvl-critical"><span class="dot"></span>متأخر</span>' : ""}</div>
      <div><span class="muted">الأولوية</span><br/>${statusBadgeFrom(COR_PRIORITY, c.priority || "NORMAL", PR_ROLE)}</div>
      <div><span class="muted">الإدارة المعنية</span><br/>${esc(deptName(c.ownerDeptId))}</div>
      <div><span class="muted">المسؤول</span><br/>${esc(userName(c.assigneeId))}</div>
    </div>
    ${c.requirementId ? `<p><strong>المتطلب المرتبط:</strong> <span class="link-item" data-nav="library">📖 ${esc(reqLabel(c.requirementId))}</span></p>` : ""}
    ${c.summary ? `<p class="pre-line"><strong>الملخص:</strong> ${esc(c.summary)}</p>` : ""}
    ${c.replyNotes ? `<p class="pre-line"><strong>الرد / الإجراء:</strong> ${esc(c.replyNotes)}</p>` : ""}
    ${c.attachmentUrl ? `<p>📎 <a href="${safeUrl(c.attachmentUrl)}" target="_blank" rel="noopener">المرفق</a></p>` : ""}
    <div class="row" style="margin-top:14px">
      ${editable ? `
        <button id="c-edit" title="تعديل بيانات هذه المراسلة">تعديل</button>
        ${c.status === "OPEN" ? '<button class="secondary" id="c-replied" title="تعليم المراسلة كمردود عليها">✔ تم الرد</button>' : ""}
        <button class="danger" id="c-del" title="حذف هذه المراسلة من السجل">حذف</button>` : ""}
      <button class="secondary" id="c-close" title="إغلاق نافذة التفاصيل">إغلاق</button>
    </div>`,
    { wide: true }
  );

  ov.querySelectorAll("[data-nav]").forEach((n) =>
    n.addEventListener("click", () => { ov.remove(); nav(n.dataset.nav); })
  );
  $("#c-close", ov).onclick = () => ov.remove();
  $("#c-edit", ov)?.addEventListener("click", () => { ov.remove(); openForm(c, done); });
  $("#c-replied", ov)?.addEventListener("click", async () => {
    await db.updateRow("correspondence", c.id, { status: "REPLIED" });
    await db.audit("UPDATE", "Correspondence", c.code, `تم الرد على المراسلة ${c.code}`);
    await reload("correspondence");
    ov.remove();
    toast("عُلّمت كمردود عليها");
    done();
  });
  $("#c-del", ov)?.addEventListener("click", async () => {
    ov.remove();
    if (!(await confirmBox(`حذف المراسلة ${c.code}؟`))) return;
    await db.removeRow("correspondence", c.id);
    await db.audit("DELETE", "Correspondence", c.code, `حذف المراسلة ${c.code} — ${c.subject}`);
    await reload("correspondence");
    toast("تم الحذف");
    done();
  });
}
