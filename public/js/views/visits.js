// الزيارات الميدانية لمقرات الشركة — خطة، تنفيذ، وسجل متابعة تنفيذ الإجراءات التصحيحية للملاحظات
// وفق دليل السياسات والإجراءات (الزيارات الميدانية) وقالب «سجل متابعة تنفيذ الملاحظات»
import { store, reload, deptName, userName, deptOptions, userOptions } from "../state.js";
import * as db from "../db.js";
import {
  $, esc, toast, modal, confirmBox, fld, txt, area, sel, dateInp, val,
  fmtDate, isoFromInput, levelBadge, statusBadgeFrom, emptyMsg,
} from "../ui.js";
import { VISIT_STATUS, OBS_IMPL_STATUS, FND_SEVERITY } from "../meta.js";
import { canEdit } from "../auth.js";

const ST_ROLE = { PLANNED: "warning", CONDUCTED: "serious", CLOSED: "good" };
const IMPL_ROLE = { DONE: "good", IN_PROGRESS: "warning", NOT_DONE: "critical" };
const filters = { search: "", status: "" };

const obsList = (v) => v.observations || [];
const openObs = (v) => obsList(v).filter((o) => o.implStatus !== "DONE").length;

export function renderVisits(el, nav, refresh) {
  const editable = canEdit(store.user);
  const rows = store.visits.filter((v) => {
    if (filters.search && !`${v.code} ${v.site} ${v.scope || ""}`.includes(filters.search)) return false;
    if (filters.status && v.status !== filters.status) return false;
    return true;
  });
  const planned = store.visits.length;
  const conducted = store.visits.filter((v) => v.status !== "PLANNED").length;
  const execRate = planned ? Math.round((conducted / planned) * 100) : 0;
  const totalObs = store.visits.reduce((s, v) => s + obsList(v).length, 0);
  const openObsCount = store.visits.reduce((s, v) => s + openObs(v), 0);

  el.innerHTML = `
    <div class="page-head">
      <h1>🏢 الزيارات الميدانية</h1>
      ${editable ? '<button id="add-visit" title="إضافة زيارة ميدانية إلى الخطة">＋ زيارة جديدة</button>' : ""}
    </div>
    <div class="stats">
      <div class="stat"><div class="num">${planned}</div><div class="lbl">زيارات مخططة</div></div>
      <div class="stat"><div class="num">${conducted}</div><div class="lbl">زيارات منفذة</div></div>
      <div class="stat"><div class="num">${execRate}%</div><div class="lbl">نسبة تنفيذ الزيارات</div><div class="sub">المستهدف 100%</div></div>
      <div class="stat"><div class="num">${openObsCount}/${totalObs}</div><div class="lbl">ملاحظات مفتوحة / الإجمالي</div></div>
    </div>
    <section class="card">
      <div class="row filters">
        <input type="text" id="f-search" class="grow" placeholder="بحث…" value="${esc(filters.search)}" />
        ${sel("f-status", VISIT_STATUS, filters.status, { empty: "كل الحالات" })}
      </div>
      <div style="overflow-x:auto">
        <table>
          <thead><tr>
            <th>الرقم</th><th>المقر / الزيارة</th><th>الإدارة</th><th>تاريخ الزيارة</th>
            <th>المنفِّذ</th><th>الملاحظات</th><th>الحالة</th>
          </tr></thead>
          <tbody>
            ${rows
              .map((v) => `<tr class="rowlink" data-open="${v.id}">
                <td><strong>${esc(v.code)}</strong></td>
                <td><strong>${esc(v.site)}</strong>${v.scope ? `<div class="muted clamp">${esc(v.scope)}</div>` : ""}</td>
                <td>${esc(deptName(v.departmentId))}</td>
                <td>${fmtDate(v.visitDate)}</td>
                <td>${esc(userName(v.assigneeId))}</td>
                <td>${obsList(v).length}${openObs(v) ? ` <span class="lvl lvl-warning"><span class="dot"></span>${openObs(v)} مفتوحة</span>` : ""}</td>
                <td>${statusBadgeFrom(VISIT_STATUS, v.status, ST_ROLE)}</td>
              </tr>`)
              .join("") || `<tr><td colspan="7">${emptyMsg("لا توجد زيارات مطابقة")}</td></tr>`}
          </tbody>
        </table>
      </div>
      <p class="muted">عدد النتائج: ${rows.length} من ${store.visits.length}</p>
    </section>`;

  const rerender = () => renderVisits(el, nav, refresh);
  $("#f-search", el).addEventListener("input", (e) => { filters.search = e.target.value; rerender(); });
  $("#f-status", el).onchange = (e) => { filters.status = e.target.value; rerender(); };
  $("#add-visit", el)?.addEventListener("click", () => openForm(null, rerender));
  el.querySelectorAll("[data-open]").forEach((tr) =>
    tr.addEventListener("click", () => openDetail(tr.dataset.open, nav, rerender))
  );
}

function openForm(v, done) {
  const isNew = !v;
  const ov = modal(
    `
    <h2>${isNew ? "إضافة زيارة ميدانية" : `تعديل ${esc(v.code)}`}</h2>
    ${fld("المقر / اسم الزيارة *", txt("v-site", v?.site))}
    <div class="form-grid">
      ${fld("الإدارة المعنية", sel("v-dept", deptOptions(), v?.departmentId, { empty: "— اختر —" }))}
      ${fld("المنفِّذ (أخصائي الالتزام)", sel("v-assignee", userOptions(), v?.assigneeId, { empty: "— اختر —" }))}
      ${fld("تاريخ الزيارة", dateInp("v-date", v?.visitDate))}
      ${fld("الحالة", sel("v-status", VISIT_STATUS, v?.status || "PLANNED"))}
    </div>
    ${fld("نطاق وأهداف الزيارة", area("v-scope", v?.scope, "التحقق من التوافق مع القوانين والأنظمة والسياسات الداخلية…", 3))}
    <div class="row" style="margin-top:14px">
      <button id="v-save">حفظ</button>
      <button class="secondary" id="v-cancel">إلغاء</button>
    </div>`,
    { wide: true }
  );
  $("#v-cancel", ov).onclick = () => ov.remove();
  $("#v-save", ov).onclick = async () => {
    const site = val("v-site", ov);
    if (!site) return toast("اسم المقر إلزامي", true);
    const data = {
      site,
      departmentId: val("v-dept", ov) || null,
      assigneeId: val("v-assignee", ov) || null,
      visitDate: isoFromInput(val("v-date", ov)),
      status: val("v-status", ov),
      scope: val("v-scope", ov) || null,
    };
    try {
      if (isNew) {
        const code = await db.nextCode("VST");
        await db.setRow("visits", code, { ...data, code, observations: [], createdAt: db.now(), updatedAt: db.now() });
        await db.audit("CREATE", "Visit", code, `إضافة زيارة ميدانية: ${code} — ${site}`);
      } else {
        await db.updateRow("visits", v.id, data);
        await db.audit("UPDATE", "Visit", v.code, `تعديل الزيارة ${v.code}`);
      }
      await reload("visits");
      ov.remove();
      toast("تم الحفظ");
      done();
    } catch (err) {
      toast(err.message, true);
    }
  };
}

export function openDetail(id, nav, done) {
  const v = store.visits.find((x) => x.id === id);
  if (!v) return;
  const editable = canEdit(store.user);
  const observations = obsList(v);

  const ov = modal(
    `
    <div class="row" style="justify-content:space-between">
      <h2>${esc(v.code)} — ${esc(v.site)}</h2>
      <span>${statusBadgeFrom(VISIT_STATUS, v.status, ST_ROLE)}</span>
    </div>
    <div class="detail-grid">
      <div><span class="muted">الإدارة المعنية</span><br/>${esc(deptName(v.departmentId))}</div>
      <div><span class="muted">تاريخ الزيارة</span><br/>${fmtDate(v.visitDate)}</div>
      <div><span class="muted">المنفِّذ</span><br/>${esc(userName(v.assigneeId))}</div>
    </div>
    ${v.scope ? `<p><strong>النطاق والأهداف:</strong> ${esc(v.scope)}</p>` : ""}

    <h3>سجل متابعة تنفيذ الإجراءات التصحيحية للملاحظات (${observations.length})</h3>
    <div style="overflow-x:auto">
      <table>
        <thead><tr>
          <th>رقم الملاحظة</th><th>الإدارة</th><th>الخطورة</th><th>الشرح</th><th>الإجراء التصحيحي</th>
          <th>المسؤول</th><th>تاريخ التنفيذ</th><th>الإطار الزمني</th><th>حالة التنفيذ</th><th></th>
        </tr></thead>
        <tbody id="obs-body">
          ${observations
            .map((o) => `<tr data-obs="${o.id}">
              <td><strong>${esc(o.code)}</strong></td>
              <td>${esc(deptName(o.departmentId))}</td>
              <td>${levelBadge(o.severity, FND_SEVERITY[o.severity] || "—")}</td>
              <td class="muted clamp">${esc(o.details || "")}<br/><em>${esc(o.recommendation || "")}</em></td>
              <td class="muted clamp">${esc(o.correctiveAction || "")}${o.followResult ? `<br/><small>المتابعة: ${esc(o.followResult)}</small>` : ""}</td>
              <td>${esc(userName(o.ownerId))}</td>
              <td>${fmtDate(o.implDate)}</td>
              <td>${esc(o.timeframe || "—")}</td>
              <td>${statusBadgeFrom(OBS_IMPL_STATUS, o.implStatus, IMPL_ROLE)}${o.findingCode ? `<br/><small class="muted">➜ ${esc(o.findingCode)}</small>` : ""}</td>
              <td>${editable ? `<button class="secondary small obs-edit" data-obs="${o.id}">تحديث</button>` : ""}</td>
            </tr>`)
            .join("") || `<tr><td colspan="10">${emptyMsg("لا توجد ملاحظات مسجلة لهذه الزيارة")}</td></tr>`}
        </tbody>
      </table>
    </div>
    ${editable ? '<button class="secondary small" id="obs-add" style="margin-top:8px">＋ إضافة ملاحظة</button>' : ""}

    <div class="row" style="margin-top:14px">
      ${editable ? '<button class="secondary" id="v-edit">تعديل الزيارة</button>' : ""}
      ${editable && v.status !== "CLOSED" ? '<button id="v-close">✔ إغلاق الزيارة</button>' : ""}
      ${editable ? '<button class="danger" id="v-del">حذف</button>' : ""}
      <button class="secondary" id="v-x">إغلاق</button>
    </div>`,
    { wide: true }
  );

  $("#v-x", ov).onclick = () => ov.remove();
  $("#v-edit", ov)?.addEventListener("click", () => { ov.remove(); openForm(v, done); });
  $("#obs-add", ov)?.addEventListener("click", () => { ov.remove(); openObsForm(v, null, done); });
  ov.querySelectorAll(".obs-edit").forEach((b) =>
    b.addEventListener("click", () => { ov.remove(); openObsForm(v, b.dataset.obs, done); })
  );
  $("#v-close", ov)?.addEventListener("click", async () => {
    ov.remove();
    if (openObs(v) && !(await confirmBox("توجد ملاحظات لم تُنفّذ إجراءاتها بعد — إغلاق الزيارة رغم ذلك؟"))) return;
    await db.updateRow("visits", v.id, { status: "CLOSED" });
    await db.audit("APPROVE", "Visit", v.code, `إغلاق الزيارة ${v.code}`);
    await reload("visits");
    toast("أُغلقت الزيارة");
    done();
  });
  $("#v-del", ov)?.addEventListener("click", async () => {
    ov.remove();
    if (!(await confirmBox(`حذف الزيارة ${v.code}؟`))) return;
    await db.removeRow("visits", v.id);
    await db.audit("DELETE", "Visit", v.code, `حذف الزيارة ${v.code}`);
    await reload("visits");
    toast("تم الحذف");
    done();
  });
}

// إضافة/تعديل ملاحظة زيارة — مع ترحيل آلي إلى سجل الملاحظات وخطط التصحيح
function openObsForm(v, obsId, done) {
  const observations = obsList(v);
  const o = obsId ? observations.find((x) => x.id === obsId) : null;
  const isNew = !o;
  const highDefault = !o; // اقتراح الترحيل افتراضياً للملاحظات الجديدة عالية الخطورة
  const ov = modal(
    `
    <h2>${isNew ? `ملاحظة جديدة — زيارة ${esc(v.code)}` : `تعديل الملاحظة ${esc(o.code)}`}</h2>
    <div class="form-grid">
      ${fld("الإدارة المعنية", sel("o-dept", deptOptions(), o?.departmentId || v.departmentId, { empty: "— اختر —" }))}
      ${fld("مستوى الخطورة", sel("o-sev", FND_SEVERITY, o?.severity || "MEDIUM"))}
      ${fld("المسؤول عن التنفيذ", sel("o-owner", userOptions(), o?.ownerId, { empty: "— اختر —" }))}
      ${fld("تاريخ التنفيذ المستهدف", dateInp("o-date", o?.implDate))}
      ${fld("الإطار الزمني", txt("o-timeframe", o?.timeframe, "مثال: 30 يوماً"))}
      ${fld("حالة التنفيذ", sel("o-impl", OBS_IMPL_STATUS, o?.implStatus || "IN_PROGRESS"))}
    </div>
    ${fld("الشرح التفصيلي للملاحظة *", area("o-details", o?.details, "", 2))}
    ${fld("التوصية", area("o-rec", o?.recommendation, "", 2))}
    ${fld("الإجراء التصحيحي المتفق عليه", area("o-corr", o?.correctiveAction, "", 2))}
    ${fld("المستندات الداعمة (في حالة التنفيذ)", txt("o-docs", o?.docs))}
    ${fld("نتيجة المتابعة", txt("o-follow", o?.followResult))}
    ${isNew && !o?.findingCode ? '<label class="chk"><input type="checkbox" id="o-mkfinding" ' + (highDefault ? "" : "") + ' /> ترحيل الملاحظة إلى سجل الملاحظات وخطط التصحيح (تُنشأ ملاحظة وإجراء تصحيحي مرتبطان)</label>' : ""}
    <div class="row" style="margin-top:14px">
      <button id="o-save">حفظ</button>
      <button class="secondary" id="o-cancel">إلغاء</button>
    </div>`,
    { wide: true }
  );
  $("#o-cancel", ov).onclick = () => { ov.remove(); openDetail(v.id, () => {}, done); };
  $("#o-save", ov).onclick = async () => {
    const details = val("o-details", ov);
    if (!details) return toast("الشرح التفصيلي إلزامي", true);
    const rec = {
      id: o?.id || crypto.randomUUID(),
      code: o?.code || `${v.code}-M${String(observations.length + 1).padStart(2, "0")}`,
      obsDate: o?.obsDate || db.now(),
      departmentId: val("o-dept", ov) || null,
      severity: val("o-sev", ov),
      details,
      recommendation: val("o-rec", ov) || null,
      correctiveAction: val("o-corr", ov) || null,
      ownerId: val("o-owner", ov) || null,
      implDate: isoFromInput(val("o-date", ov)),
      timeframe: val("o-timeframe", ov) || null,
      implStatus: val("o-impl", ov),
      docs: val("o-docs", ov) || null,
      followResult: val("o-follow", ov) || null,
      findingCode: o?.findingCode || null,
    };
    try {
      // ترحيل آلي إلى سجل الملاحظات (مرة واحدة فقط)
      if (isNew && $("#o-mkfinding", ov)?.checked) {
        const code = await db.nextCode("FND");
        await db.setRow("findings", code, {
          code,
          title: `ملاحظة زيارة ميدانية ${v.site}: ${details.slice(0, 60)}`,
          description: `${details}${rec.recommendation ? `\nالتوصية: ${rec.recommendation}` : ""}`,
          source: "FIELD_VISIT",
          severity: rec.severity,
          requirementId: null, riskId: null, monitoringId: null, assessmentId: null,
          visitId: v.id, visitObsCode: rec.code,
          departmentId: rec.departmentId || null,
          status: "OPEN",
          dueDate: rec.implDate || new Date(Date.now() + 30 * 86400000).toISOString(),
          actions: rec.correctiveAction
            ? [{
                id: crypto.randomUUID(),
                description: rec.correctiveAction,
                ownerId: rec.ownerId || null,
                departmentId: rec.departmentId || null,
                dueDate: rec.implDate || new Date(Date.now() + 30 * 86400000).toISOString(),
                status: "OPEN", progress: 0, closureNotes: null, createdAt: db.now(),
              }]
            : [],
          createdAt: db.now(), updatedAt: db.now(),
        });
        rec.findingCode = code;
        await db.audit("CREATE", "Finding", code, `ملاحظة تلقائية من الزيارة الميدانية ${v.code}`);
        if (rec.severity === "CRITICAL" || rec.severity === "HIGH") {
          await db.notify({
            title: "ملاحظة زيارة ميدانية عالية الخطورة",
            message: `${code} — ${v.site}`,
            type: "FINDING_HIGH", link: "findings", roleTarget: "COMPLIANCE_MANAGER",
          });
        }
        await reload("findings");
      }

      const updated = isNew ? [...observations, rec] : observations.map((x) => (x.id === rec.id ? rec : x));
      await db.updateRow("visits", v.id, { observations: updated });
      await db.audit(isNew ? "CREATE" : "UPDATE", "Visit", v.code, `${isNew ? "إضافة" : "تحديث"} ملاحظة ${rec.code} في الزيارة ${v.code}`);
      await reload("visits");
      ov.remove();
      toast("تم الحفظ");
      const nv = store.visits.find((x) => x.id === v.id);
      if (nv) openDetail(nv.id, () => {}, done);
      done();
    } catch (err) {
      toast(err.message, true);
    }
  };
}
