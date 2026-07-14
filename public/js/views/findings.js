// الملاحظات وخطط التصحيح — من المراقبة والفحص الذاتي أو يدوياً، مع اعتماد الإغلاق
import { store, reload, deptName, userName, reqLabel, monLabel, deptOptions, userOptions, reqOptions, riskOptions } from "../state.js";
import * as db from "../db.js";
import {
  $, esc, toast, modal, confirmBox, fld, txt, area, sel, dateInp, val, num,
  fmtDate, daysUntil, isoFromInput, levelBadge, statusBadgeFrom, progressBar, emptyMsg,
} from "../ui.js";
import { FND_SEVERITY, FND_STATUS, FND_SOURCES, ACTION_STATUS } from "../meta.js";
import { canEdit, canApprove, isDeptOwner } from "../auth.js";

const ST_ROLE = { OPEN: "critical", IN_PROGRESS: "warning", CLOSED: "good" };
const filters = { search: "", severity: "", status: "", dept: "" };

export function renderFindings(el, nav, refresh) {
  const user = store.user;
  const editable = canEdit(user);
  const rows = store.findings.filter((f) => {
    if (isDeptOwner(user) && f.departmentId !== user.departmentId) return false;
    if (filters.search && !`${f.code} ${f.title}`.includes(filters.search)) return false;
    if (filters.severity && f.severity !== filters.severity) return false;
    if (filters.status && f.status !== filters.status) return false;
    if (filters.dept && f.departmentId !== filters.dept) return false;
    return true;
  });

  el.innerHTML = `
    <div class="page-head">
      <h1>🛠 الملاحظات وخطط التصحيح</h1>
      ${editable ? '<button id="add-fnd">＋ ملاحظة جديدة</button>' : ""}
    </div>
    <section class="card">
      <div class="row filters">
        <input type="text" id="f-search" class="grow" placeholder="بحث…" value="${esc(filters.search)}" />
        ${sel("f-sev", FND_SEVERITY, filters.severity, { empty: "كل درجات الخطورة" })}
        ${sel("f-status", FND_STATUS, filters.status, { empty: "كل الحالات" })}
        ${sel("f-dept", deptOptions(), filters.dept, { empty: "كل الإدارات" })}
      </div>
      <div style="overflow-x:auto">
        <table>
          <thead><tr>
            <th>الرقم</th><th>الملاحظة</th><th>المصدر</th><th>الخطورة</th><th>الإدارة</th>
            <th>الاستحقاق</th><th>خطة التصحيح</th><th>الحالة</th>
          </tr></thead>
          <tbody>
            ${rows
              .map((f) => {
                const d = daysUntil(f.dueDate);
                const avg = (f.actions || []).length
                  ? Math.round(f.actions.reduce((s, x) => s + (x.progress || 0), 0) / f.actions.length)
                  : 0;
                return `<tr class="rowlink" data-open="${f.id}">
                  <td><strong>${esc(f.code)}</strong></td>
                  <td><strong>${esc(f.title)}</strong></td>
                  <td>${esc(FND_SOURCES[f.source] || f.source || "—")}</td>
                  <td>${levelBadge(f.severity, FND_SEVERITY[f.severity] || "—")}</td>
                  <td>${esc(deptName(f.departmentId))}</td>
                  <td>${fmtDate(f.dueDate)}${f.status !== "CLOSED" && d !== null && d < 0 ? ' <span class="lvl lvl-critical"><span class="dot"></span>متأخرة</span>' : ""}</td>
                  <td style="min-width:120px">${(f.actions || []).length ? progressBar(avg) : '<span class="muted">لا توجد</span>'}</td>
                  <td>${statusBadgeFrom(FND_STATUS, f.status, ST_ROLE)}</td>
                </tr>`;
              })
              .join("") || `<tr><td colspan="8">${emptyMsg("لا توجد ملاحظات مطابقة")}</td></tr>`}
          </tbody>
        </table>
      </div>
      <p class="muted">عدد النتائج: ${rows.length} من ${store.findings.length}</p>
    </section>`;

  const rerender = () => renderFindings(el, nav, refresh);
  $("#f-search", el).addEventListener("input", (e) => { filters.search = e.target.value; rerender(); });
  $("#f-sev", el).onchange = (e) => { filters.severity = e.target.value; rerender(); };
  $("#f-status", el).onchange = (e) => { filters.status = e.target.value; rerender(); };
  $("#f-dept", el).onchange = (e) => { filters.dept = e.target.value; rerender(); };
  $("#add-fnd", el)?.addEventListener("click", () => openForm(null, rerender));
  el.querySelectorAll("[data-open]").forEach((tr) =>
    tr.addEventListener("click", () => openDetail(tr.dataset.open, nav, rerender))
  );
}

function openForm(f, done) {
  const isNew = !f;
  const ov = modal(
    `
    <h2>${isNew ? "إضافة ملاحظة" : `تعديل ${esc(f.code)}`}</h2>
    ${fld("عنوان الملاحظة *", txt("n-title", f?.title))}
    <div class="form-grid">
      ${fld("درجة الخطورة", sel("n-sev", FND_SEVERITY, f?.severity || "MEDIUM"))}
      ${fld("الإدارة المعنية", sel("n-dept", deptOptions(), f?.departmentId, { empty: "— اختر —" }))}
      ${fld("المتطلب المرتبط", sel("n-req", reqOptions(), f?.requirementId, { empty: "— بلا —" }))}
      ${fld("الخطر المرتبط", sel("n-risk", riskOptions(), f?.riskId, { empty: "— بلا —" }))}
      ${fld("تاريخ الاستحقاق", dateInp("n-due", f?.dueDate))}
    </div>
    ${fld("الوصف", area("n-desc", f?.description, "", 3))}
    <div class="row" style="margin-top:14px">
      <button id="n-save">حفظ</button>
      <button class="secondary" id="n-cancel">إلغاء</button>
    </div>`,
    { wide: true }
  );
  $("#n-cancel", ov).onclick = () => ov.remove();
  $("#n-save", ov).onclick = async () => {
    const title = val("n-title", ov);
    if (!title) return toast("عنوان الملاحظة إلزامي", true);
    const severity = val("n-sev", ov);
    const data = {
      title,
      severity,
      departmentId: val("n-dept", ov) || null,
      requirementId: val("n-req", ov) || null,
      riskId: val("n-risk", ov) || null,
      dueDate: isoFromInput(val("n-due", ov)),
      description: val("n-desc", ov) || null,
    };
    try {
      if (isNew) {
        const code = await db.nextCode("FND");
        await db.setRow("findings", code, {
          ...data, code,
          source: "MANUAL", monitoringId: null, assessmentId: null,
          status: "OPEN", actions: [],
          createdAt: db.now(), updatedAt: db.now(),
        });
        await db.audit("CREATE", "Finding", code, `إضافة ملاحظة: ${code} — ${title}`);
        if (severity === "CRITICAL" || severity === "HIGH") {
          await db.notify({
            title: "ملاحظة عالية الخطورة",
            message: `${code} — ${title}`,
            type: "FINDING_HIGH",
            link: "findings",
            roleTarget: "COMPLIANCE_MANAGER",
          });
        }
      } else {
        await db.updateRow("findings", f.id, data);
        await db.audit("UPDATE", "Finding", f.code, `تعديل الملاحظة ${f.code}`);
      }
      await reload("findings");
      ov.remove();
      toast("تم الحفظ");
      done();
    } catch (err) {
      toast(err.message, true);
    }
  };
}

export function openDetail(id, nav, done) {
  const f = store.findings.find((x) => x.id === id);
  if (!f) return;
  const user = store.user;
  const manager = canEdit(user);
  const owner = isDeptOwner(user) && user.departmentId === f.departmentId;
  const actions = f.actions || [];

  const ov = modal(
    `
    <div class="row" style="justify-content:space-between">
      <h2>${esc(f.code)} — ${esc(f.title)}</h2>
      <span>${statusBadgeFrom(FND_STATUS, f.status, ST_ROLE)} ${levelBadge(f.severity, FND_SEVERITY[f.severity] || "—")}</span>
    </div>
    <div class="detail-grid">
      <div><span class="muted">المصدر</span><br/>${esc(FND_SOURCES[f.source] || "—")}${f.monitoringId ? `<br/>${esc(monLabel(f.monitoringId))}` : ""}</div>
      <div><span class="muted">الإدارة</span><br/>${esc(deptName(f.departmentId))}</div>
      <div><span class="muted">المتطلب</span><br/>${esc(reqLabel(f.requirementId))}</div>
      <div><span class="muted">الاستحقاق</span><br/>${fmtDate(f.dueDate)}</div>
    </div>
    ${f.description ? `<p>${esc(f.description)}</p>` : ""}

    <h3>خطة التصحيح (${actions.length} إجراء)</h3>
    <div id="act-list">
      ${actions
        .map(
          (a) => `<div class="card sub" data-act="${a.id}">
            <p>${esc(a.description)}</p>
            <div class="row">
              <span class="muted">المسؤول: ${esc(userName(a.ownerId))} · الاستحقاق: ${fmtDate(a.dueDate)}</span>
              <span class="grow"></span>
              ${statusBadgeFrom(ACTION_STATUS, a.status, { OPEN: "critical", IN_PROGRESS: "warning", COMPLETED: "good" })}
            </div>
            <div class="row" style="margin-top:6px">
              <div class="grow">${progressBar(a.progress)}</div>
              ${manager || owner ? `<input type="number" class="act-prog" min="0" max="100" value="${a.progress || 0}" style="width:80px" /> <button class="small act-save">تحديث</button>` : ""}
            </div>
            ${a.closureNotes ? `<p class="muted">ملاحظات الإغلاق: ${esc(a.closureNotes)}</p>` : ""}
          </div>`
        )
        .join("") || '<p class="muted">لا توجد إجراءات تصحيحية بعد</p>'}
    </div>
    ${manager || owner ? `
      <div class="card sub">
        <h3>＋ إجراء تصحيحي جديد</h3>
        ${fld("وصف الإجراء", area("na-desc", "", "", 2))}
        <div class="form-grid">
          ${fld("المسؤول", sel("na-owner", userOptions(), "", { empty: "— اختر —" }))}
          ${fld("الاستحقاق", dateInp("na-due"))}
        </div>
        <button class="secondary small" id="na-add">إضافة الإجراء</button>
      </div>` : ""}
    <div class="row" style="margin-top:14px">
      ${manager ? `<button class="secondary" id="n-edit">تعديل الملاحظة</button>` : ""}
      ${manager && canApprove(user) && f.status !== "CLOSED" ? '<button id="n-close-approve">✔ اعتماد الإغلاق</button>' : ""}
      ${manager ? '<button class="danger" id="n-del">حذف</button>' : ""}
      <button class="secondary" id="n-close">إغلاق</button>
    </div>`,
    { wide: true }
  );

  $("#n-close", ov).onclick = () => ov.remove();
  $("#n-edit", ov)?.addEventListener("click", () => { ov.remove(); openForm(f, done); });

  // تحديث تقدم إجراء
  ov.querySelectorAll("[data-act]").forEach((card) => {
    card.querySelector(".act-save")?.addEventListener("click", async () => {
      const progress = Math.max(0, Math.min(100, Number(card.querySelector(".act-prog").value) || 0));
      const updated = actions.map((a) =>
        a.id === card.dataset.act
          ? { ...a, progress, status: progress >= 100 ? "COMPLETED" : progress > 0 ? "IN_PROGRESS" : "OPEN" }
          : a
      );
      const allDone = updated.length && updated.every((a) => a.status === "COMPLETED");
      await db.updateRow("findings", f.id, {
        actions: updated,
        status: f.status === "CLOSED" ? "CLOSED" : allDone ? "IN_PROGRESS" : updated.some((a) => a.progress > 0) ? "IN_PROGRESS" : f.status,
      });
      await db.audit("UPDATE", "Finding", f.code, `تحديث تقدم إجراء تصحيحي في ${f.code} إلى ${progress}%`);
      await reload("findings");
      ov.remove();
      toast("حُدّث التقدم");
      done();
    });
  });

  $("#na-add", ov)?.addEventListener("click", async () => {
    const desc = val("na-desc", ov);
    if (!desc) return toast("وصف الإجراء إلزامي", true);
    const action = {
      id: crypto.randomUUID(),
      description: desc,
      ownerId: val("na-owner", ov) || null,
      departmentId: f.departmentId || null,
      dueDate: isoFromInput(val("na-due", ov)),
      status: "OPEN",
      progress: 0,
      closureNotes: null,
      createdAt: db.now(),
    };
    await db.updateRow("findings", f.id, {
      actions: [...actions, action],
      status: f.status === "OPEN" ? "IN_PROGRESS" : f.status,
    });
    await db.audit("CREATE", "Finding", f.code, `إضافة إجراء تصحيحي للملاحظة ${f.code}`);
    await reload("findings");
    ov.remove();
    toast("أُضيف الإجراء");
    done();
  });

  $("#n-close-approve", ov)?.addEventListener("click", async () => {
    ov.remove();
    if (actions.some((a) => a.status !== "COMPLETED") && !(await confirmBox("بعض الإجراءات لم تكتمل بعد — اعتماد الإغلاق رغم ذلك؟"))) return;
    await db.updateRow("findings", f.id, { status: "CLOSED" });
    await db.audit("APPROVE", "Finding", f.code, `اعتماد إغلاق الملاحظة ${f.code}`);
    await reload("findings");
    toast("اعتُمد الإغلاق");
    done();
  });

  $("#n-del", ov)?.addEventListener("click", async () => {
    ov.remove();
    if (!(await confirmBox(`حذف الملاحظة ${f.code}؟`))) return;
    await db.removeRow("findings", f.id);
    await db.audit("DELETE", "Finding", f.code, `حذف الملاحظة ${f.code}`);
    await reload("findings");
    toast("تم الحذف");
    done();
  });
}
