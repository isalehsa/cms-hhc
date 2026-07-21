// سجل التدريب والتوعية — برامج التدريب وحملات التوعية ونشر ثقافة الالتزام
// كل نشاط يستهدف إدارة أو المنشأة كاملة، ويقيس نسبة الإنجاز/الحضور، ويُربط بالمتطلبات
import { store, reload, deptName, userName, reqLabel, deptOptions, userOptions, reqOptions } from "../state.js";
import * as db from "../db.js";
import {
  $, esc, safeUrl, toast, modal, confirmBox, fld, txt, area, sel, dateInp, val, num,
  fmtDate, daysUntil, isoFromInput, statusBadgeFrom, progressBar, emptyMsg, keepFocus, distBar,
} from "../ui.js";
import { TRAINING_TYPES, TRAINING_STATUS } from "../meta.js";
import { canEdit } from "../auth.js";

const ST_ROLE = { PLANNED: "neutral", IN_PROGRESS: "warning", COMPLETED: "good", CANCELLED: "neutral" };
const TYPE_ICON = { WORKSHOP: "🛠", LECTURE: "🎤", COURSE: "📚", MANDATORY: "⭐", BULLETIN: "📰", CAMPAIGN: "📣", QUIZ: "❓", ONBOARDING: "👋" };

const filters = { search: "", type: "", status: "", dept: "" };

const completionPct = (t) => (t.targetCount ? Math.round(((t.completedCount || 0) / t.targetCount) * 100) : 0);

export function renderTraining(el, nav, refresh) {
  const editable = canEdit(store.user);
  const all = store.trainings;
  const rows = all.filter((t) => {
    if (filters.search && !`${t.code} ${t.title} ${t.notes || ""}`.includes(filters.search)) return false;
    if (filters.type && t.type !== filters.type) return false;
    if (filters.status && t.status !== filters.status) return false;
    if (filters.dept && t.departmentId !== filters.dept) return false;
    return true;
  });

  const done = all.filter((t) => t.status === "COMPLETED");
  const upcoming = all.filter((t) => t.status !== "CANCELLED" && t.dueDate && daysUntil(t.dueDate) >= 0 && daysUntil(t.dueDate) <= 30);
  const targetSum = done.reduce((s, t) => s + (t.targetCount || 0), 0);
  const completedSum = done.reduce((s, t) => s + (t.completedCount || 0), 0);
  const reach = targetSum ? Math.round((completedSum / targetSum) * 100) : 0;

  el.innerHTML = `
    <div class="page-head">
      <h1>🎓 التدريب والتوعية</h1>
      ${editable ? '<button id="add-trn" title="إضافة نشاط تدريب أو توعية جديد">＋ نشاط جديد</button>' : ""}
    </div>
    <div class="stats">
      <div class="stat"><div class="num">${all.length}</div><div class="lbl">إجمالي الأنشطة</div></div>
      <div class="stat"><div class="num">${done.length}</div><div class="lbl">منفذة</div></div>
      <div class="stat"><div class="num">${upcoming.length}</div><div class="lbl">قادمة خلال 30 يوماً</div></div>
      <div class="stat"><div class="num">${completedSum.toLocaleString("en-US")}</div><div class="lbl">إجمالي المتدربين</div>
        <div class="sub">${reach}% من المستهدفين</div></div>
    </div>
    <div class="grid-2">
      <section class="card"><h2>حسب النوع</h2>
        ${distBar(Object.entries(TRAINING_TYPES).map(([k, label], i) => ({
          label, count: all.filter((t) => t.type === k).length,
          role: ["serious", "warning", "good", "critical", "neutral", "warning", "good", "neutral"][i] || "neutral",
        })).filter((x) => x.count))}
      </section>
      <section class="card"><h2>حسب الحالة</h2>
        ${distBar([
          { label: "مخطط", count: all.filter((t) => t.status === "PLANNED").length, role: "neutral" },
          { label: "قيد التنفيذ", count: all.filter((t) => t.status === "IN_PROGRESS").length, role: "warning" },
          { label: "منفذ", count: done.length, role: "good" },
        ])}
      </section>
    </div>
    <section class="card">
      <div class="row filters">
        <input type="text" id="f-search" class="grow" placeholder="بحث بالرمز أو العنوان…" value="${esc(filters.search)}" />
        ${sel("f-type", TRAINING_TYPES, filters.type, { empty: "كل الأنواع" })}
        ${sel("f-status", TRAINING_STATUS, filters.status, { empty: "كل الحالات" })}
        ${sel("f-dept", deptOptions(), filters.dept, { empty: "كل الإدارات / الجمهور" })}
      </div>
      <div style="overflow-x:auto">
        <table>
          <thead><tr>
            <th>الرقم</th><th>النوع</th><th>العنوان</th><th>الجمهور المستهدف</th><th>التاريخ</th>
            <th>المتدربون</th><th>الإنجاز</th><th>الحالة</th>
          </tr></thead>
          <tbody>
            ${rows
              .map((t) => `<tr class="rowlink" data-open="${t.id}">
                <td><strong>${esc(t.code)}</strong></td>
                <td>${TYPE_ICON[t.type] || "🎓"} ${esc(TRAINING_TYPES[t.type] || t.type)}</td>
                <td><strong>${esc(t.title)}</strong>${t.requirementId ? `<div class="muted clamp">📖 ${esc(reqLabel(t.requirementId))}</div>` : ""}</td>
                <td>${t.audienceType === "all" ? "المنشأة كاملة" : esc(deptName(t.departmentId))}</td>
                <td>${fmtDate(t.date)}</td>
                <td class="muted">${(t.completedCount || 0).toLocaleString("en-US")} / ${(t.targetCount || 0).toLocaleString("en-US")}</td>
                <td style="min-width:120px">${progressBar(completionPct(t))}</td>
                <td>${statusBadgeFrom(TRAINING_STATUS, t.status, ST_ROLE)}</td>
              </tr>`)
              .join("") || `<tr><td colspan="8">${emptyMsg("لا توجد أنشطة مطابقة")}</td></tr>`}
          </tbody>
        </table>
      </div>
      <p class="muted">عدد النتائج: ${rows.length} من ${all.length}</p>
    </section>`;

  const rerender = () => renderTraining(el, nav, refresh);
  $("#f-search", el).addEventListener("input", (e) => { filters.search = e.target.value; keepFocus(rerender); });
  $("#f-type", el).onchange = (e) => { filters.type = e.target.value; rerender(); };
  $("#f-status", el).onchange = (e) => { filters.status = e.target.value; rerender(); };
  $("#f-dept", el).onchange = (e) => { filters.dept = e.target.value; rerender(); };
  $("#add-trn", el)?.addEventListener("click", () => openForm(null, rerender));
  el.querySelectorAll("[data-open]").forEach((tr) =>
    tr.addEventListener("click", () => openDetail(tr.dataset.open, nav, rerender))
  );
}

function openForm(t, done) {
  const isNew = !t;
  const ov = modal(
    `
    <h2>${isNew ? "إضافة نشاط تدريب / توعية" : `تعديل ${esc(t.code)}`}</h2>
    <div class="form-grid">
      ${fld("عنوان النشاط *", txt("t-title", t?.title, "مثال: ورشة مكافحة غسل الأموال"))}
      ${fld("النوع", sel("t-type", TRAINING_TYPES, t?.type || "WORKSHOP"))}
      ${fld("الجمهور المستهدف", sel("t-aud", { dept: "إدارة محددة", all: "المنشأة كاملة" }, t?.audienceType || "dept"))}
      ${fld("الإدارة (عند تحديد إدارة)", sel("t-dept", deptOptions(), t?.departmentId, { empty: "— اختر —" }))}
      ${fld("المتطلب / السياسة المرتبطة", sel("t-req", reqOptions(), t?.requirementId, { empty: "— بلا ربط —" }))}
      ${fld("المسؤول عن التنفيذ", sel("t-owner", userOptions(), t?.ownerId, { empty: "— اختر —" }))}
      ${fld("تاريخ التنفيذ", dateInp("t-date", t?.date))}
      ${fld("الاستحقاق (للمخطط)", dateInp("t-due", t?.dueDate))}
      ${fld("عدد المستهدفين", num("t-target", t?.targetCount ?? 0, 0, 100000))}
      ${fld("عدد المتدربين المنجزين", num("t-completed", t?.completedCount ?? 0, 0, 100000))}
      ${fld("الحالة", sel("t-status", TRAINING_STATUS, t?.status || "PLANNED"))}
      ${fld("رابط المادة التدريبية", txt("t-materials", t?.materialsUrl || "", "https://…"))}
    </div>
    ${fld("الوصف / الملاحظات", area("t-notes", t?.notes, "", 3))}
    <div class="row" style="margin-top:14px">
      <button id="t-save">حفظ</button>
      <button class="secondary" id="t-cancel">إلغاء</button>
    </div>`,
    { wide: true }
  );
  $("#t-cancel", ov).onclick = () => ov.remove();
  $("#t-save", ov).onclick = async () => {
    const title = val("t-title", ov);
    if (!title) return toast("عنوان النشاط إلزامي", true);
    const audienceType = val("t-aud", ov);
    const target = Number(val("t-target", ov)) || 0;
    let completed = Number(val("t-completed", ov)) || 0;
    if (target && completed > target) completed = target;
    const data = {
      title,
      type: val("t-type", ov),
      audienceType,
      departmentId: audienceType === "dept" ? (val("t-dept", ov) || null) : null,
      requirementId: val("t-req", ov) || null,
      ownerId: val("t-owner", ov) || null,
      date: isoFromInput(val("t-date", ov)),
      dueDate: isoFromInput(val("t-due", ov)),
      targetCount: target,
      completedCount: completed,
      status: val("t-status", ov),
      materialsUrl: val("t-materials", ov) || null,
      notes: val("t-notes", ov),
    };
    try {
      if (isNew) {
        const code = await db.nextCode("TRN");
        await db.setRow("trainings", code, { ...data, code, createdById: store.user.uid, createdAt: db.now(), updatedAt: db.now() });
        await db.audit("CREATE", "Training", code, `إضافة نشاط تدريب/توعية: ${code} — ${title}`);
        if (data.status === "PLANNED") {
          await db.notify({
            title: "نشاط تدريب / توعية مخطط",
            message: `${code} — ${TRAINING_TYPES[data.type]}: ${title}`,
            type: "TRAINING_NEW",
            link: "training",
            roleTarget: "COMPLIANCE_MANAGER",
          });
        }
      } else {
        await db.updateRow("trainings", t.id, data);
        await db.audit("UPDATE", "Training", t.code, `تعديل نشاط التدريب ${t.code}`);
      }
      await reload("trainings", "notifications");
      ov.remove();
      toast("تم الحفظ");
      done();
    } catch (err) {
      toast(err.message, true);
    }
  };
}

export function openDetail(id, nav, done) {
  const t = store.trainings.find((x) => x.id === id);
  if (!t) return;
  const editable = canEdit(store.user);
  const pct = completionPct(t);

  const ov = modal(
    `
    <div class="row" style="justify-content:space-between">
      <h2>${TYPE_ICON[t.type] || "🎓"} ${esc(t.code)} — ${esc(t.title)}</h2>
      <span>${statusBadgeFrom(TRAINING_STATUS, t.status, ST_ROLE)}</span>
    </div>
    <div class="detail-grid">
      <div><span class="muted">النوع</span><br/>${esc(TRAINING_TYPES[t.type] || t.type)}</div>
      <div><span class="muted">الجمهور</span><br/>${t.audienceType === "all" ? "المنشأة كاملة" : esc(deptName(t.departmentId))}</div>
      <div><span class="muted">المسؤول</span><br/>${esc(userName(t.ownerId))}</div>
      <div><span class="muted">تاريخ التنفيذ</span><br/>${fmtDate(t.date)}</div>
      <div><span class="muted">الاستحقاق</span><br/>${fmtDate(t.dueDate)}</div>
      <div><span class="muted">المتدربون</span><br/>${(t.completedCount || 0).toLocaleString("en-US")} من ${(t.targetCount || 0).toLocaleString("en-US")}</div>
    </div>
    <div style="margin:10px 0">${progressBar(pct)}</div>
    ${t.requirementId ? `<p><strong>المتطلب المرتبط:</strong> <span class="link-item" data-nav="library">📖 ${esc(reqLabel(t.requirementId))}</span></p>` : ""}
    ${t.notes ? `<p class="pre-line"><strong>الوصف:</strong> ${esc(t.notes)}</p>` : ""}
    ${t.materialsUrl ? `<p>📎 <a href="${safeUrl(t.materialsUrl)}" target="_blank" rel="noopener">المادة التدريبية</a></p>` : ""}
    <div class="row" style="margin-top:14px">
      ${editable ? `
        <button id="t-edit" title="تعديل بيانات النشاط">تعديل</button>
        ${t.status !== "COMPLETED" ? '<button class="secondary" id="t-complete" title="تعليم النشاط كمنفذ">✔ تعليم كمنفذ</button>' : ""}
        <button class="danger" id="t-del" title="حذف النشاط">حذف</button>` : ""}
      <button class="secondary" id="t-close" title="إغلاق النافذة">إغلاق</button>
    </div>`,
    { wide: true }
  );

  ov.querySelectorAll("[data-nav]").forEach((n) =>
    n.addEventListener("click", () => { ov.remove(); nav(n.dataset.nav); })
  );
  $("#t-close", ov).onclick = () => ov.remove();
  $("#t-edit", ov)?.addEventListener("click", () => { ov.remove(); openForm(t, done); });
  $("#t-complete", ov)?.addEventListener("click", async () => {
    await db.updateRow("trainings", t.id, { status: "COMPLETED", completedCount: t.completedCount || t.targetCount || 0 });
    await db.audit("UPDATE", "Training", t.code, `تنفيذ نشاط التدريب ${t.code}`);
    await reload("trainings");
    ov.remove();
    toast("عُلّم كمنفذ");
    done();
  });
  $("#t-del", ov)?.addEventListener("click", async () => {
    ov.remove();
    if (!(await confirmBox(`حذف نشاط التدريب ${t.code}؟`))) return;
    await db.removeRow("trainings", t.id);
    await db.audit("DELETE", "Training", t.code, `حذف نشاط التدريب ${t.code} — ${t.title}`);
    await reload("trainings");
    toast("تم الحذف");
    done();
  });
}
