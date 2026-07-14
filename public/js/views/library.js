// مكتبة الالتزام — تبويبان:
//  1) الوثائق: مكتبة مجمّعة للوثائق النظامية والتشريعية مع الإضافة والتحليل الذكي (regulations)
//  2) المتطلبات النظامية: انعكاس لبنود ومواد الوثائق بنداً بنداً (articles) — الإدارة المالكة،
//     مالك خطر عدم الالتزام، الانطباق، درجة الخطر، وربطها بسجل المخاطر (يدوياً أو من التحليل)
import { store, reload, deptName, reqLabel } from "../state.js";
import * as db from "../db.js";
import {
  $, esc, toast, modal, confirmBox, fld, txt, area, sel, val,
  fmtDate, levelBadge, emptyMsg, spinnerHtml,
} from "../ui.js";
import { REQ_TYPES, SECTORS, DEPARTMENTS, RISK_LEVELS, APPLICABILITY, REQ_SCOPE, riskLevel } from "../meta.js";
import { canEdit } from "../auth.js";
import { renderRegulations } from "./regulations.js";

const tabState = { tab: "docs" };
const cfilters = { search: "", doc: "", applicability: "", risk: "", department: "", linked: "" };

// ذاكرة البنود المسطّحة عبر جميع الوثائق (تُحمَّل مرة وتُحدَّث عند الطلب)
let clauseCache = null;
async function loadClauses(force = false) {
  if (clauseCache && !force) return clauseCache;
  const regs = await db.allRegulations().catch(() => []);
  clauseCache = [];
  for (const reg of regs) {
    for (const a of reg.articles || []) {
      clauseCache.push({ ...a, regId: reg.id, regName: reg.name, docCategory: reg.docCategory, docNumber: reg.docNumber, requirementId: reg.requirementId });
    }
  }
  return clauseCache;
}
export function invalidateClauseCache() { clauseCache = null; }

// المخاطر المرتبطة ببند معيّن (من الاشتقاق الآلي أو الربط اليدوي)
const risksForClause = (c) =>
  store.risks.filter((r) => r.sourceArticleId === c.id || r.sourceKey === `${c.regId}::${c.number}`);

const deptIdByName = (name) => store.departments.find((d) => d.name === name)?.id || null;

function tabsHtml(editable) {
  return `
    <div class="page-head">
      <h1>📖 مكتبة الالتزام</h1>
      <div class="row">
        <div class="subtabs">
          <button class="subtab ${tabState.tab === "docs" ? "active" : ""}" data-tab="docs" title="مكتبة الوثائق النظامية والتشريعية — الإضافة والتحليل الذكي">🗂 الوثائق</button>
          <button class="subtab ${tabState.tab === "reqs" ? "active" : ""}" data-tab="reqs" title="المتطلبات النظامية بنداً بنداً — انعكاس لمواد وبنود الوثائق">📋 المتطلبات النظامية</button>
        </div>
      </div>
    </div>`;
}

function bindTabs(el, rerender) {
  el.querySelectorAll("[data-tab]").forEach((b) => {
    b.onclick = () => { tabState.tab = b.dataset.tab; rerender(); };
  });
}

export function renderLibrary(el, nav, refresh, params = {}) {
  const editable = canEdit(store.user);
  if (params.tab === "analysis" || params.tab === "docs") tabState.tab = "docs";
  else if (params.tab === "reqs") tabState.tab = "reqs";
  if (params.createFor) tabState.tab = "docs";
  const rerenderTabs = () => renderLibrary(el, nav, refresh);

  if (tabState.tab === "docs") {
    el.innerHTML = tabsHtml(editable) + '<div id="lib-docs"></div>';
    bindTabs(el, rerenderTabs);
    renderRegulations($("#lib-docs", el), nav, refresh, params);
    return;
  }
  // تبويب المتطلبات النظامية — يُحدَّث من الوثائق عند كل دخول للتبويب
  invalidateClauseCache();
  el.innerHTML = tabsHtml(editable) + '<div id="lib-reqs">' + spinnerHtml("جاري تحميل بنود الوثائق…") + "</div>";
  bindTabs(el, rerenderTabs);
  renderDetailed($("#lib-reqs", el), nav, editable);
}

async function renderDetailed(host, nav, editable) {
  const clauses = await loadClauses();
  const docs = store.regulations;

  const rows = clauses.filter((c) => {
    if (cfilters.search && !`${c.number} ${c.title} ${c.text} ${c.regName}`.includes(cfilters.search)) return false;
    if (cfilters.doc && c.regId !== cfilters.doc) return false;
    if (cfilters.applicability && c.applicability !== cfilters.applicability) return false;
    if (cfilters.risk && c.risk_level !== cfilters.risk) return false;
    if (cfilters.department && c.owning_department !== cfilters.department) return false;
    if (cfilters.linked === "yes" && !risksForClause(c).length) return false;
    if (cfilters.linked === "no" && risksForClause(c).length) return false;
    return true;
  });

  const applies = clauses.filter((c) => c.applicability === "تنطبق").length;
  const linked = clauses.filter((c) => risksForClause(c).length).length;

  host.innerHTML = `
    <div class="stats">
      <div class="stat"><div class="num">${clauses.length}</div><div class="lbl">إجمالي البنود والمواد</div><div class="sub">من ${docs.length} وثيقة</div></div>
      <div class="stat"><div class="num">${applies}</div><div class="lbl">بنود منطبقة</div></div>
      <div class="stat"><div class="num">${linked}</div><div class="lbl">مرتبطة بمخاطر</div></div>
      <div class="stat"><div class="num">${clauses.length - linked}</div><div class="lbl">بلا خطر مرتبط</div></div>
    </div>
    <section class="card">
      <div class="row filters">
        <input type="text" id="cf-search" class="grow" placeholder="بحث في البنود…" value="${esc(cfilters.search)}" />
        ${sel("cf-doc", docs.map((d) => ({ id: d.id, name: d.name })), cfilters.doc, { empty: "كل الوثائق" })}
        ${sel("cf-app", APPLICABILITY, cfilters.applicability, { empty: "كل حالات الانطباق" })}
        ${sel("cf-risk", RISK_LEVELS, cfilters.risk, { empty: "كل درجات الخطر" })}
        ${sel("cf-dept", DEPARTMENTS, cfilters.department, { empty: "كل الإدارات" })}
        ${sel("cf-linked", { yes: "مرتبطة بمخاطر", no: "بلا خطر" }, cfilters.linked, { empty: "الربط بالمخاطر" })}
        ${editable ? '<button class="small" id="cf-add" title="إضافة متطلب/بند يدوياً إلى وثيقة">＋ متطلب يدوي</button>' : ""}
      </div>
      <div style="overflow-x:auto">
        <table>
          <thead><tr>
            <th>الوثيقة</th><th>رقم المادة/البند</th><th>نص المادة/البند</th><th>الانطباق</th>
            <th>الإدارة المالكة</th><th>مالك الخطر</th><th>درجة الخطر</th><th>المخاطر المرتبطة</th>
          </tr></thead>
          <tbody>
            ${rows
              .map((c) => {
                const rk = risksForClause(c);
                return `<tr class="rowlink" data-clause="${c.regId}::${c.id}">
                  <td class="muted">${esc(REQ_TYPES[c.docCategory] || "")}<br/><strong>${esc(c.regName)}</strong></td>
                  <td><strong>${esc(c.number)}</strong>${c.needs_review ? '<br/><span class="lvl lvl-warning"><span class="dot"></span>للمراجعة</span>' : ""}</td>
                  <td><strong>${esc(c.title || "")}</strong><div class="muted clamp">${esc(c.text || "")}</div>
                    ${c.penalty ? `<span class="penalty-chip" data-tip="${esc(c.penalty)}">⚖ عقوبة</span>` : ""}</td>
                  <td>${c.applicability === "تنطبق" ? '<span class="lvl lvl-good"><span class="dot"></span>تنطبق</span>' : '<span class="lvl lvl-neutral"><span class="dot"></span>لا تنطبق</span>'}</td>
                  <td>${esc(c.owning_department || "—")}</td>
                  <td class="muted">${esc(c.risk_owner || "—")}</td>
                  <td>${riskBadge(c.risk_level)}</td>
                  <td>${rk.length ? rk.map((r) => `<span class="chip" data-tip="${esc(r.title)}">⚠ ${esc(r.code)}</span>`).join(" ") : '<span class="muted">—</span>'}</td>
                </tr>`;
              })
              .join("") || `<tr><td colspan="8">${emptyMsg("لا توجد بنود مطابقة — أضِف وثيقة وحلّلها من تبويب «الوثائق»")}</td></tr>`}
          </tbody>
        </table>
      </div>
      <p class="muted">عدد النتائج: ${rows.length} من ${clauses.length}</p>
    </section>`;

  const rerender = () => renderDetailed(host, nav, editable);
  $("#cf-search", host).addEventListener("input", (e) => { cfilters.search = e.target.value; rerender(); });
  $("#cf-doc", host).onchange = (e) => { cfilters.doc = e.target.value; rerender(); };
  $("#cf-app", host).onchange = (e) => { cfilters.applicability = e.target.value; rerender(); };
  $("#cf-risk", host).onchange = (e) => { cfilters.risk = e.target.value; rerender(); };
  $("#cf-dept", host).onchange = (e) => { cfilters.department = e.target.value; rerender(); };
  $("#cf-linked", host).onchange = (e) => { cfilters.linked = e.target.value; rerender(); };
  $("#cf-add", host)?.addEventListener("click", () => openManualClause(nav, rerender));
  host.querySelectorAll("[data-clause]").forEach((tr) =>
    tr.addEventListener("click", () => {
      const [regId, artId] = tr.dataset.clause.split("::");
      openClause(regId, artId, nav, rerender);
    })
  );
}

const riskBadge = (level) => {
  const role = level === "عالي" ? "critical" : level === "منخفض" ? "good" : "warning";
  return `<span class="lvl lvl-${role}"><span class="dot"></span>${esc(level || "—")}</span>`;
};

// تفاصيل البند: تعديل الانطباق/الإدارة/مالك الخطر/درجة الخطر + عرض المخاطر المرتبطة + إنشاء خطر
function openClause(regId, artId, nav, done) {
  const c = clauseCache.find((x) => x.regId === regId && x.id === artId);
  if (!c) return;
  const editable = canEdit(store.user);
  const rk = risksForClause(c);

  const ov = modal(
    `
    <div class="row" style="justify-content:space-between">
      <h2>${esc(c.number)} — ${esc(c.regName)}</h2>
      ${riskBadge(c.risk_level)}
    </div>
    ${c.title ? `<p><strong>${esc(c.title)}</strong></p>` : ""}
    <p class="pre-line">${esc(c.text || "")}</p>
    ${c.penalty ? `<p><span class="penalty-chip">⚖ ${esc(c.penalty)}</span></p>` : ""}
    ${editable ? `
      <div class="form-grid">
        ${fld("الانطباق", sel("cl-app", APPLICABILITY, c.applicability || "تنطبق"))}
        ${fld("خاص / عام", sel("cl-scope", REQ_SCOPE, c.scope === "خاص" ? "PRIVATE" : "PUBLIC"))}
        ${fld("درجة الخطر", sel("cl-risk", RISK_LEVELS, c.risk_level || "متوسط"))}
        ${fld("الإدارة المالكة", sel("cl-dept", DEPARTMENTS, c.owning_department || "الالتزام"))}
        ${fld("مالك خطر عدم الالتزام", txt("cl-owner", c.risk_owner || ""))}
      </div>` : `
      <div class="detail-grid">
        <div><span class="muted">الانطباق</span><br/>${esc(c.applicability || "—")}</div>
        <div><span class="muted">الإدارة المالكة</span><br/>${esc(c.owning_department || "—")}</div>
        <div><span class="muted">مالك الخطر</span><br/>${esc(c.risk_owner || "—")}</div>
      </div>`}

    <div class="card sub">
      <h3>⚠ المخاطر المرتبطة (${rk.length})</h3>
      ${rk.map((r) => `<div class="link-item" data-nav="risks"><strong>${esc(r.code)}</strong> ${esc(r.title)}</div>`).join("") || '<p class="muted">لا يوجد خطر مرتبط بعد</p>'}
    </div>

    <div class="row" style="margin-top:14px">
      ${editable ? '<button id="cl-save">حفظ التعديلات</button>' : ""}
      ${editable && !rk.length ? '<button class="secondary" id="cl-mkrisk">⚠ إنشاء خطر من هذا البند</button>' : ""}
      <button class="secondary" id="cl-open-doc">🗂 فتح الوثيقة</button>
      <button class="secondary" id="cl-close">إغلاق</button>
    </div>`,
    { wide: true }
  );

  ov.querySelectorAll("[data-nav]").forEach((n) =>
    n.addEventListener("click", () => { ov.remove(); nav(n.dataset.nav); })
  );
  $("#cl-close", ov).onclick = () => ov.remove();
  $("#cl-open-doc", ov).onclick = () => { ov.remove(); nav("library", { tab: "docs", openDoc: regId }); };

  $("#cl-save", ov)?.addEventListener("click", async () => {
    const patch = {
      applicability: val("cl-app", ov),
      scope: val("cl-scope", ov) === "PRIVATE" ? "خاص" : "عام",
      risk_level: val("cl-risk", ov),
      owning_department: val("cl-dept", ov),
      risk_owner: val("cl-owner", ov) || "",
    };
    try {
      await db.updateArticle(regId, artId, patch, store.user.name);
      await db.audit("UPDATE", "Article", artId, `تعديل بند ${c.number} في ${c.regName}`);
      Object.assign(c, patch);
      ov.remove();
      toast("حُفظت التعديلات");
      done();
    } catch (err) { toast(err.message, true); }
  });

  $("#cl-mkrisk", ov)?.addEventListener("click", async () => {
    ov.remove();
    await createRiskFromClause(c);
    await reload("risks");
    toast("أُنشئ خطر مرتبط بالبند");
    done();
  });
}

// إنشاء خطر عدم التزام من بند (آمن التكرار عبر sourceKey)
async function createRiskFromClause(c) {
  const sourceKey = `${c.regId}::${c.number}`;
  if (store.risks.some((r) => r.sourceKey === sourceKey)) return;
  const likelihood = c.risk_level === "عالي" ? 4 : c.risk_level === "منخفض" ? 2 : 3;
  const impact = c.penalty ? 4 : 3;
  const rcode = await db.nextCode("RSK");
  await db.setRow("risks", rcode, {
    code: rcode,
    title: `عدم الالتزام — ${c.number} من ${c.regName}`,
    description: `${c.title || ""}\n${(c.text || "").slice(0, 400)}`.trim(),
    cause: "احتمال مخالفة أحكام البند المذكور",
    penalty: (c.penalty || "").slice(0, 300),
    riskOwner: c.risk_owner || null,
    requirementId: c.requirementId || null,
    regulationId: c.regId,
    sourceArticleId: c.id,
    sourceKey,
    source: "AUTO_LIBRARY",
    likelihood, impact,
    likelihoodDesc: null, impactDesc: null,
    residualLikelihood: likelihood, residualImpact: impact,
    controls: [],
    ownerDeptId: deptIdByName(c.owning_department),
    treatmentOwnerId: null, treatmentPlan: "", kri: "", dueDate: null,
    status: "OPEN", createdAt: db.now(), updatedAt: db.now(),
  });
  await db.audit("CREATE", "Risk", rcode, `إنشاء خطر من البند ${c.number} في «${c.regName}»`);
}

// إضافة بند/متطلب يدوياً إلى وثيقة قائمة
function openManualClause(nav, done) {
  const docs = store.regulations;
  if (!docs.length) {
    return modal(`<h2>لا توجد وثائق بعد</h2>
      <p class="muted">أضِف وثيقة أولاً من تبويب «الوثائق» ثم أضف بنودها هنا أو حلّلها آلياً.</p>
      <div class="row" style="margin-top:12px"><button id="mc-go">الذهاب إلى الوثائق</button></div>`).querySelector("#mc-go")
      ?.addEventListener("click", (e) => { e.target.closest(".modal-overlay").remove(); nav("library", { tab: "docs" }); });
  }
  const ov = modal(
    `
    <h2>إضافة متطلب / بند يدوياً</h2>
    <div class="form-grid">
      ${fld("الوثيقة *", sel("mc-doc", docs.map((d) => ({ id: d.id, name: d.name })), "", { empty: "— اختر الوثيقة —" }))}
      ${fld("رقم المادة / البند *", txt("mc-number", "", "مثل: المادة 12"))}
      ${fld("الانطباق", sel("mc-app", APPLICABILITY, "تنطبق"))}
      ${fld("درجة الخطر", sel("mc-risk", RISK_LEVELS, "متوسط"))}
      ${fld("الإدارة المالكة", sel("mc-dept", DEPARTMENTS, "الالتزام"))}
      ${fld("مالك خطر عدم الالتزام", txt("mc-owner", ""))}
    </div>
    ${fld("عنوان مختصر", txt("mc-title", ""))}
    ${fld("نص المادة / البند *", area("mc-text", "", "", 4))}
    ${fld("الغرامة / العقوبة (إن وجدت)", txt("mc-penalty", ""))}
    <label class="chk"><input type="checkbox" id="mc-mkrisk" /> إنشاء خطر مرتبط في سجل المخاطر</label>
    <div class="row" style="margin-top:14px">
      <button id="mc-save">حفظ</button>
      <button class="secondary" id="mc-cancel">إلغاء</button>
    </div>`,
    { wide: true }
  );
  $("#mc-cancel", ov).onclick = () => ov.remove();
  $("#mc-save", ov).onclick = async () => {
    const regId = val("mc-doc", ov);
    const number = val("mc-number", ov);
    const text = val("mc-text", ov);
    if (!regId || !number || !text) return toast("الوثيقة ورقم البند والنص حقول إلزامية", true);
    try {
      const art = await db.addArticle(regId, {
        number,
        title: val("mc-title", ov) || text.slice(0, 60),
        text,
        applicability: val("mc-app", ov),
        risk_level: val("mc-risk", ov),
        owning_department: val("mc-dept", ov),
        risk_owner: val("mc-owner", ov) || "",
        penalty: val("mc-penalty", ov) || "",
        needs_review: true,
        edited_by: store.user.name,
      });
      await db.audit("CREATE", "Article", art.id, `إضافة بند يدوي ${number} إلى وثيقة`);
      const reg = store.regulations.find((d) => d.id === regId);
      if ($("#mc-mkrisk", ov).checked) {
        await createRiskFromClause({ ...art, regId, regName: reg?.name || "", requirementId: reg?.requirementId || null });
        await reload("risks");
      }
      invalidateClauseCache();
      ov.remove();
      toast("أُضيف البند");
      done();
    } catch (err) { toast(err.message, true); }
  };
}
