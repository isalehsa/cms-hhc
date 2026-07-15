// وحدة التحليل الذكي — رفع نص/ملف النظام واستخراج المواد وتصنيفها آلياً (Claude API + OCR)
// مدمجة مع مكتبة الالتزام: يمكن ربط كل تحليل بمتطلب وإنشاء متطلب من التحليل
import { store, reload, reqOptions, reqLabel, authOptions, authName } from "../state.js";
import * as db from "../db.js";
import {
  $, esc, toast, modal, confirmBox, fld, txt, area, sel, val,
  fmtDate, emptyMsg, spinnerHtml, keepFocus,
} from "../ui.js";
import { DEPARTMENTS, RISK_LEVELS, APPLICABILITY, REQ_TYPES, SECTORS } from "../meta.js";
import { findRelated } from "../similarity.js";
import { analyzeRegulation, DEFAULT_MODEL } from "../analyzer.js";
import { extractText } from "../extract.js";
import { downloadWorkbook } from "../export.js";
import { canEdit } from "../auth.js";
import { autoIntegrateRegulation } from "../sync.js";

const local = {
  view: "list", // list | detail
  current: null,
  filters: { applicability: "", risk: "", department: "", search: "" },
  openLinks: null,
  relatedCache: {},
  analyzing: {},
};

export const settings = {
  get apiKey() { return localStorage.getItem("chcc_api_key") || ""; },
  get model() { return localStorage.getItem("chcc_model") || DEFAULT_MODEL; },
  save(apiKey, model) {
    if (apiKey) localStorage.setItem("chcc_api_key", apiKey);
    else localStorage.removeItem("chcc_api_key");
    if (model && model !== DEFAULT_MODEL) localStorage.setItem("chcc_model", model);
    else localStorage.removeItem("chcc_model");
  },
};
export const aiEnabled = () => Boolean(settings.apiKey);

let elRef = null, navRef = null;

export async function renderRegulations(el, nav, refresh, params = {}) {
  elRef = el;
  navRef = nav;
  store.regulations = await db.listRegulations().catch(() => []);
  if (params.openDoc) {
    await openRegulation(params.openDoc);
    return;
  }
  if (local.view === "detail" && local.current) {
    local.current = await db.getRegulation(local.current.id);
    if (local.current) return renderDetail();
  }
  local.view = "list";
  renderList();
}

function statusBadge(reg) {
  if (reg.status === "processing") {
    return `<span class="spinner"></span> <span class="muted">${esc(local.analyzing[reg.id] || "جاري التحليل…")}</span>`;
  }
  if (reg.status === "failed") return `<span class="lvl lvl-critical"><span class="dot"></span>فشل التحليل</span>`;
  if (reg.status === "ready") {
    const m = reg.analysis_method === "ai" ? "ذكاء اصطناعي" : "تحليل نصي مبدئي";
    return `<span class="lvl lvl-good"><span class="dot"></span>جاهز</span> <span class="chip">${m}</span>`;
  }
  return `<span class="chip">بانتظار التحليل</span>`;
}

function renderList() {
  const el = elRef;
  const editable = canEdit(store.user);
  const docs = store.regulations;

  el.innerHTML = `
    <div class="row" style="justify-content:space-between;align-items:center;margin-bottom:12px">
      <h2 style="margin:0">الوثائق النظامية والتشريعية (${docs.length})</h2>
      ${editable ? '<button id="add-doc" title="إضافة وثيقة جديدة وتحليلها">＋ إضافة وثيقة</button>' : ""}
    </div>
    <section class="card">
      <div style="overflow-x:auto">
        <table>
          <thead><tr>
            <th>#</th><th>فئة الوثيقة</th><th>رقم الوثيقة</th><th>اسم الوثيقة</th><th>الجهة</th>
            <th>القطاع</th><th>عدد البنود</th><th>الحالة</th><th>آخر تحديث</th>${editable ? "<th></th>" : ""}
          </tr></thead>
          <tbody>
            ${docs
              .map(
                (r, i) => `<tr class="rowlink" data-open="${r.id}">
                  <td>${i + 1}</td>
                  <td>${esc(REQ_TYPES[r.docCategory] || "—")}</td>
                  <td class="muted">${esc(r.docNumber || "—")}</td>
                  <td><strong>${esc(r.name)}</strong>${r.description ? `<div class="muted clamp">${esc(r.description)}</div>` : ""}${r.requirementId ? `<div class="muted">📖 ${esc(reqLabel(r.requirementId))}</div>` : ""}</td>
                  <td class="muted">${esc(r.authorityId ? authName(r.authorityId) : "—")}</td>
                  <td class="muted">${esc(r.sector || "—")}</td>
                  <td>${r.articles_count}</td>
                  <td>${statusBadge(r)}</td>
                  <td class="muted">${fmtDate(r.updated_at || r.created_at)}</td>
                  ${editable ? `<td>
                    <button class="secondary small" data-edit="${r.id}" title="تعديل بيانات الوثيقة">تعديل</button>
                    <button class="danger small" data-del="${r.id}" title="حذف الوثيقة وجميع بنودها">حذف</button>
                  </td>` : ""}
                </tr>`
              )
              .join("") || `<tr><td colspan="${editable ? 10 : 9}">${emptyMsg("لا توجد وثائق بعد — اضغط «＋ إضافة وثيقة»")}</td></tr>`}
          </tbody>
        </table>
      </div>
    </section>`;

  $("#add-doc", el)?.addEventListener("click", () => openDocForm(null));
  el.querySelectorAll("[data-edit]").forEach((b) =>
    b.addEventListener("click", (e) => { e.stopPropagation(); openDocForm(b.dataset.edit); })
  );
  el.querySelectorAll("[data-del]").forEach((b) =>
    b.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (!(await confirmBox("حذف هذه الوثيقة وجميع بنودها؟"))) return;
      try {
        await db.deleteRegulation(b.dataset.del);
        store.regulations = await db.listRegulations();
        renderList();
        toast("تم الحذف");
      } catch (err) { toast(err.message, true); }
    })
  );
  el.querySelectorAll("[data-open]").forEach((tr) => (tr.onclick = () => openRegulation(tr.dataset.open)));
}

// نافذة إضافة/تعديل وثيقة (وتحليلها عند الإضافة) — تظهر عند الرغبة فقط
async function openDocForm(id) {
  const isNew = !id;
  let reg = null;
  if (!isNew) {
    reg = await db.getRow("regulations", id).catch(() => null);
    if (!reg) return toast("الوثيقة غير موجودة", true);
  }
  const ov = modal(
    `
    <h2>${isNew ? "إضافة وثيقة وتحليلها" : "تعديل الوثيقة"}</h2>
    <p class="muted">${isNew
      ? `أضِف الوثيقة والصق نصها أو حمّل ملف PDF/Word لاستخراج بنودها وتصنيفها آلياً${aiEnabled() ? "" : " — التحليل الذكي غير مفعّل، سيُستخدم التقسيم النصي المبدئي"}. تنعكس البنود في تبويب «المتطلبات النظامية».`
      : "عدّل بيانات الوثيقة. لإعادة استخراج البنود من نص جديد فعّل «إعادة التحليل»."}</p>
    <div class="form-grid">
      ${fld("اسم الوثيقة *", txt("d-name", reg?.name, "مثال: نظام حماية البيانات الشخصية"))}
      ${fld("فئة الوثيقة", sel("d-cat", REQ_TYPES, reg?.docCategory || "SYSTEM"))}
      ${fld("رقم الوثيقة", txt("d-docno", reg?.docNumber, "مثل: م/19 بتاريخ 9/2/1443هـ"))}
      ${fld("الجهة التنظيمية", sel("d-auth", authOptions(), reg?.authorityId, { empty: "— اختر —" }))}
      ${fld("القطاع", sel("d-sector", SECTORS, reg?.sector, { empty: "— اختر —" }))}
      ${fld("ربط بمتطلب", sel("d-req", reqOptions(), reg?.requirementId, { empty: "— بلا ربط —" }))}
    </div>
    ${fld("وصف مختصر", txt("d-desc", reg?.description))}
    ${isNew ? fld("سياق المنشأة", txt("d-context", "", "مثال: شركة قوى بشرية، عقود توظيف")) : ""}
    <label>ملف الوثيقة (PDF أو Word) — اختياري</label>
    <div class="row"><input type="file" id="d-file" class="grow" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" /><span id="d-file-status" class="muted"></span></div>
    ${fld(isNew ? "النص الكامل *" : "النص الكامل", area("d-text", reg?.text, "الصق النص الكامل هنا، أو حمّل ملفاً أعلاه…", 6))}
    ${isNew ? "" : '<label class="chk"><input type="checkbox" id="d-reanalyze" /> إعادة تحليل النص واستبدال البنود الحالية</label>'}
    <div class="row" style="margin-top:14px">
      <button id="d-save">${isNew ? "حفظ وتحليل" : "حفظ"}</button>
      <button class="secondary" id="d-cancel">إلغاء</button>
    </div>`,
    { wide: true }
  );

  $("#d-file", ov).addEventListener("change", () => extractFromFile(ov));
  $("#d-cancel", ov).onclick = () => ov.remove();
  $("#d-save", ov).onclick = async () => {
    const name = val("d-name", ov);
    const text = $("#d-text", ov).value.trim();
    if (!name) return toast("اسم الوثيقة إلزامي", true);
    const meta = {
      name,
      description: val("d-desc", ov),
      docCategory: val("d-cat", ov),
      docNumber: val("d-docno", ov),
      authorityId: val("d-auth", ov) || null,
      sector: val("d-sector", ov) || null,
      requirementId: val("d-req", ov) || null,
    };
    const btn = $("#d-save", ov);
    btn.disabled = true;
    try {
      if (isNew) {
        if (!text) { btn.disabled = false; return toast("النص الكامل إلزامي للتحليل", true); }
        const context = val("d-context", ov);
        const created = await db.createRegulation({ ...meta, text });
        await db.audit("CREATE", "Regulation", created.id, `إضافة وثيقة: ${name}`);
        ov.remove();
        toast("أُضيفت الوثيقة — بدأ التحليل");
        runAnalysis(created.id, text, context);
        await openRegulation(created.id);
      } else {
        const reanalyze = $("#d-reanalyze", ov)?.checked && text;
        const patch = { ...meta };
        if (text && text !== reg.text) patch.text = text;
        await db.updateRegulation(id, patch);
        await db.audit("UPDATE", "Regulation", id, `تعديل بيانات الوثيقة: ${name}`);
        ov.remove();
        store.regulations = await db.listRegulations().catch(() => store.regulations);
        if (reanalyze) {
          toast("جارٍ إعادة التحليل…");
          runAnalysis(id, text, "");
          await openRegulation(id);
        } else {
          renderList();
          toast("حُفظت التعديلات");
        }
      }
    } catch (err) { toast(err.message, true); btn.disabled = false; }
  };
}

async function extractFromFile(root) {
  const input = $("#d-file", root);
  const status = $("#d-file-status", root);
  const file = input.files?.[0];
  if (!file) return;
  const setStatus = (msg) => { status.innerHTML = `<span class="spinner"></span> ${esc(msg)}`; };
  setStatus("جاري استخراج النص…");
  try {
    const data = await extractText(file, setStatus);
    $("#d-text", root).value = data.text;
    const nameField = $("#d-name", root);
    if (!nameField.value.trim()) nameField.value = file.name.replace(/\.(pdf|docx)$/i, "");
    status.textContent = data.ocr
      ? `✔ ${data.note || "استُخرج بتقنية OCR"}`
      : `✔ استُخرج ${data.text.length.toLocaleString("en-US")} حرفاً`;
    toast(data.ocr ? "استُخرج النص بالتعرف الضوئي — دقّقه قبل التحليل" : "تم الاستخراج — راجع النص ثم حلّل");
  } catch (err) {
    status.textContent = "";
    input.value = "";
    toast(err.message, true);
  }
}

async function runAnalysis(regId, text, orgContext) {
  local.analyzing[regId] = aiEnabled() ? "جاري التحليل بالذكاء الاصطناعي…" : "جاري التقسيم النصي…";
  const refreshView = () => {
    if (local.view === "detail" && local.current?.id === regId) renderDetail();
    else if (local.view === "list") renderList();
  };
  try {
    await db.updateRegulation(regId, { status: "processing", analysis_error: null });
    let lastPaint = 0;
    const { method, articles, warning } = await analyzeRegulation(
      text, orgContext,
      { apiKey: settings.apiKey, model: settings.model },
      (msg) => {
        local.analyzing[regId] = msg;
        if (Date.now() - lastPaint > 2000) { lastPaint = Date.now(); refreshView(); }
      }
    );
    local.analyzing[regId] = "جاري حفظ المواد…";
    refreshView();
    await db.replaceArticles(regId, articles);
    await db.updateRegulation(regId, { status: "ready", analysis_method: method, analysis_error: warning || null });
    await db.audit("UPDATE", "Regulation", regId, `اكتمل تحليل النظام (${articles.length} مادة، ${method === "ai" ? "ذكاء اصطناعي" : "نصي"})`);
    if (warning) toast(warning, method !== "ai"); // تنبيه أحمر فقط عند اللجوء للمحلل الاحتياطي
    else toast("اكتمل التحليل");
    // الدمج الآلي: إضافة النظام لمكتبة الالتزام واشتقاق المخاطر وفق الغرامات والمخالفات
    local.analyzing[regId] = "جاري التحديث الآلي للمكتبة وسجل المخاطر…";
    refreshView();
    try {
      const integ = await autoIntegrateRegulation(regId);
      if (integ.requirementCreated || integ.createdRisks) {
        toast(`تحديث آلي: ${integ.requirementCreated ? "أُضيف متطلب لمكتبة الالتزام و" : ""}أُنشئ ${integ.createdRisks} خطر في سجل المخاطر`);
      }
    } catch (e) {
      console.warn("auto-integration failed", e);
    }
  } catch (err) {
    await db.updateRegulation(regId, { status: "failed", analysis_error: err.message }).catch(() => {});
    toast(`فشل التحليل: ${err.message}`, true);
  } finally {
    delete local.analyzing[regId];
    store.regulations = await db.listRegulations().catch(() => store.regulations);
    if (local.view === "detail" && local.current?.id === regId) {
      local.current = await db.getRegulation(regId).catch(() => local.current);
      renderDetail();
    } else if (local.view === "list") renderList();
  }
}

async function openRegulation(id) {
  local.view = "detail";
  local.openLinks = null;
  local.relatedCache = {};
  elRef.innerHTML = spinnerHtml();
  try {
    local.current = await db.getRegulation(id);
    if (!local.current) throw new Error("التحليل غير موجود");
    renderDetail();
  } catch (err) { toast(err.message, true); }
}

function filteredArticles() {
  const f = local.filters;
  return local.current.articles.filter((a) => {
    if (f.applicability && a.applicability !== f.applicability) return false;
    if (f.risk && a.risk_level !== f.risk) return false;
    if (f.department && a.owning_department !== f.department) return false;
    if (f.search && !`${a.number} ${a.title} ${a.text}`.includes(f.search)) return false;
    return true;
  });
}

const selectHtml = (options, selected, attr) =>
  `<select ${attr}>${options.map((o) => `<option value="${esc(o)}" ${o === selected ? "selected" : ""}>${esc(o)}</option>`).join("")}</select>`;

const riskBadgeAr = (level) => {
  const role = level === "عالي" ? "critical" : level === "منخفض" ? "good" : "warning";
  return `<span class="lvl lvl-${role}"><span class="dot"></span>${esc(level)}</span>`;
};

function linksPanelHtml(a) {
  const existing = (a.links || [])
    .map((l) => {
      const name = store.regulations.find((r) => r.id === l.regulation_id)?.name || l.regulation_id;
      return `<div class="row" style="margin:4px 0">
        <span class="chip">🔗 ${esc(name)} — ${esc(l.number)}</span>
        <button class="danger small" data-unlink="${a.id}" data-target="${l.article_id}">فك الربط</button>
      </div>`;
    })
    .join("");
  const cache = local.relatedCache[a.id];
  let suggestions;
  if (!cache) suggestions = '<p class="muted"><span class="spinner"></span> جاري البحث عن مواد مشابهة…</p>';
  else if (!cache.length) suggestions = '<p class="muted">لا توجد مواد مشابهة في التحليلات الأخرى.</p>';
  else
    suggestions = cache
      .map(
        (s) => `<div class="row" style="margin:4px 0">
          <span class="grow"><strong>${esc(s.regulation_name)}</strong> — ${esc(s.number)}: ${esc(s.title)}
          <span class="muted">(تشابه ${Math.round(s.score * 100)}%)</span></span>
          <button class="small" data-dolink="${a.id}" data-reg="${s.regulation_id}" data-target="${s.article_id}" title="ربط هذه المادة بالمادة المقترحة">ربط</button>
        </div>`
      )
      .join("");
  return `<div class="links-box"><strong>الروابط الحالية:</strong>${existing || '<p class="muted">لا توجد.</p>'}
    <strong style="display:block;margin-top:10px">مواد مقترحة للربط:</strong>${suggestions}</div>`;
}

function renderDetail() {
  const el = elRef;
  const reg = local.current;
  const arts = filteredArticles();
  const editable = canEdit(store.user);
  const colCount = editable ? 7 : 6;
  const counts = {
    total: reg.articles.length,
    applies: reg.articles.filter((a) => a.applicability === "تنطبق").length,
    high: reg.articles.filter((a) => a.risk_level === "عالي" && a.applicability === "تنطبق").length,
    review: reg.articles.filter((a) => a.needs_review).length,
    penalties: reg.articles.filter((a) => a.penalty).length,
  };

  const rows = arts
    .map((a) => {
      const linkBadges = (a.links || [])
        .map((l) => {
          const name = store.regulations.find((r) => r.id === l.regulation_id)?.name || l.regulation_id;
          return `<span class="chip">🔗 ${esc(name)} — ${esc(l.number)}</span>`;
        })
        .join(" ");
      const cells = editable
        ? `<td>${selectHtml(APPLICABILITY, a.applicability, `data-edit="applicability" data-art="${a.id}"`)}</td>
           <td>${selectHtml(RISK_LEVELS, a.risk_level, `data-edit="risk_level" data-art="${a.id}"`)}</td>
           <td>${selectHtml(DEPARTMENTS, a.owning_department, `data-edit="owning_department" data-art="${a.id}"`)}</td>`
        : `<td>${a.applicability === "تنطبق" ? '<span class="lvl lvl-good"><span class="dot"></span>تنطبق</span>' : '<span class="lvl lvl-neutral"><span class="dot"></span>لا تنطبق</span>'}</td>
           <td>${riskBadgeAr(a.risk_level)}</td><td>${esc(a.owning_department)}</td>`;
      const mainRow = `<tr>
        <td><strong>${esc(a.number)}</strong>${a.needs_review ? '<br/><span class="lvl lvl-warning"><span class="dot"></span>للمراجعة</span>' : ""}</td>
        <td><strong>${esc(a.title)}</strong><div class="article-text muted">${esc(a.text)}</div>
          ${a.penalty ? `<div style="margin-top:4px"><span class="penalty-chip" data-tip="الغرامة/العقوبة المنصوص عليها — تُستخدم لاشتقاق سجل المخاطر آلياً">⚖ ${esc(a.penalty)}</span></div>` : ""}
          ${linkBadges ? `<div style="margin-top:4px">${linkBadges}</div>` : ""}</td>
        ${cells}
        <td class="muted" style="max-width:220px">${esc(a.rationale)}${a.edited_by ? `<br/><em>آخر تعديل: ${esc(a.edited_by)}</em>` : ""}</td>
        ${editable ? `<td>
          <button class="secondary small" data-links="${a.id}" title="عرض وربط المواد المشابهة في التحليلات الأخرى">🔗${a.links?.length ? ` (${a.links.length})` : ""}</button>
          <button class="secondary small" data-review="${a.id}" title="${a.needs_review ? "إنهاء حالة المراجعة لهذه المادة" : "تعليم هذه المادة كبحاجة إلى مراجعة"}">${a.needs_review ? "✔" : "🔖"}</button>
          <button class="danger small" data-delart="${a.id}" title="حذف هذه المادة من التحليل">✕</button>
        </td>` : ""}
      </tr>`;
      const panelRow = editable && local.openLinks === a.id
        ? `<tr class="links-panel"><td colspan="${colCount}">${linksPanelHtml(a)}</td></tr>` : "";
      return mainRow + panelRow;
    })
    .join("");

  el.innerHTML = `
    <p><span class="back-link" id="back">← العودة لقائمة التحليلات</span></p>
    <section class="card">
      <div class="row" style="justify-content:space-between">
        <div><h2>${esc(reg.name)}</h2><p class="muted">${esc(reg.description || "")}
          ${reg.requirementId ? ` · 📖 ${esc(reqLabel(reg.requirementId))}` : ""}</p></div>
        <div class="row">
          ${statusBadge(reg)}
          <button class="secondary small" id="export-reg" title="تصدير جميع المواد وتصنيفاتها إلى ملف Excel">⬇ Excel</button>
          ${editable && !reg.requirementId ? '<button class="secondary small" id="mk-req" title="إنشاء متطلب في مكتبة الالتزام من هذا التحليل">📖 إنشاء متطلب</button>' : ""}
          ${editable && reg.status !== "processing" ? '<button class="secondary small" id="reanalyze" title="إعادة تحليل النص من جديد — تستبدل التصنيفات والتعديلات الحالية">🔄 إعادة التحليل</button>' : ""}
        </div>
      </div>
      ${reg.analysis_error ? `<p class="muted">⚠️ ${esc(reg.analysis_error)}</p>` : ""}
      <div class="stats">
        <div class="stat"><div class="num">${counts.total}</div><div class="lbl">المواد والبنود</div></div>
        <div class="stat"><div class="num">${counts.applies}</div><div class="lbl">تنطبق</div></div>
        <div class="stat"><div class="num">${counts.total - counts.applies}</div><div class="lbl">لا تنطبق</div></div>
        <div class="stat"><div class="num">${counts.high}</div><div class="lbl">خطر عالٍ (منطبقة)</div></div>
        <div class="stat"><div class="num">${counts.penalties}</div><div class="lbl">بها غرامات / عقوبات</div></div>
        <div class="stat"><div class="num">${counts.review}</div><div class="lbl">بحاجة لمراجعة</div></div>
      </div>
    </section>
    <section class="card">
      <div class="row filters">
        <input type="text" id="f-search" class="grow" placeholder="بحث في المواد…" value="${esc(local.filters.search)}" />
        <select id="f-app"><option value="">كل حالات الانطباق</option>${APPLICABILITY.map((o) => `<option ${local.filters.applicability === o ? "selected" : ""}>${o}</option>`).join("")}</select>
        <select id="f-risk"><option value="">كل درجات الخطر</option>${RISK_LEVELS.map((o) => `<option ${local.filters.risk === o ? "selected" : ""}>${o}</option>`).join("")}</select>
        <select id="f-dept"><option value="">كل الإدارات</option>${DEPARTMENTS.map((o) => `<option ${local.filters.department === o ? "selected" : ""}>${o}</option>`).join("")}</select>
        ${editable ? '<button class="small" id="add-art" title="إضافة مادة أو بند يدوياً إلى هذا التحليل">＋ مادة يدوياً</button>' : ""}
      </div>
      <div style="overflow-x:auto">
        <table>
          <thead><tr><th>المادة/البند</th><th>النص</th><th>الانطباق</th><th>الخطر</th><th>الإدارة المالكة</th><th>المبرر</th>${editable ? "<th></th>" : ""}</tr></thead>
          <tbody>${rows || `<tr><td colspan="${colCount}" class="muted">${reg.status === "processing" ? "جاري استخراج المواد…" : "لا توجد مواد"}</td></tr>`}</tbody>
        </table>
      </div>
    </section>`;

  $("#back", el).onclick = async () => {
    local.view = "list";
    store.regulations = await db.listRegulations().catch(() => store.regulations);
    renderList();
  };
  $("#export-reg", el).onclick = async () => {
    try {
      toast("جاري تجهيز ملف Excel…");
      const full = await db.getRegulation(reg.id);
      await downloadWorkbook([full], `${reg.name}.xlsx`, true);
    } catch (err) { toast(err.message, true); }
  };
  $("#mk-req", el)?.addEventListener("click", async () => {
    try {
      const code = await db.nextCode("REQ");
      await db.setRow("requirements", code, {
        code,
        title: reg.name,
        summary: reg.description || `تحليل ذكي: ${reg.articles_count || reg.articles.length} مادة مستخرجة`,
        type: "REGULATION",
        category: "GOVERNANCE",
        criticality: counts.high > 0 ? "HIGH" : "MEDIUM",
        authorityId: null,
        ownerDeptId: null,
        issueDate: null,
        nextReviewDate: null,
        status: "UNDER_REVIEW",
        attachmentUrl: null,
        createdById: store.user.uid,
        approvedById: null,
        lastUpdated: db.now(),
        createdAt: db.now(),
      });
      await db.updateRegulation(reg.id, { requirementId: code });
      await db.audit("CREATE", "Requirement", code, `إنشاء متطلب من التحليل الذكي: ${reg.name}`);
      await reload("requirements");
      local.current = await db.getRegulation(reg.id);
      renderDetail();
      toast(`أُنشئ المتطلب ${code} في مكتبة الالتزام`);
    } catch (err) { toast(err.message, true); }
  });
  $("#reanalyze", el)?.addEventListener("click", async () => {
    if (!(await confirmBox("إعادة التحليل ستستبدل التصنيفات الحالية بما فيها تعديلاتك. متابعة؟"))) return;
    runAnalysis(reg.id, reg.text, "");
    local.current = await db.getRegulation(reg.id).catch(() => reg);
    renderDetail();
  });

  $("#f-search", el)?.addEventListener("input", (e) => { local.filters.search = e.target.value; keepFocus(renderDetail); });
  $("#f-app", el).onchange = (e) => { local.filters.applicability = e.target.value; renderDetail(); };
  $("#f-risk", el).onchange = (e) => { local.filters.risk = e.target.value; renderDetail(); };
  $("#f-dept", el).onchange = (e) => { local.filters.department = e.target.value; renderDetail(); };

  if (!editable) return;

  $("#add-art", el)?.addEventListener("click", async () => {
    const number = prompt("رقم المادة/البند:");
    if (!number) return;
    const text = prompt("نص المادة:");
    if (!text) return;
    try {
      await db.addArticle(reg.id, { number, title: text.slice(0, 60), text, needs_review: true, edited_by: store.user.name });
      local.current = await db.getRegulation(reg.id);
      renderDetail();
      toast("أُضيفت المادة");
    } catch (err) { toast(err.message, true); }
  });

  el.querySelectorAll("[data-edit]").forEach((s) => {
    s.onchange = async () => {
      try {
        await db.updateArticle(reg.id, s.dataset.art, { [s.dataset.edit]: s.value }, store.user.name);
        const art = local.current.articles.find((a) => a.id === s.dataset.art);
        if (art) art[s.dataset.edit] = s.value;
        toast("تم الحفظ");
        renderDetail();
      } catch (err) { toast(err.message, true); }
    };
  });

  el.querySelectorAll("[data-review]").forEach((btn) => {
    btn.onclick = async () => {
      const art = local.current.articles.find((a) => a.id === btn.dataset.review);
      try {
        await db.updateArticle(reg.id, art.id, { needs_review: !art.needs_review }, store.user.name);
        art.needs_review = !art.needs_review;
        renderDetail();
      } catch (err) { toast(err.message, true); }
    };
  });

  el.querySelectorAll("[data-delart]").forEach((btn) => {
    btn.onclick = async () => {
      if (!(await confirmBox("حذف هذه المادة؟"))) return;
      try {
        await db.deleteArticle(reg.id, btn.dataset.delart);
        local.current.articles = local.current.articles.filter((a) => a.id !== btn.dataset.delart);
        renderDetail();
        toast("حُذفت");
      } catch (err) { toast(err.message, true); }
    };
  });

  el.querySelectorAll("[data-links]").forEach((btn) => {
    btn.onclick = async () => {
      const artId = btn.dataset.links;
      if (local.openLinks === artId) { local.openLinks = null; return renderDetail(); }
      local.openLinks = artId;
      renderDetail();
      if (!local.relatedCache[artId]) {
        try {
          const article = local.current.articles.find((a) => a.id === artId);
          const all = await db.allRegulations();
          local.relatedCache[artId] = findRelated(article, all, reg.id);
        } catch (err) {
          local.relatedCache[artId] = [];
          toast(err.message, true);
        }
        if (local.openLinks === artId) renderDetail();
      }
    };
  });

  el.querySelectorAll("[data-dolink]").forEach((btn) => {
    btn.onclick = async () => {
      try {
        const updated = await db.linkArticles(reg.id, btn.dataset.dolink, btn.dataset.reg, btn.dataset.target, store.user.name);
        const art = local.current.articles.find((a) => a.id === btn.dataset.dolink);
        if (art) art.links = updated.links;
        toast("تم الربط");
        renderDetail();
      } catch (err) { toast(err.message, true); }
    };
  });

  el.querySelectorAll("[data-unlink]").forEach((btn) => {
    btn.onclick = async () => {
      try {
        const updated = await db.unlinkArticles(reg.id, btn.dataset.unlink, btn.dataset.target);
        const art = local.current.articles.find((a) => a.id === btn.dataset.unlink);
        if (art) art.links = updated.links;
        toast("فُك الربط");
        renderDetail();
      } catch (err) { toast(err.message, true); }
    };
  });
}
