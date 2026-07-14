// مكتبة الالتزام — المتطلبات النظامية المركزية مع الترابط مع بقية الوحدات
import { store, reload, deptName, authName, deptOptions, authOptions } from "../state.js";
import * as db from "../db.js";
import {
  $, esc, toast, modal, confirmBox, fld, txt, area, sel, dateInp, val,
  fmtDate, daysUntil, isoFromInput, levelBadge, statusBadgeFrom, emptyMsg, chip,
} from "../ui.js";
import { REQ_TYPES, REQ_CATEGORIES, CRITICALITY, REQ_STATUS, REQ_SCOPE, SECTORS } from "../meta.js";
import { canEdit, canApprove } from "../auth.js";
import { renderRegulations } from "./regulations.js";

const CRIT_ROLE = { CRITICAL: "critical", HIGH: "serious", MEDIUM: "warning", LOW: "good" };
const ST_ROLE = { ACTIVE: "good", UPDATED: "good", UNDER_REVIEW: "warning", CANCELLED: "neutral" };

const filters = { search: "", category: "", criticality: "", status: "", dept: "" };
// تبويبا المكتبة: المتطلبات + التحليل الذكي (مدمج هنا)
const tabState = { tab: "reqs" };

function tabsHtml(editable) {
  return `
    <div class="page-head">
      <h1>📖 مكتبة الالتزام</h1>
      <div class="row">
        <div class="subtabs">
          <button class="subtab ${tabState.tab === "reqs" ? "active" : ""}" data-tab="reqs" title="عرض المتطلبات النظامية المسجلة في المكتبة">📋 المتطلبات</button>
          <button class="subtab ${tabState.tab === "analysis" ? "active" : ""}" data-tab="analysis" title="تحليل الأنظمة واللوائح بالذكاء الاصطناعي واستخراج موادها وغراماتها">🤖 التحليل الذكي</button>
        </div>
        ${tabState.tab === "reqs" && editable ? '<button id="add-req" title="إضافة متطلب نظامي جديد إلى مكتبة الالتزام">＋ متطلب جديد</button>' : ""}
      </div>
    </div>`;
}

function bindTabs(el, rerender) {
  el.querySelectorAll("[data-tab]").forEach((b) => {
    b.onclick = () => {
      tabState.tab = b.dataset.tab;
      rerender();
    };
  });
}

export function renderLibrary(el, nav, refresh, params = {}) {
  const user = store.user;
  const editable = canEdit(user);
  if (params.tab) tabState.tab = params.tab;
  if (params.createFor) tabState.tab = "analysis";
  const rerenderTabs = () => renderLibrary(el, nav, refresh);

  if (tabState.tab === "analysis") {
    el.innerHTML = tabsHtml(editable) + '<div id="lib-analysis"></div>';
    bindTabs(el, rerenderTabs);
    renderRegulations($("#lib-analysis", el), nav, refresh, params);
    return;
  }
  const rows = store.requirements.filter((r) => {
    if (filters.search && !`${r.code} ${r.title} ${r.summary || ""}`.includes(filters.search)) return false;
    if (filters.category && r.category !== filters.category) return false;
    if (filters.criticality && r.criticality !== filters.criticality) return false;
    if (filters.status && r.status !== filters.status) return false;
    if (filters.dept && r.ownerDeptId !== filters.dept) return false;
    return true;
  });

  el.innerHTML = `
    ${tabsHtml(editable)}
    <section class="card">
      <div class="row filters">
        <input type="text" id="f-search" class="grow" placeholder="بحث بالرمز أو الاسم…" value="${esc(filters.search)}" />
        ${sel("f-cat", REQ_CATEGORIES, filters.category, { empty: "كل التصنيفات" })}
        ${sel("f-crit", CRITICALITY, filters.criticality, { empty: "كل درجات الأهمية" })}
        ${sel("f-status", REQ_STATUS, filters.status, { empty: "كل الحالات" })}
        ${sel("f-dept", deptOptions(), filters.dept, { empty: "كل الإدارات" })}
      </div>
      <div style="overflow-x:auto">
        <table>
          <thead><tr>
            <th>الرمز</th><th>فئة الوثيقة</th><th>رقم الوثيقة</th><th>اسم الوثيقة</th><th>رقم البند</th>
            <th>خاص/عام</th><th>الأهمية</th><th>الإدارة المالكة</th><th>المراجعة القادمة</th><th>الحالة</th><th>الروابط</th>
          </tr></thead>
          <tbody>
            ${rows
              .map((r) => {
                const d = daysUntil(r.nextReviewDate);
                const riskCount = store.risks.filter((x) => x.requirementId === r.id).length;
                const monCount = store.monitoring.filter((x) => x.requirementId === r.id).length;
                const planCount = store.planItems.filter((x) => x.requirementId === r.id).length;
                return `<tr class="rowlink" data-open="${r.id}">
                  <td><strong>${esc(r.code)}</strong></td>
                  <td>${esc(REQ_TYPES[r.type] || r.type || "—")}</td>
                  <td class="muted">${esc(r.docNumber || "—")}</td>
                  <td><strong>${esc(r.title)}</strong><div class="muted clamp">${esc(r.clauseText || r.summary || "")}</div></td>
                  <td class="muted">${esc(r.articleNumber || "—")}</td>
                  <td>${esc(REQ_SCOPE[r.scope] || "—")}</td>
                  <td>${levelBadge(r.criticality, CRITICALITY[r.criticality] || r.criticality || "—")}</td>
                  <td>${esc(deptName(r.ownerDeptId))}</td>
                  <td>${fmtDate(r.nextReviewDate)}${d !== null && d < 0 ? ' <span class="lvl lvl-critical"><span class="dot"></span>متأخرة</span>' : d !== null && d <= 30 ? ' <span class="lvl lvl-warning"><span class="dot"></span>قريبة</span>' : ""}</td>
                  <td>${statusBadgeFrom(REQ_STATUS, r.status, ST_ROLE)}</td>
                  <td class="muted">⚠${riskCount} 🔍${monCount} 📅${planCount}</td>
                </tr>`;
              })
              .join("") || `<tr><td colspan="11">${emptyMsg("لا توجد متطلبات مطابقة")}</td></tr>`}
          </tbody>
        </table>
      </div>
      <p class="muted">عدد النتائج: ${rows.length} من ${store.requirements.length}</p>
    </section>`;

  const rerender = () => renderLibrary(el, nav, refresh);
  bindTabs(el, rerenderTabs);
  $("#f-search", el).addEventListener("input", (e) => { filters.search = e.target.value; rerender(); });
  $("#f-cat", el).onchange = (e) => { filters.category = e.target.value; rerender(); };
  $("#f-crit", el).onchange = (e) => { filters.criticality = e.target.value; rerender(); };
  $("#f-status", el).onchange = (e) => { filters.status = e.target.value; rerender(); };
  $("#f-dept", el).onchange = (e) => { filters.dept = e.target.value; rerender(); };
  $("#add-req", el)?.addEventListener("click", () => openForm(null, rerender));
  el.querySelectorAll("[data-open]").forEach((tr) => {
    tr.addEventListener("click", () => openDetail(tr.dataset.open, nav, rerender));
  });
}

function openForm(req, done) {
  const isNew = !req;
  const ov = modal(
    `
    <h2>${isNew ? "إضافة متطلب جديد" : `تعديل ${esc(req.code)}`}</h2>
    <h3 class="form-sec">بيانات الوثيقة (موسوعة الالتزام)</h3>
    <div class="form-grid">
      ${fld("فئة الوثيقة", sel("q-type", REQ_TYPES, req?.type || "SYSTEM"))}
      ${fld("رقم الوثيقة", txt("q-docno", req?.docNumber, "مثل: م/19 بتاريخ 9/2/1443هـ"))}
      ${fld("اسم الوثيقة *", txt("q-title", req?.title))}
      ${fld("رقم البند / المادة", txt("q-artno", req?.articleNumber, "مثل: المادة 40 / البند 2.3"))}
      ${fld("خاص / عام", sel("q-scope", REQ_SCOPE, req?.scope || "PUBLIC"))}
      ${fld("مالك خطر عدم الالتزام", txt("q-riskowner", req?.riskOwner, "الجهة/المنصب المسؤول"))}
      ${fld("القطاع", sel("q-sector", SECTORS, req?.sector, { empty: "— اختر —" }))}
      ${fld("الجهة التنظيمية", sel("q-auth", authOptions(), req?.authorityId, { empty: "— اختر —" }))}
    </div>
    ${fld("نص البند / المادة", area("q-clause", req?.clauseText, "النص الحرفي للبند أو المادة", 4))}
    <h3 class="form-sec">قرار التعديل (إن وجد)</h3>
    <div class="form-grid">
      ${fld("رقم قرار التعديل", txt("q-amdno", req?.amendmentNo))}
      ${fld("اسم قرار التعديل", txt("q-amdname", req?.amendmentName))}
    </div>
    ${fld("نص قرار التعديل", area("q-amdtext", req?.amendmentText, "", 2))}
    <h3 class="form-sec">التصنيف والإدارة</h3>
    <div class="form-grid">
      ${fld("التصنيف الموضوعي", sel("q-cat", REQ_CATEGORIES, req?.category || "GOVERNANCE"))}
      ${fld("درجة الأهمية", sel("q-crit", CRITICALITY, req?.criticality || "MEDIUM"))}
      ${fld("الإدارة المالكة", sel("q-dept", deptOptions(), req?.ownerDeptId, { empty: "— اختر —" }))}
      ${fld("تاريخ الإصدار", dateInp("q-issue", req?.issueDate))}
      ${fld("تاريخ المراجعة القادم", dateInp("q-review", req?.nextReviewDate))}
      ${fld("الحالة", sel("q-status", REQ_STATUS, req?.status || "ACTIVE"))}
      ${fld("رابط المرفق (اختياري)", txt("q-attach", req?.attachmentUrl || "", "https://…"))}
    </div>
    ${fld("ملخص الالتزام / ملاحظات", area("q-summary", req?.summary, "", 3))}
    ${isNew ? '<label class="chk"><input type="checkbox" id="q-mkrisk" checked /> إنشاء خطر مرتبط تلقائياً في سجل المخاطر</label>' : ""}
    <div class="row" style="margin-top:14px">
      <button id="q-save">حفظ</button>
      <button class="secondary" id="q-cancel">إلغاء</button>
    </div>`,
    { wide: true }
  );
  $("#q-cancel", ov).onclick = () => ov.remove();
  $("#q-save", ov).onclick = async () => {
    const title = val("q-title", ov);
    if (!title) return toast("اسم المتطلب إلزامي", true);
    const data = {
      title,
      docNumber: val("q-docno", ov) || null,
      articleNumber: val("q-artno", ov) || null,
      clauseText: val("q-clause", ov) || null,
      scope: val("q-scope", ov),
      riskOwner: val("q-riskowner", ov) || null,
      sector: val("q-sector", ov) || null,
      amendmentNo: val("q-amdno", ov) || null,
      amendmentName: val("q-amdname", ov) || null,
      amendmentText: val("q-amdtext", ov) || null,
      authorityId: val("q-auth", ov) || null,
      type: val("q-type", ov),
      category: val("q-cat", ov),
      criticality: val("q-crit", ov),
      ownerDeptId: val("q-dept", ov) || null,
      issueDate: isoFromInput(val("q-issue", ov)),
      nextReviewDate: isoFromInput(val("q-review", ov)),
      status: val("q-status", ov),
      attachmentUrl: val("q-attach", ov) || null,
      summary: val("q-summary", ov),
      lastUpdated: db.now(),
    };
    try {
      if (isNew) {
        const code = await db.nextCode("REQ");
        const row = await db.setRow("requirements", code, {
          ...data,
          code,
          createdById: store.user.uid,
          approvedById: null,
          createdAt: db.now(),
        });
        await db.audit("CREATE", "Requirement", code, `إضافة متطلب: ${code} — ${title}`);
        await db.notify({
          title: "متطلب جديد في مكتبة الالتزام",
          message: `${code} — ${title}`,
          type: "REQ_NEW",
          link: "library",
          roleTarget: "COMPLIANCE_MANAGER",
        });
        if ($("#q-mkrisk", ov)?.checked) {
          const rcode = await db.nextCode("RSK");
          await db.setRow("risks", rcode, {
            code: rcode,
            title: `خطر عدم الالتزام — ${title}`,
            description: `احتمال عدم الالتزام بالمتطلب ${code} (${title})`,
            cause: "",
            penalty: "",
            source: "AUTO_LIBRARY",
            sourceKey: `req::${row.id}`,
            requirementId: row.id,
            likelihood: 3,
            impact: data.criticality === "CRITICAL" ? 5 : data.criticality === "HIGH" ? 4 : 3,
            residualLikelihood: 3,
            residualImpact: data.criticality === "CRITICAL" ? 5 : data.criticality === "HIGH" ? 4 : 3,
            controls: [],
            ownerDeptId: data.ownerDeptId,
            treatmentOwnerId: null,
            treatmentPlan: "",
            kri: "",
            dueDate: null,
            status: "OPEN",
            createdAt: db.now(),
            updatedAt: db.now(),
          });
          await db.audit("CREATE", "Risk", rcode, `إنشاء خطر تلقائي مرتبط بالمتطلب ${code}`);
        }
        await reload("requirements", "risks");
      } else {
        await db.updateRow("requirements", req.id, data);
        await db.audit("UPDATE", "Requirement", req.code, `تعديل المتطلب ${req.code}`);
        await reload("requirements");
      }
      ov.remove();
      toast("تم الحفظ");
      done();
    } catch (err) {
      toast(err.message, true);
    }
  };
}

export function openDetail(id, nav, done) {
  const r = store.requirements.find((x) => x.id === id);
  if (!r) return;
  const user = store.user;
  const editable = canEdit(user);
  const risks = store.risks.filter((x) => x.requirementId === id);
  const mons = store.monitoring.filter((x) => x.requirementId === id);
  const plans = store.planItems.filter((x) => x.requirementId === id);
  const finds = store.findings.filter((x) => x.requirementId === id);
  const regs = store.regulations.filter((x) => x.requirementId === id);

  const linkList = (items, fmt, view) =>
    items.length
      ? `<ul class="link-list">${items.map((i) => `<li data-nav="${view}">${fmt(i)}</li>`).join("")}</ul>`
      : '<p class="muted">لا يوجد</p>';

  const ov = modal(
    `
    <div class="row" style="justify-content:space-between">
      <h2>${esc(r.code)} — ${esc(r.title)}</h2>
      <span>${statusBadgeFrom(REQ_STATUS, r.status, ST_ROLE)}</span>
    </div>
    <div class="detail-grid">
      <div><span class="muted">فئة الوثيقة</span><br/>${esc(REQ_TYPES[r.type] || r.type || "—")}</div>
      <div><span class="muted">رقم الوثيقة</span><br/>${esc(r.docNumber || "—")}</div>
      <div><span class="muted">رقم البند / المادة</span><br/>${esc(r.articleNumber || "—")}</div>
      <div><span class="muted">خاص / عام</span><br/>${esc(REQ_SCOPE[r.scope] || "—")}</div>
      <div><span class="muted">مالك خطر عدم الالتزام</span><br/>${esc(r.riskOwner || "—")}</div>
      <div><span class="muted">القطاع</span><br/>${esc(r.sector || "—")}</div>
      <div><span class="muted">الجهة التنظيمية</span><br/>${esc(authName(r.authorityId))}</div>
      <div><span class="muted">التصنيف الموضوعي</span><br/>${esc(REQ_CATEGORIES[r.category] || r.category || "—")}</div>
      <div><span class="muted">الأهمية</span><br/>${levelBadge(r.criticality, CRITICALITY[r.criticality] || "—")}</div>
      <div><span class="muted">الإدارة المالكة</span><br/>${esc(deptName(r.ownerDeptId))}</div>
      <div><span class="muted">تاريخ الإصدار</span><br/>${fmtDate(r.issueDate)}</div>
      <div><span class="muted">المراجعة القادمة</span><br/>${fmtDate(r.nextReviewDate)}</div>
    </div>
    ${r.clauseText ? `<p><strong>نص البند / المادة:</strong></p><p class="pre-line">${esc(r.clauseText)}</p>` : ""}
    ${r.amendmentNo || r.amendmentName || r.amendmentText ? `<div class="card sub"><h3>قرار التعديل</h3>${r.amendmentNo ? `<p><strong>الرقم:</strong> ${esc(r.amendmentNo)}</p>` : ""}${r.amendmentName ? `<p><strong>الاسم:</strong> ${esc(r.amendmentName)}</p>` : ""}${r.amendmentText ? `<p class="pre-line">${esc(r.amendmentText)}</p>` : ""}</div>` : ""}
    ${r.summary ? `<p class="pre-line">${esc(r.summary)}</p>` : ""}
    ${r.attachmentUrl ? `<p>📎 <a href="${esc(r.attachmentUrl)}" target="_blank" rel="noopener">المرفق</a></p>` : ""}
    ${r.approvedById ? `<p class="muted">✔ معتمد</p>` : editable && canApprove(user) ? '<button class="secondary small" id="d-approve">✔ اعتماد المتطلب</button>' : '<p class="muted">بانتظار الاعتماد</p>'}

    <div class="grid-2" style="margin-top:14px">
      <div class="card sub">
        <h3>⚠ المخاطر المرتبطة (${risks.length})</h3>
        ${linkList(risks, (i) => `<strong>${esc(i.code)}</strong> ${esc(i.title)}`, "risks")}
      </div>
      <div class="card sub">
        <h3>🔍 أنشطة المراقبة (${mons.length})</h3>
        ${linkList(mons, (i) => `<strong>${esc(i.code)}</strong> ${esc(i.name)}`, "monitoring")}
      </div>
      <div class="card sub">
        <h3>📅 الخطة السنوية (${plans.length})</h3>
        ${linkList(plans, (i) => esc(i.title), "plan")}
      </div>
      <div class="card sub">
        <h3>🛠 الملاحظات (${finds.length})</h3>
        ${linkList(finds, (i) => `<strong>${esc(i.code)}</strong> ${esc(i.title)}`, "findings")}
      </div>
    </div>
    ${regs.length ? `<div class="card sub"><h3>🤖 تحليلات ذكية مرتبطة</h3>${linkList(regs, (i) => `${esc(i.name)} (${i.articles_count} مادة)`, "regulations")}</div>` : ""}

    <div class="row" style="margin-top:14px">
      ${editable ? `
        <button id="d-edit" title="تعديل بيانات هذا المتطلب">تعديل</button>
        <button class="secondary" id="d-analyze" title="تحليل نص المتطلب واستخراج مواده بالذكاء الاصطناعي">🤖 تحليل ذكي للنص</button>
        <button class="danger" id="d-del" title="حذف هذا المتطلب من المكتبة">حذف</button>` : ""}
      <button class="secondary" id="d-close" title="إغلاق نافذة التفاصيل">إغلاق</button>
    </div>`,
    { wide: true }
  );

  ov.querySelectorAll("[data-nav]").forEach((li) =>
    li.addEventListener("click", () => { ov.remove(); nav(li.dataset.nav); })
  );
  $("#d-close", ov).onclick = () => ov.remove();
  $("#d-approve", ov)?.addEventListener("click", async () => {
    await db.updateRow("requirements", r.id, { approvedById: user.uid });
    await db.audit("APPROVE", "Requirement", r.code, `اعتماد المتطلب ${r.code}`);
    await reload("requirements");
    ov.remove();
    toast("تم الاعتماد");
    done();
  });
  $("#d-edit", ov)?.addEventListener("click", () => { ov.remove(); openForm(r, done); });
  $("#d-analyze", ov)?.addEventListener("click", () => { ov.remove(); nav("regulations", { createFor: r }); });
  $("#d-del", ov)?.addEventListener("click", async () => {
    ov.remove();
    if (!(await confirmBox(`حذف المتطلب ${r.code}؟ لن تُحذف السجلات المرتبطة به لكنها ستفقد الربط.`))) return;
    await db.removeRow("requirements", r.id);
    await db.audit("DELETE", "Requirement", r.code, `حذف المتطلب ${r.code} — ${r.title}`);
    await reload("requirements");
    toast("تم الحذف");
    done();
  });
}
