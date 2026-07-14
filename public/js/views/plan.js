// الخطة السنوية للالتزام — مبادرات مربوطة بالمتطلبات والمخاطر ونتائج الفحص
// التوليد التلقائي: من المتطلبات الحرجة والمخاطر العالية ونتائج المراقبة غير الملتزمة
import { store, reload, deptName, userName, reqLabel, deptOptions, userOptions, reqOptions, riskOptions } from "../state.js";
import * as db from "../db.js";
import {
  $, esc, toast, modal, confirmBox, fld, txt, area, sel, dateInp, val, num,
  fmtDate, isoFromInput, statusBadgeFrom, progressBar, emptyMsg,
} from "../ui.js";
import { PLAN_STATUS, PLAN_SOURCES, riskLevel } from "../meta.js";
import { canEdit } from "../auth.js";

const ST_ROLE = { NOT_STARTED: "neutral", IN_PROGRESS: "warning", COMPLETED: "good", DELAYED: "critical" };
const filters = { year: new Date().getFullYear(), quarter: "", dept: "", status: "" };

export function renderPlan(el, nav, refresh) {
  const editable = canEdit(store.user);
  const years = [...new Set([new Date().getFullYear(), ...store.planItems.map((p) => p.year)])].filter(Boolean).sort();
  const rows = store.planItems
    .filter((p) => {
      if (filters.year && p.year !== Number(filters.year)) return false;
      if (filters.quarter && p.quarter !== Number(filters.quarter)) return false;
      if (filters.dept && p.departmentId !== filters.dept) return false;
      if (filters.status && p.status !== filters.status) return false;
      return true;
    })
    .sort((a, b) => (a.quarter || 0) - (b.quarter || 0));

  const avg = rows.length ? Math.round(rows.reduce((s, p) => s + (p.progress || 0), 0) / rows.length) : 0;

  el.innerHTML = `
    <div class="page-head">
      <h1>📅 الخطة السنوية للالتزام</h1>
      <div class="row">
        ${editable ? `
          <button id="gen-plan" class="secondary" title="توليد مبادرات تلقائياً من المتطلبات الحرجة والمخاطر العالية ونتائج المراقبة">⚙ توليد تلقائي</button>
          <button id="add-plan">＋ مبادرة جديدة</button>` : ""}
      </div>
    </div>
    <section class="card">
      <div class="row filters">
        ${sel("f-year", years.map(String), String(filters.year), { empty: "كل السنوات" })}
        ${sel("f-q", { 1: "الربع الأول", 2: "الربع الثاني", 3: "الربع الثالث", 4: "الربع الرابع" }, String(filters.quarter), { empty: "كل الأرباع" })}
        ${sel("f-dept", deptOptions(), filters.dept, { empty: "كل الإدارات" })}
        ${sel("f-status", PLAN_STATUS, filters.status, { empty: "كل الحالات" })}
        <span class="grow"></span>
        <span class="muted">متوسط الإنجاز: <strong>${avg}٪</strong></span>
      </div>
      <div style="overflow-x:auto">
        <table>
          <thead><tr>
            <th>المبادرة / النشاط</th><th>المصدر</th><th>الربع</th><th>الإدارة</th><th>المسؤول</th>
            <th>المخرجات المتوقعة</th><th>الإنجاز</th><th>الحالة</th>
          </tr></thead>
          <tbody>
            ${rows
              .map(
                (p) => `<tr class="rowlink" data-open="${p.id}">
                  <td><strong>${esc(p.title)}</strong>${p.requirementId ? `<div class="muted clamp">${esc(reqLabel(p.requirementId))}</div>` : ""}</td>
                  <td>${esc(PLAN_SOURCES[p.source] || p.source || "—")}</td>
                  <td>الربع ${p.quarter || "—"} / ${p.year || "—"}</td>
                  <td>${esc(deptName(p.departmentId))}</td>
                  <td>${esc(userName(p.ownerId))}</td>
                  <td class="muted clamp">${esc(p.expectedOutput || "—")}</td>
                  <td style="min-width:130px">${progressBar(p.progress)}</td>
                  <td>${statusBadgeFrom(PLAN_STATUS, p.status, ST_ROLE)}</td>
                </tr>`
              )
              .join("") || `<tr><td colspan="8">${emptyMsg("لا توجد مبادرات — استخدم التوليد التلقائي أو أضف يدوياً")}</td></tr>`}
          </tbody>
        </table>
      </div>
      <p class="muted">عدد النتائج: ${rows.length}</p>
    </section>`;

  const rerender = () => renderPlan(el, nav, refresh);
  $("#f-year", el).onchange = (e) => { filters.year = e.target.value; rerender(); };
  $("#f-q", el).onchange = (e) => { filters.quarter = e.target.value; rerender(); };
  $("#f-dept", el).onchange = (e) => { filters.dept = e.target.value; rerender(); };
  $("#f-status", el).onchange = (e) => { filters.status = e.target.value; rerender(); };
  $("#add-plan", el)?.addEventListener("click", () => openForm(null, rerender));
  $("#gen-plan", el)?.addEventListener("click", () => autoGenerate(rerender));
  el.querySelectorAll("[data-open]").forEach((tr) =>
    tr.addEventListener("click", () => openForm(store.planItems.find((p) => p.id === tr.dataset.open), rerender))
  );
}

function openForm(item, done) {
  const isNew = !item;
  const year = new Date().getFullYear();
  const ov = modal(
    `
    <h2>${isNew ? "إضافة مبادرة" : "تعديل المبادرة"}</h2>
    ${fld("المبادرة / النشاط *", txt("p-title", item?.title))}
    <div class="form-grid">
      ${fld("السنة", num("p-year", item?.year || year, 2024, 2040))}
      ${fld("الربع المستهدف", sel("p-q", { 1: "الربع الأول", 2: "الربع الثاني", 3: "الربع الثالث", 4: "الربع الرابع" }, String(item?.quarter || 1)))}
      ${fld("الإدارة المعنية", sel("p-dept", deptOptions(), item?.departmentId, { empty: "— اختر —" }))}
      ${fld("المسؤول", sel("p-owner", userOptions(), item?.ownerId, { empty: "— اختر —" }))}
      ${fld("المصدر", sel("p-source", PLAN_SOURCES, item?.source || "MANUAL"))}
      ${fld("المتطلب المرتبط", sel("p-req", reqOptions(), item?.requirementId, { empty: "— بلا —" }))}
      ${fld("الخطر المرتبط", sel("p-risk", riskOptions(), item?.riskId, { empty: "— بلا —" }))}
      ${fld("الحالة", sel("p-status", PLAN_STATUS, item?.status || "NOT_STARTED"))}
      ${fld("نسبة الإنجاز ٪", num("p-prog", item?.progress ?? 0, 0, 100))}
      ${fld("رابط الأدلة / المرفقات", txt("p-evidence", item?.evidenceUrl || "", "https://…"))}
    </div>
    ${fld("المخرجات المتوقعة", area("p-output", item?.expectedOutput, "", 2))}
    <div class="row" style="margin-top:14px">
      <button id="p-save">حفظ</button>
      ${!isNew ? '<button class="danger" id="p-del">حذف</button>' : ""}
      <button class="secondary" id="p-cancel">إلغاء</button>
    </div>`,
    { wide: true }
  );
  $("#p-cancel", ov).onclick = () => ov.remove();
  $("#p-del", ov)?.addEventListener("click", async () => {
    ov.remove();
    if (!(await confirmBox("حذف هذه المبادرة؟"))) return;
    await db.removeRow("planItems", item.id);
    await db.audit("DELETE", "PlanItem", item.id, `حذف مبادرة: ${item.title}`);
    await reload("planItems");
    toast("تم الحذف");
    done();
  });
  $("#p-save", ov).onclick = async () => {
    const title = val("p-title", ov);
    if (!title) return toast("اسم المبادرة إلزامي", true);
    const progress = Math.max(0, Math.min(100, Number(val("p-prog", ov)) || 0));
    const status = progress >= 100 ? "COMPLETED" : val("p-status", ov);
    const data = {
      title,
      year: Number(val("p-year", ov)) || new Date().getFullYear(),
      quarter: Number(val("p-q", ov)) || 1,
      departmentId: val("p-dept", ov) || null,
      ownerId: val("p-owner", ov) || null,
      source: val("p-source", ov),
      requirementId: val("p-req", ov) || null,
      riskId: val("p-risk", ov) || null,
      monitoringId: item?.monitoringId || null,
      status,
      progress,
      evidenceUrl: val("p-evidence", ov) || null,
      expectedOutput: val("p-output", ov),
    };
    try {
      if (isNew) {
        await db.addRow("planItems", { ...data, createdAt: db.now(), updatedAt: db.now() });
        await db.audit("CREATE", "PlanItem", null, `إضافة مبادرة: ${title}`);
      } else {
        await db.updateRow("planItems", item.id, data);
        await db.audit("UPDATE", "PlanItem", item.id, `تحديث مبادرة: ${title} (${progress}٪)`);
      }
      await reload("planItems");
      ov.remove();
      toast("تم الحفظ");
      done();
    } catch (err) {
      toast(err.message, true);
    }
  };
}

// توليد الخطة تلقائياً من مصادر البيانات
async function autoGenerate(done) {
  const year = new Date().getFullYear();
  const existing = store.planItems.filter((p) => p.year === year);
  const has = (field, id) => existing.some((p) => p[field] === id);
  const candidates = [];

  // 1) متطلبات حرجة/عالية بلا مبادرة
  for (const r of store.requirements) {
    if (!["CRITICAL", "HIGH"].includes(r.criticality) || r.status === "CANCELLED") continue;
    if (has("requirementId", r.id)) continue;
    candidates.push({
      title: `التحقق من الالتزام بالمتطلب ${r.code} — ${r.title}`.slice(0, 120),
      source: "REQUIREMENT", requirementId: r.id, riskId: null, monitoringId: null,
      departmentId: r.ownerDeptId || null,
      expectedOutput: "تقرير التزام معتمد بالمتطلب",
    });
  }
  // 2) مخاطر عالية بلا مبادرة
  for (const k of store.risks) {
    const lvl = riskLevel(k.residualLikelihood ?? k.likelihood, k.residualImpact ?? k.impact);
    if (!["CRITICAL", "HIGH"].includes(lvl.key) || k.status === "CLOSED") continue;
    if (has("riskId", k.id)) continue;
    candidates.push({
      title: `معالجة الخطر ${k.code} — ${k.title}`.slice(0, 120),
      source: "RISK", requirementId: k.requirementId || null, riskId: k.id, monitoringId: null,
      departmentId: k.ownerDeptId || null,
      expectedOutput: "خفض مستوى الخطر المتبقي وتوثيق الضوابط",
    });
  }
  // 3) نتائج مراقبة غير ملتزمة بلا مبادرة
  for (const m of store.monitoring) {
    if (m.result !== "NON_COMPLIANT" && m.result !== "PARTIAL") continue;
    if (has("monitoringId", m.id)) continue;
    candidates.push({
      title: `متابعة تصحيح نتائج: ${m.name}`.slice(0, 120),
      source: "MONITORING", requirementId: m.requirementId || null, riskId: m.riskId || null, monitoringId: m.id,
      departmentId: m.targetDeptId || null,
      expectedOutput: "إغلاق الملاحظات وتحقيق الالتزام الكامل",
    });
  }

  if (!candidates.length) return toast("لا توجد عناصر جديدة للتوليد — الخطة تغطي كل المصادر الحالية");
  if (!(await confirmBox(`سيُنشأ ${candidates.length} مبادرة جديدة في خطة ${year} من المتطلبات والمخاطر ونتائج المراقبة. متابعة؟`))) return;

  try {
    const manager = store.users.find((u) => u.role === "COMPLIANCE_MANAGER") || null;
    for (const c of candidates) {
      await db.addRow("planItems", {
        ...c,
        year,
        quarter: Math.min(4, Math.floor(new Date().getMonth() / 3) + 2),
        ownerId: manager?.id || store.user.uid,
        status: "NOT_STARTED",
        progress: 0,
        evidenceUrl: null,
        createdAt: db.now(),
        updatedAt: db.now(),
      });
    }
    await db.audit("CREATE", "PlanItem", null, `توليد تلقائي للخطة السنوية ${year}: ${candidates.length} مبادرة جديدة`);
    await reload("planItems");
    toast(`أُنشئت ${candidates.length} مبادرة`);
    done();
  } catch (err) {
    toast(err.message, true);
  }
}
