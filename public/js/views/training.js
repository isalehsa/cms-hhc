// الخطة التدريبية السنوية لإدارة الالتزام — مطابقة لقالب «الخطة التدريبية السنوية»
// تُغذّي مؤشر «معدل تنفيذ برامج التوعية بالالتزام» آلياً
import { store, reload, userName, userOptions } from "../state.js";
import * as db from "../db.js";
import {
  $, esc, toast, modal, confirmBox, fld, txt, area, sel, dateInp, val,
  fmtDate, isoFromInput, statusBadgeFrom, emptyMsg,
} from "../ui.js";
import { TRAINING_METHOD, TRAINING_STATUS } from "../meta.js";
import { canEdit } from "../auth.js";

const ST_ROLE = { PLANNED: "neutral", IN_PROGRESS: "warning", COMPLETED: "good", POSTPONED: "serious", CANCELLED: "critical" };
const filters = { search: "", status: "", year: "" };
const YEAR = new Date().getFullYear();

export function renderTraining(el, nav, refresh) {
  const editable = canEdit(store.user);
  const years = [...new Set(store.training.map((t) => t.year).filter(Boolean))].sort((a, b) => b - a);
  const rows = store.training.filter((t) => {
    if (filters.search && !`${t.code} ${t.program} ${t.objective || ""}`.includes(filters.search)) return false;
    if (filters.status && t.status !== filters.status) return false;
    if (filters.year && String(t.year) !== filters.year) return false;
    return true;
  });
  const yearRows = store.training.filter((t) => t.year === YEAR);
  const done = yearRows.filter((t) => t.status === "COMPLETED").length;
  const execRate = yearRows.length ? Math.round((done / yearRows.length) * 100) : 0;

  el.innerHTML = `
    <div class="page-head">
      <h1>🎓 الخطة التدريبية السنوية</h1>
      ${editable ? '<button id="add-tr" title="إضافة برنامج تدريبي/توعوي إلى الخطة">＋ برنامج تدريبي</button>' : ""}
    </div>
    <div class="stats">
      <div class="stat"><div class="num">${yearRows.length}</div><div class="lbl">برامج خطة ${YEAR}</div></div>
      <div class="stat"><div class="num">${done}</div><div class="lbl">برامج مكتملة</div></div>
      <div class="stat"><div class="num">${execRate}%</div><div class="lbl">معدل تنفيذ برامج التوعية</div><div class="sub">المستهدف 100%</div></div>
      <div class="stat"><div class="num">${store.training.length}</div><div class="lbl">إجمالي البرامج</div></div>
    </div>
    <section class="card">
      <div class="row filters">
        <input type="text" id="f-search" class="grow" placeholder="بحث…" value="${esc(filters.search)}" />
        ${sel("f-status", TRAINING_STATUS, filters.status, { empty: "كل الحالات" })}
        ${sel("f-year", years.map((y) => ({ id: String(y), name: String(y) })), filters.year, { empty: "كل السنوات" })}
      </div>
      <div style="overflow-x:auto">
        <table>
          <thead><tr>
            <th>الرقم</th><th>البرنامج التدريبي</th><th>الفئة المستهدفة</th><th>المسؤول</th>
            <th>التاريخ/الربع</th><th>طريقة التدريب</th><th>الحالة</th>
          </tr></thead>
          <tbody>
            ${rows
              .map((t) => `<tr class="rowlink" data-open="${t.id}">
                <td><strong>${esc(t.code)}</strong></td>
                <td><strong>${esc(t.program)}</strong>${t.objective ? `<div class="muted clamp">${esc(t.objective)}</div>` : ""}</td>
                <td>${esc(t.audience || "—")}</td>
                <td>${esc(userName(t.ownerId))}</td>
                <td>${t.quarter ? `الربع ${esc(t.quarter)} · ` : ""}${fmtDate(t.date)}</td>
                <td>${esc(TRAINING_METHOD[t.method] || "—")}</td>
                <td>${statusBadgeFrom(TRAINING_STATUS, t.status, ST_ROLE)}</td>
              </tr>`)
              .join("") || `<tr><td colspan="7">${emptyMsg("لا توجد برامج مطابقة")}</td></tr>`}
          </tbody>
        </table>
      </div>
      <p class="muted">عدد النتائج: ${rows.length} من ${store.training.length}</p>
    </section>`;

  const rerender = () => renderTraining(el, nav, refresh);
  $("#f-search", el).addEventListener("input", (e) => { filters.search = e.target.value; rerender(); });
  $("#f-status", el).onchange = (e) => { filters.status = e.target.value; rerender(); };
  $("#f-year", el).onchange = (e) => { filters.year = e.target.value; rerender(); };
  $("#add-tr", el)?.addEventListener("click", () => openForm(null, rerender));
  el.querySelectorAll("[data-open]").forEach((tr) =>
    tr.addEventListener("click", () => openDetail(tr.dataset.open, rerender))
  );
}

function openForm(t, done) {
  const isNew = !t;
  const ov = modal(
    `
    <h2>${isNew ? "إضافة برنامج تدريبي" : `تعديل ${esc(t.code)}`}</h2>
    ${fld("اسم البرنامج التدريبي *", txt("t-program", t?.program))}
    <div class="form-grid">
      ${fld("الفئة المستهدفة", txt("t-audience", t?.audience, "منسوبو الإدارة / رواد الالتزام / كل الموظفين"))}
      ${fld("المسؤول عن التنفيذ", sel("t-owner", userOptions(), t?.ownerId, { empty: "— اختر —" }))}
      ${fld("السنة", txt("t-year", t?.year || YEAR))}
      ${fld("الربع", sel("t-quarter", { 1: "الربع الأول", 2: "الربع الثاني", 3: "الربع الثالث", 4: "الربع الرابع" }, t?.quarter || "1"))}
      ${fld("التاريخ", dateInp("t-date", t?.date))}
      ${fld("طريقة التدريب", sel("t-method", TRAINING_METHOD, t?.method || "IN_PERSON"))}
      ${fld("طريقة التقييم", txt("t-eval", t?.evaluation, "اختبار / استبيان / حضور"))}
      ${fld("الحالة", sel("t-status", TRAINING_STATUS, t?.status || "PLANNED"))}
    </div>
    ${fld("الهدف من التدريب", area("t-obj", t?.objective, "", 2))}
    ${fld("ملاحظات", txt("t-notes", t?.notes))}
    <div class="row" style="margin-top:14px">
      <button id="t-save">حفظ</button>
      <button class="secondary" id="t-cancel">إلغاء</button>
    </div>`,
    { wide: true }
  );
  $("#t-cancel", ov).onclick = () => ov.remove();
  $("#t-save", ov).onclick = async () => {
    const program = val("t-program", ov);
    if (!program) return toast("اسم البرنامج إلزامي", true);
    const data = {
      program,
      audience: val("t-audience", ov) || null,
      ownerId: val("t-owner", ov) || null,
      year: Number(val("t-year", ov)) || YEAR,
      quarter: val("t-quarter", ov) || null,
      date: isoFromInput(val("t-date", ov)),
      method: val("t-method", ov),
      evaluation: val("t-eval", ov) || null,
      status: val("t-status", ov),
      objective: val("t-obj", ov) || null,
      notes: val("t-notes", ov) || null,
    };
    try {
      if (isNew) {
        const code = await db.nextCode("TRN");
        await db.setRow("training", code, { ...data, code, createdAt: db.now(), updatedAt: db.now() });
        await db.audit("CREATE", "Training", code, `إضافة برنامج تدريبي: ${code} — ${program}`);
      } else {
        await db.updateRow("training", t.id, data);
        await db.audit("UPDATE", "Training", t.code, `تعديل البرنامج ${t.code}`);
      }
      await reload("training");
      ov.remove();
      toast("تم الحفظ");
      done();
    } catch (err) {
      toast(err.message, true);
    }
  };
}

function openDetail(id, done) {
  const t = store.training.find((x) => x.id === id);
  if (!t) return;
  const editable = canEdit(store.user);
  const ov = modal(
    `
    <div class="row" style="justify-content:space-between">
      <h2>${esc(t.code)} — ${esc(t.program)}</h2>
      <span>${statusBadgeFrom(TRAINING_STATUS, t.status, ST_ROLE)}</span>
    </div>
    <div class="detail-grid">
      <div><span class="muted">الفئة المستهدفة</span><br/>${esc(t.audience || "—")}</div>
      <div><span class="muted">المسؤول</span><br/>${esc(userName(t.ownerId))}</div>
      <div><span class="muted">التاريخ/الربع</span><br/>${t.quarter ? `الربع ${esc(t.quarter)} · ` : ""}${fmtDate(t.date)}</div>
      <div><span class="muted">طريقة التدريب</span><br/>${esc(TRAINING_METHOD[t.method] || "—")}</div>
      <div><span class="muted">طريقة التقييم</span><br/>${esc(t.evaluation || "—")}</div>
      <div><span class="muted">السنة</span><br/>${esc(t.year || "—")}</div>
    </div>
    ${t.objective ? `<p><strong>الهدف:</strong> ${esc(t.objective)}</p>` : ""}
    ${t.notes ? `<p class="muted">${esc(t.notes)}</p>` : ""}
    <div class="row" style="margin-top:14px">
      ${editable ? '<button class="secondary" id="t-edit">تعديل</button><button class="danger" id="t-del">حذف</button>' : ""}
      <button class="secondary" id="t-x">إغلاق</button>
    </div>`,
    { wide: true }
  );
  $("#t-x", ov).onclick = () => ov.remove();
  $("#t-edit", ov)?.addEventListener("click", () => { ov.remove(); openForm(t, done); });
  $("#t-del", ov)?.addEventListener("click", async () => {
    ov.remove();
    if (!(await confirmBox(`حذف البرنامج ${t.code}؟`))) return;
    await db.removeRow("training", t.id);
    await db.audit("DELETE", "Training", t.code, `حذف البرنامج ${t.code}`);
    await reload("training");
    toast("تم الحذف");
    done();
  });
}
