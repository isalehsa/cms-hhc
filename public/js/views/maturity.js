// تقييم نضج الالتزام في التجمعات الصحية (ISO 37301)
// التجمع يقيّم نفسه (0..3 لكل معيار مع الأدلة) ويرسل، ومدير الالتزام في الشركة يراجع
// ربعياً ويعيد التقييم بناءً على الأدلة الداعمة. النتائج الربعية تظهر للجميع المعنيين.
import { store, reload, deptName, clusterOptions } from "../state.js";
import * as db from "../db.js";
import {
  $, esc, toast, modal, confirmBox, fld, sel, area, val,
  fmtDate, statusBadgeFrom, levelBadge, progressBar, emptyMsg,
} from "../ui.js";
import { MATURITY_MODEL, MATURITY_SCALE, MATURITY_STATUS, maturityLevel } from "../meta.js";
import { canEdit, canApprove, isClusterOfficer } from "../auth.js";
import { uploadFile, deleteFile } from "../storage.js";
import { downloadMaturityTemplate, importMaturityExcel, importLegacyMaturityExcel } from "../maturity-xlsx.js";

// فتح منتقي ملفات ويعيد الملف المختار (أو null إن أُلغي)
function pickFile(accept = "") {
  return new Promise((resolve) => {
    const inp = document.createElement("input");
    inp.type = "file";
    if (accept) inp.accept = accept;
    inp.style.display = "none";
    inp.onchange = () => { const f = inp.files[0] || null; inp.remove(); resolve(f); };
    document.body.appendChild(inp);
    inp.click();
  });
}

const ST_ROLE = { DRAFT: "neutral", SUBMITTED: "warning", REVIEWED: "good" };
const tabState = { tab: "list" }; // list | results

// نسخة جديدة من النموذج القياسي (40 معياراً) بدرجات صفرية
function blankDomains() {
  return MATURITY_MODEL.map((d) => ({
    name: d.name, ref: d.ref,
    criteria: d.criteria.map((text) => ({
      text, selfScore: 0, reviewScore: null, evidence: "", note: "",
      evidenceFileUrl: "", evidenceFileName: "", evidenceFilePath: "",
    })),
  }));
}

// حساب الدرجات: تعتمد المراجعة إن وُجدت، وإلا التقييم الذاتي
const critScore = (c, useReview) => (useReview && c.reviewScore != null ? c.reviewScore : (c.selfScore || 0));
function domainPct(dom, useReview) {
  const max = dom.criteria.length * 3;
  const got = dom.criteria.reduce((s, c) => s + critScore(c, useReview), 0);
  return max ? Math.round((got / max) * 100) : 0;
}
function overallPct(m, useReview) {
  const crits = (m.domains || []).flatMap((d) => d.criteria);
  const max = crits.length * 3;
  const got = crits.reduce((s, c) => s + critScore(c, useReview), 0);
  return max ? Math.round((got / max) * 100) : 0;
}
// النتيجة المعتمدة: بعد المراجعة إن روجِع، وإلا التقييم الذاتي
const finalPct = (m) => overallPct(m, m.status === "REVIEWED");

// التجمع المرتبط بالمستخدم (لمسؤول التزام التجمع)
const myClusterId = () => store.user?.departmentId || null;

export function renderMaturity(el, nav, refresh) {
  const user = store.user;
  const officer = isClusterOfficer(user);
  const manager = canApprove(user);
  const rerender = () => renderMaturity(el, nav, refresh);

  // مسؤول التجمع يرى تقييمات تجمعه فقط
  let rows = store.maturity.slice();
  if (officer) rows = rows.filter((m) => m.clusterId === myClusterId());
  rows.sort((a, b) => (b.year - a.year) || (b.quarter - a.quarter) || (b.createdAt || "").localeCompare(a.createdAt || ""));

  const head = `
    <div class="page-head">
      <h1>📊 تقييم نضج الالتزام — التجمعات الصحية</h1>
      <div class="row">
        <div class="subtabs">
          <button class="subtab ${tabState.tab === "list" ? "active" : ""}" data-tab="list" title="${officer ? "أداة التقييم الذاتي" : "قائمة التقييمات"}">${officer ? "📝 التقييم الذاتي" : "📋 التقييمات"}</button>
          <button class="subtab ${tabState.tab === "results" ? "active" : ""}" data-tab="results" title="نتائج التقييم الربعي حسب المحاور والتجمعات">📈 النتائج الربعية</button>
        </div>
        ${(canEdit(user) || officer) ? '<button id="add-mat" title="بدء تقييم نضج جديد لربع سنة">＋ تقييم جديد</button>' : ""}
      </div>
    </div>`;

  const bind = () => {
    el.querySelectorAll("[data-tab]").forEach((b) => (b.onclick = () => { tabState.tab = b.dataset.tab; rerender(); }));
    $("#add-mat", el)?.addEventListener("click", () => openCreate(rerender, officer));
  };

  if (tabState.tab === "results") {
    el.innerHTML = head + renderResults(rows);
    bind();
    return;
  }

  el.innerHTML = head + `
    <section class="card">
      <div style="overflow-x:auto">
        <table>
          <thead><tr>
            <th>الرقم</th><th>التجمع</th><th>الفترة</th><th>النضج المعتمد</th><th>المستوى</th><th>الحالة</th><th>آخر تحديث</th>
          </tr></thead>
          <tbody>
            ${rows.map((m) => {
              const pct = finalPct(m);
              const lvl = maturityLevel(pct);
              return `<tr class="rowlink" data-open="${m.id}">
                <td><strong>${esc(m.code)}</strong></td>
                <td>${esc(deptName(m.clusterId))}</td>
                <td>الربع ${m.quarter} / ${m.year}</td>
                <td style="min-width:130px">${progressBar(pct)}</td>
                <td>${levelBadge(lvl.key, lvl.label)}</td>
                <td>${statusBadgeFrom(MATURITY_STATUS, m.status, ST_ROLE)}</td>
                <td>${fmtDate(m.updatedAt || m.createdAt)}</td>
              </tr>`;
            }).join("") || `<tr><td colspan="7">${emptyMsg(officer ? "لا توجد تقييمات لتجمعك بعد — ابدأ بـ «تقييم جديد»" : "لا توجد تقييمات بعد")}</td></tr>`}
          </tbody>
        </table>
      </div>
    </section>`;
  bind();
  el.querySelectorAll("[data-open]").forEach((tr) =>
    tr.addEventListener("click", () => openDetail(tr.dataset.open, rerender))
  );
}

// نتائج ربعية: مصفوفة المحاور × التجمعات لأحدث تقييم معتمد لكل تجمع
function renderResults(rows) {
  const reviewed = rows.filter((m) => m.status === "REVIEWED" || m.status === "SUBMITTED");
  // أحدث تقييم لكل تجمع
  const latest = {};
  for (const m of reviewed) {
    const k = m.clusterId;
    if (!latest[k] || (m.year * 4 + m.quarter) > (latest[k].year * 4 + latest[k].quarter)) latest[k] = m;
  }
  const items = Object.values(latest);
  if (!items.length) return `<section class="card">${emptyMsg("لا توجد نتائج معتمدة بعد")}</section>`;

  const domNames = MATURITY_MODEL.map((d) => d.name);
  const rowsHtml = items
    .sort((a, b) => finalPct(b) - finalPct(a))
    .map((m) => {
      const cells = domNames.map((dn) => {
        const dom = (m.domains || []).find((d) => d.name === dn);
        if (!dom) return `<td class="muted">—</td>`;
        const p = domainPct(dom, m.status === "REVIEWED");
        const lvl = maturityLevel(p);
        return `<td class="hm-cell hm-${lvl.key}" data-tip="${esc(dn)}: ${p}%">${p}%</td>`;
      }).join("");
      const tot = finalPct(m);
      return `<tr><td><strong>${esc(deptName(m.clusterId))}</strong><div class="muted">ر${m.quarter}/${m.year}</div></td>${cells}
        <td>${levelBadge(maturityLevel(tot).key, `${tot}%`)}</td></tr>`;
    }).join("");

  return `
    <section class="card">
      <h2>مصفوفة النضج حسب المحاور (أحدث تقييم لكل تجمع)</h2>
      <div style="overflow-x:auto">
        <table class="mat-matrix">
          <thead><tr><th>التجمع</th>${domNames.map((n) => `<th style="font-size:.72rem">${esc(n)}</th>`).join("")}<th>الإجمالي</th></tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
      <p class="muted">المستويات: مبتدئ (&lt;26٪) · نامٍ (26–50٪) · متقدم (51–75٪) · رائد (76–100٪)</p>
    </section>`;
}

function openCreate(done, officer) {
  const clusters = clusterOptions();
  if (!clusters.length) return toast("لا توجد تجمعات صحية مسجّلة — استوردها من إعدادات الإدارات أولاً", true);
  const y = new Date().getFullYear();
  const q = Math.floor(new Date().getMonth() / 3) + 1;
  const fixedCluster = officer ? myClusterId() : "";
  const ov = modal(`
    <h2>بدء تقييم نضج جديد</h2>
    <div class="form-grid">
      ${fld("التجمع الصحي *", officer
        ? `<input type="text" id="mc-cluster" value="${esc(deptName(fixedCluster))}" disabled />`
        : sel("mc-cluster", clusters, "", { empty: "— اختر —" }))}
      ${fld("السنة", sel("mc-year", { [y - 1]: y - 1, [y]: y, [y + 1]: y + 1 }, String(y)))}
      ${fld("الربع", sel("mc-q", { 1: "الربع الأول", 2: "الربع الثاني", 3: "الربع الثالث", 4: "الربع الرابع" }, String(q)))}
    </div>
    <p class="muted">يُنشأ نموذج قياسي من ${MATURITY_MODEL.length} محاور و${MATURITY_MODEL.reduce((s, d) => s + d.criteria.length, 0)} معياراً وفق ISO 37301.</p>
    <div class="row" style="margin-top:14px"><button id="mc-save">إنشاء والبدء</button><button class="secondary" id="mc-cancel">إلغاء</button></div>`);
  $("#mc-cancel", ov).onclick = () => ov.remove();
  $("#mc-save", ov).onclick = async () => {
    const clusterId = officer ? fixedCluster : val("mc-cluster", ov);
    if (!clusterId) return toast("اختر التجمع الصحي", true);
    const year = Number(val("mc-year", ov)), quarter = Number(val("mc-q", ov));
    if (store.maturity.some((m) => m.clusterId === clusterId && m.year === year && m.quarter === quarter)) {
      return toast("يوجد تقييم لهذا التجمع في نفس الربع — افتحه وعدّله", true);
    }
    try {
      const code = await db.nextCode("MAT");
      const row = await db.setRow("maturity", code, {
        code, clusterId, year, quarter, status: "DRAFT",
        domains: blankDomains(), reviewNotes: null, reviewedById: null,
        createdById: store.user.uid, createdAt: db.now(), updatedAt: db.now(),
      });
      await db.audit("CREATE", "Maturity", code, `بدء تقييم نضج: ${deptName(clusterId)} ر${quarter}/${year}`);
      await reload("maturity");
      ov.remove();
      openDetail(row.id, done);
    } catch (err) { toast(err.message, true); }
  };
}

export function openDetail(id, done) {
  const m = store.maturity.find((x) => x.id === id);
  if (!m) return;
  const user = store.user;
  const officer = isClusterOfficer(user) && m.clusterId === myClusterId();
  const manager = canApprove(user);
  // التجمع يعبّئ التقييم الذاتي في المسودة؛ المدير يعيد التقييم عند المراجعة
  const canSelfEdit = officer && m.status === "DRAFT";
  const canReview = manager && (m.status === "SUBMITTED" || m.status === "REVIEWED");
  const useReview = m.status === "REVIEWED";
  // مدير/فريق الالتزام يمكنه استيراد التقييم الذاتي من Excel نيابةً عن التجمع
  const canSelfImport = canSelfEdit || canEdit(user);
  // مدير الالتزام يمكنه اعتماد التقييم الذاتي مباشرةً حتى وهو مسودة (دون انتظار إرسال التجمع)
  const canAdoptDraft = manager && m.status === "DRAFT";
  // مدير الالتزام يمكنه التراجع عن اعتماد تقييم معتمد وإعادته إلى «بانتظار المراجعة»
  const canUndoReview = manager && m.status === "REVIEWED";

  const domHtml = (m.domains || []).map((dom, di) => {
    const p = domainPct(dom, useReview);
    const crits = dom.criteria.map((c, ci) => {
      const scoreCell = canSelfEdit
        ? `<select class="mt-self" data-d="${di}" data-c="${ci}">${[0, 1, 2, 3].map((n) => `<option value="${n}" ${n === (c.selfScore || 0) ? "selected" : ""}>${n}</option>`).join("")}</select>`
        : `<span class="chip">ذاتي: ${c.selfScore || 0}</span>`;
      const reviewCell = canReview
        ? `<select class="mt-review" data-d="${di}" data-c="${ci}"><option value="">— كالذاتي —</option>${[0, 1, 2, 3].map((n) => `<option value="${n}" ${c.reviewScore === n ? "selected" : ""}>${n}</option>`).join("")}</select>`
        : (c.reviewScore != null ? `<span class="chip chip-auto">مراجعة: ${c.reviewScore}</span>` : "");
      const fileLink = c.evidenceFileUrl
        ? `<a href="${esc(c.evidenceFileUrl)}" target="_blank" rel="noopener">📎 ${esc(c.evidenceFileName || "ملف الدليل")}</a>`
        : "";
      let evCell;
      if (canSelfEdit) {
        evCell = `<input type="text" class="mt-ev" data-d="${di}" data-c="${ci}" placeholder="رابط الدليل الداعم" value="${esc(c.evidence || "")}" />
          <div class="row" style="margin-top:5px;gap:6px;align-items:center;flex-wrap:wrap">
            <button type="button" class="secondary mt-upload" data-d="${di}" data-c="${ci}" title="رفع ملف الدليل الداعم لهذا البند">📤 رفع ملف</button>
            ${fileLink}
            ${c.evidenceFileUrl ? `<button type="button" class="danger mt-delfile" data-d="${di}" data-c="${ci}" title="إزالة الملف المرفوع">✕</button>` : ""}
          </div>`;
      } else {
        const parts = [];
        if (c.evidence) parts.push(`<a href="${esc(c.evidence)}" target="_blank" rel="noopener">📎 رابط</a>`);
        if (fileLink) parts.push(fileLink);
        evCell = parts.join(" · ") || '<span class="muted">لا دليل</span>';
      }
      return `<tr>
        <td>${esc(c.text)}</td>
        <td>${scoreCell}</td>
        <td>${reviewCell}</td>
        <td style="min-width:180px">${evCell}</td>
      </tr>`;
    }).join("");
    return `<div class="card sub">
      <div class="row" style="justify-content:space-between">
        <h3>${di + 1}. ${esc(dom.name)} <span class="muted" style="font-weight:normal">(${esc(dom.ref)})</span></h3>
        <span>${levelBadge(maturityLevel(p).key, `${p}%`)}</span>
      </div>
      <div style="overflow-x:auto"><table>
        <thead><tr><th>المعيار</th><th>التقييم الذاتي (0-3)</th><th>مراجعة الشركة</th><th>الدليل الداعم</th></tr></thead>
        <tbody>${crits}</tbody>
      </table></div>
    </div>`;
  }).join("");

  const pct = finalPct(m);
  // يمكن إضافة/تعديل رابط مجلد الأدلة في أي حالة قبل الاعتماد وبعده:
  // مسؤول التجمع أثناء المسودة، وفريق الالتزام (المحررون) في جميع الحالات
  const repoEditable = canSelfEdit || canReview || canEdit(user);
  const repoBlock = `
    <div class="card sub">
      <div class="row" style="justify-content:space-between;align-items:flex-end;gap:12px;flex-wrap:wrap">
        <div style="flex:1;min-width:240px">
          ${fld("🔗 مجلد الأدلة (رابط واحد)", repoEditable
            ? `<input type="url" id="mt-repo" placeholder="https://…" value="${esc(m.evidenceRepo || "")}" />`
            : (m.evidenceRepo
              ? `<a href="${esc(m.evidenceRepo)}" target="_blank" rel="noopener">${esc(m.evidenceRepo)}</a>`
              : '<span class="muted">لم يُحدَّد رابط المجلد بعد</span>'))}
        </div>
        <div class="row" style="gap:6px;flex-wrap:wrap">
          ${repoEditable ? '<button class="secondary" id="mt-saverepo" title="حفظ رابط مجلد الأدلة">💾 حفظ الرابط</button>' : ""}
          ${canEdit(user) ? '<button class="secondary" id="mt-email" title="إرسال بريد إلكتروني يحتوي رسالة ورابط المجلد">✉ إرسال بريد</button>' : ""}
        </div>
      </div>
      <div class="row" style="margin-top:10px;gap:6px;flex-wrap:wrap">
        <button class="secondary" id="mt-xls-tpl" title="تنزيل نموذج Excel معبّأ بالقيم الحالية لتعبئته">⬇ تنزيل نموذج Excel</button>
        ${canSelfImport ? `<button class="secondary" id="mt-xls-imp" title="رفع ملف Excel معبّأ وعكس التقييم الذاتي والأدلة على النظام${canSelfEdit ? "" : " (نيابةً عن التجمع)"}">⬆ استيراد التقييم من Excel</button>` : ""}
        ${canReview ? '<button class="secondary" id="mt-xls-impr" title="رفع ملف Excel وعكس درجات مراجعة الشركة على النظام">⬆ استيراد المراجعة من Excel</button>' : ""}
        ${canEdit(user) ? '<button class="secondary" id="mt-xls-legacy" title="استيراد قيم التقييم من ملف النموذج القديم (ورقة نموذج التقييم) وعكسها على التقييم الذاتي">⬆ استيراد من النموذج القديم</button>' : ""}
      </div>
    </div>`;

  const ov = modal(`
    <div class="row" style="justify-content:space-between">
      <h2>${esc(m.code)} — ${esc(deptName(m.clusterId))}</h2>
      <span>${statusBadgeFrom(MATURITY_STATUS, m.status, ST_ROLE)}</span>
    </div>
    <p class="muted">الربع ${m.quarter} / ${m.year} · النضج المعتمد: ${levelBadge(maturityLevel(pct).key, `${pct}٪ — ${maturityLevel(pct).label}`)}</p>
    <div class="scale-note muted">مقياس التقييم: ${Object.entries(MATURITY_SCALE).map(([k, v]) => `<strong>${k}</strong>=${esc(v)}`).join(" · ")}</div>
    ${repoBlock}
    ${domHtml}
    ${canReview ? fld("ملاحظات المراجعة الربعية", area("mt-rnotes", m.reviewNotes, "قرار المراجعة والملاحظات على الأدلة", 2)) : m.reviewNotes ? `<p><strong>ملاحظات المراجعة:</strong> ${esc(m.reviewNotes)}</p>` : ""}
    <div class="row" style="margin-top:14px">
      ${canSelfEdit ? '<button id="mt-savedraft" class="secondary">حفظ مؤقت</button><button id="mt-submit">📤 إرسال للمراجعة</button>' : ""}
      ${canAdoptDraft ? '<button class="secondary" id="mt-approvedraft" title="اعتماد المسودة ونقلها إلى «بانتظار المراجعة» — دون اعتماد مراجعة نهائية">✔ اعتماد المسودة</button>' : ""}
      ${canAdoptDraft ? '<button id="mt-adopt" title="اعتماد التقييم الذاتي الحالي كنتيجة معتمدة نهائية دون انتظار إرسال التجمع">✔ اعتماد التقييم الذاتي</button>' : ""}
      ${canReview ? '<button id="mt-review">✔ اعتماد المراجعة الربعية</button>' : ""}
      ${canUndoReview ? '<button class="secondary" id="mt-undo" title="التراجع عن اعتماد التقييم وإعادته إلى بانتظار المراجعة">↩ تراجع عن الاعتماد</button>' : ""}
      ${(canEdit(user) || (officer && m.status !== "REVIEWED")) ? '<button class="danger" id="mt-del">حذف</button>' : ""}
      <button class="secondary" id="mt-close">إغلاق</button>
    </div>`, { wide: true });

  $("#mt-close", ov).onclick = () => ov.remove();

  const readSelf = () => {
    const doms = JSON.parse(JSON.stringify(m.domains));
    ov.querySelectorAll(".mt-self").forEach((s) => { doms[s.dataset.d].criteria[s.dataset.c].selfScore = Number(s.value); });
    ov.querySelectorAll(".mt-ev").forEach((s) => { doms[s.dataset.d].criteria[s.dataset.c].evidence = s.value.trim(); });
    return doms;
  };
  const readReview = () => {
    const doms = JSON.parse(JSON.stringify(m.domains));
    ov.querySelectorAll(".mt-review").forEach((s) => { doms[s.dataset.d].criteria[s.dataset.c].reviewScore = s.value === "" ? null : Number(s.value); });
    return doms;
  };
  // إعادة فتح النافذة بعد تعديل يُخزَّن مباشرة (رفع ملف / استيراد Excel)
  const reopen = async () => { await reload("maturity"); ov.remove(); openDetail(m.id, done); };

  // ---- مجلد الأدلة: حفظ الرابط الواحد ----
  $("#mt-saverepo", ov)?.addEventListener("click", async () => {
    const url = val("mt-repo", ov);
    if (url && !/^https?:\/\//i.test(url)) return toast("أدخل رابطاً صحيحاً يبدأ بـ http أو https", true);
    await db.updateRow("maturity", m.id, { evidenceRepo: url || null });
    await db.audit("UPDATE", "Maturity", m.code, `تحديث رابط مجلد الأدلة — ${deptName(m.clusterId)}`);
    m.evidenceRepo = url || null;
    toast("حُفظ رابط المجلد");
  });

  // ---- إرسال بريد إلكتروني بمجلد الأدلة ----
  $("#mt-email", ov)?.addEventListener("click", () => {
    const repo = (ov.querySelector("#mt-repo")?.value?.trim()) || m.evidenceRepo || "";
    openEmailModal(m, repo);
  });

  // ---- تنزيل نموذج Excel ----
  $("#mt-xls-tpl", ov)?.addEventListener("click", async () => {
    try { await downloadMaturityTemplate(m, deptName(m.clusterId)); toast("جارٍ تنزيل النموذج"); }
    catch (err) { toast(err.message, true); }
  });

  // ---- استيراد التقييم/المراجعة من Excel ----
  const doImport = async (mode) => {
    const file = await pickFile(".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    if (!file) return;
    toast("جارٍ قراءة الملف…");
    try {
      const { domains, applied, total } = await importMaturityExcel(file, m, mode);
      await db.updateRow("maturity", m.id, { domains });
      await db.audit("UPDATE", "Maturity", m.code, `عكس ${mode === "review" ? "مراجعة" : "تقييم"} من Excel — ${deptName(m.clusterId)}`);
      toast(`تم عكس ${applied} من ${total} معياراً من الملف`);
      await reopen();
    } catch (err) { toast(err.message, true); }
  };
  $("#mt-xls-imp", ov)?.addEventListener("click", () => doImport("self"));
  $("#mt-xls-impr", ov)?.addEventListener("click", () => doImport("review"));

  // ---- استيراد قيم التقييم من النموذج القديم ----
  $("#mt-xls-legacy", ov)?.addEventListener("click", async () => {
    const file = await pickFile(".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    if (!file) return;
    toast("جارٍ قراءة الملف…");
    try {
      const { domains, applied, total } = await importLegacyMaturityExcel(file, m);
      await db.updateRow("maturity", m.id, { domains });
      await db.audit("UPDATE", "Maturity", m.code, `عكس التقييم من النموذج القديم — ${deptName(m.clusterId)}`);
      toast(`تم عكس ${applied} من ${total} معياراً من النموذج القديم`);
      await reopen();
    } catch (err) { toast(err.message, true); }
  });

  // ---- رفع ملف دليل داعم لكل بند على حدة ----
  ov.querySelectorAll(".mt-upload").forEach((btn) => btn.addEventListener("click", async () => {
    const di = Number(btn.dataset.d), ci = Number(btn.dataset.c);
    const file = await pickFile();
    if (!file) return;
    btn.disabled = true;
    const original = btn.textContent;
    btn.textContent = "⏳ جارٍ الرفع…";
    try {
      const path = `maturity/${m.id}/${di}-${ci}-${Date.now()}-${file.name}`;
      const { url, name } = await uploadFile(path, file);
      const doms = readSelf(); // نحفظ التعديلات الحالية غير المخزّنة قبل إعادة البناء
      const crit = doms[di].criteria[ci];
      const oldPath = crit.evidenceFilePath;
      crit.evidenceFileUrl = url; crit.evidenceFileName = name; crit.evidenceFilePath = path;
      await db.updateRow("maturity", m.id, { domains: doms });
      if (oldPath) await deleteFile(oldPath);
      await db.audit("UPDATE", "Maturity", m.code, `رفع ملف دليل داعم لبند — ${deptName(m.clusterId)}`);
      toast("رُفع الملف");
      await reopen();
    } catch (err) {
      btn.disabled = false; btn.textContent = original;
      toast(err.message, true);
    }
  }));

  // ---- إزالة ملف دليل مرفوع ----
  ov.querySelectorAll(".mt-delfile").forEach((btn) => btn.addEventListener("click", async () => {
    const di = Number(btn.dataset.d), ci = Number(btn.dataset.c);
    if (!(await confirmBox("إزالة الملف المرفوع لهذا البند؟"))) return;
    const doms = readSelf();
    const crit = doms[di].criteria[ci];
    const oldPath = crit.evidenceFilePath;
    crit.evidenceFileUrl = ""; crit.evidenceFileName = ""; crit.evidenceFilePath = "";
    await db.updateRow("maturity", m.id, { domains: doms });
    if (oldPath) await deleteFile(oldPath);
    await db.audit("UPDATE", "Maturity", m.code, `إزالة ملف دليل داعم لبند — ${deptName(m.clusterId)}`);
    toast("أُزيل الملف");
    await reopen();
  }));

  $("#mt-savedraft", ov)?.addEventListener("click", async () => {
    await db.updateRow("maturity", m.id, { domains: readSelf() });
    await db.audit("UPDATE", "Maturity", m.code, `حفظ تقييم ذاتي مؤقت — ${deptName(m.clusterId)}`);
    await reload("maturity"); ov.remove(); toast("حُفظ"); done();
  });
  $("#mt-submit", ov)?.addEventListener("click", async () => {
    if (!(await confirmBox("إرسال التقييم لمراجعة إدارة الالتزام بالشركة؟ لن تتمكن من تعديله بعد الإرسال."))) return;
    await db.updateRow("maturity", m.id, { domains: readSelf(), status: "SUBMITTED", submittedAt: db.now() });
    await db.audit("SUBMIT", "Maturity", m.code, `إرسال تقييم نضج للمراجعة — ${deptName(m.clusterId)}`);
    await db.notify({ title: "تقييم نضج بانتظار المراجعة الربعية", message: `${deptName(m.clusterId)} — الربع ${m.quarter}/${m.year}`, type: "MATURITY_SUBMITTED", link: "maturity", roleTarget: "COMPLIANCE_MANAGER" });
    await reload("maturity", "notifications"); ov.remove(); toast("أُرسل للمراجعة"); done();
  });
  $("#mt-review", ov)?.addEventListener("click", async () => {
    await db.updateRow("maturity", m.id, { domains: readReview(), status: "REVIEWED", reviewNotes: val("mt-rnotes", ov) || null, reviewedById: user.uid });
    await db.audit("REVIEW", "Maturity", m.code, `اعتماد المراجعة الربعية وإعادة التقييم — ${deptName(m.clusterId)}`);
    await reload("maturity"); ov.remove(); toast("اعتُمدت المراجعة الربعية"); done();
  });
  // التراجع عن الاعتماد: يعيد التقييم المعتمد إلى «بانتظار المراجعة» مع حفظ الدرجات والملاحظات
  $("#mt-undo", ov)?.addEventListener("click", async () => {
    if (!(await confirmBox("التراجع عن اعتماد التقييم وإعادته إلى «بانتظار المراجعة»؟"))) return;
    await db.updateRow("maturity", m.id, { status: "SUBMITTED", reviewedById: null });
    await db.audit("UPDATE", "Maturity", m.code, `تراجع عن اعتماد التقييم — ${deptName(m.clusterId)}`);
    await reload("maturity"); ov.remove(); toast("تم التراجع عن الاعتماد"); done();
  });
  // اعتماد المسودة: نقلها إلى «بانتظار المراجعة» فقط (ليس اعتماد مراجعة نهائية)
  $("#mt-approvedraft", ov)?.addEventListener("click", async () => {
    if (!(await confirmBox("اعتماد المسودة ونقلها إلى «بانتظار المراجعة»؟ (دون اعتماد مراجعة نهائية)"))) return;
    await db.updateRow("maturity", m.id, { status: "SUBMITTED", submittedAt: m.submittedAt || db.now() });
    await db.audit("SUBMIT", "Maturity", m.code, `اعتماد المسودة (بانتظار المراجعة) — ${deptName(m.clusterId)}`);
    await reload("maturity"); ov.remove(); toast("اعتُمدت المسودة"); done();
  });
  // اعتماد التقييم الذاتي مباشرةً من المسودة: تُعتمد درجات التجمع كما هي نتيجةً معتمدة
  $("#mt-adopt", ov)?.addEventListener("click", async () => {
    if (!(await confirmBox("اعتماد التقييم الذاتي الحالي (مسودة) كنتيجة معتمدة، دون انتظار إرسال التجمع؟"))) return;
    await db.updateRow("maturity", m.id, {
      status: "REVIEWED",
      reviewNotes: m.reviewNotes || "اعتُمد التقييم الذاتي كما هو من قبل إدارة الالتزام",
      reviewedById: user.uid,
      submittedAt: m.submittedAt || db.now(),
    });
    await db.audit("REVIEW", "Maturity", m.code, `اعتماد التقييم الذاتي من مسودة — ${deptName(m.clusterId)}`);
    await reload("maturity"); ov.remove(); toast("اعتُمد التقييم الذاتي"); done();
  });
  $("#mt-del", ov)?.addEventListener("click", async () => {
    ov.remove();
    if (!(await confirmBox(`حذف تقييم ${m.code}؟`))) return;
    await db.removeRow("maturity", m.id);
    await db.audit("DELETE", "Maturity", m.code, `حذف تقييم نضج ${m.code}`);
    await reload("maturity"); toast("تم الحذف"); done();
  });
}

// نافذة إرسال بريد إلكتروني يحتوي رسالة ورابط مجلد الأدلة
// يفتح تطبيق البريد لدى المستخدم عبر رابط mailto (النظام مستضاف كموقع ثابت بلا خادم بريد)
function openEmailModal(m, repo = "") {
  const cluster = deptName(m.clusterId);
  const subject = `أدلة تقييم نضج الالتزام — ${cluster} — الربع ${m.quarter}/${m.year}`;
  const body =
    `الأعزاء في إدارة الالتزام في ${cluster}،\n` +
    `تحية طيبة،،\n\n` +
    `مرفق رابط مجلد الأدلة الداعمة لتقييم نضج الالتزام الخاص بـ«${cluster}» للربع ${m.quarter}/${m.year}:\n` +
    `${repo || "(لم يُحدَّد رابط المجلد بعد — يُرجى تحديده ثم إعادة الإرسال)"}\n\n` +
    `وتفضلوا بقبول فائق الاحترام والتقدير.`;

  // جهات الاتصال من دليل التواصل التي لديها بريد (الرسمي أولاً ضمن التسمية)، وجهات
  // التجمع المعنيّ بالتقييم تظهر في الأعلى لتسهيل الاختيار
  const seen = new Set();
  const contacts = [];
  for (const c of store.directory) {
    for (const [email, kind] of [[c.email, ""], [c.officialEmail, " (بريد رسمي)"]]) {
      const addr = (email || "").trim();
      if (!addr || seen.has(addr)) continue;
      seen.add(addr);
      const cl = (c.cluster || "").trim();
      contacts.push({
        email: addr,
        label: `${c.name || cl || "—"}${cl ? " — " + cl : ""}${kind} · ${addr}`,
        same: cl === cluster.trim(),
      });
    }
  }
  contacts.sort((a, b) => (b.same - a.same) || a.label.localeCompare(b.label, "ar"));

  const pickerField = contacts.length
    ? fld("اختيار من دليل التواصل", `<select id="em-pick"><option value="">— اختر جهة لإضافة بريدها —</option>${contacts.map((c) => `<option value="${esc(c.email)}">${esc(c.label)}</option>`).join("")}</select>`)
    : `<p class="muted">لا توجد جهات ذات بريد في دليل التواصل — أدخل البريد يدوياً.</p>`;

  const ov = modal(`
    <h2>✉ إرسال بريد بمجلد الأدلة</h2>
    ${pickerField}
    <div class="form-grid">
      ${fld("إلى (البريد الإلكتروني)", '<input type="email" id="em-to" placeholder="name@example.com — يمكن إضافة أكثر من بريد بفاصلة" />')}
      ${fld("الموضوع", `<input type="text" id="em-subject" value="${esc(subject)}" />`)}
    </div>
    ${fld("رابط المجلد", `<input type="url" id="em-repo" value="${esc(repo)}" placeholder="https://…" />`)}
    ${fld("نص الرسالة", area("em-body", body, "", 7))}
    <p class="muted">سيُفتح تطبيق البريد لديك برسالة جاهزة تتضمّن الرابط — راجعها ثم أرسلها.</p>
    <div class="row" style="margin-top:12px;gap:6px;flex-wrap:wrap">
      <button id="em-send">📧 فتح تطبيق البريد</button>
      <button class="secondary" id="em-copy">نسخ نص الرسالة</button>
      <button class="secondary" id="em-cancel">إغلاق</button>
    </div>`);

  $("#em-cancel", ov).onclick = () => ov.remove();

  // اختيار جهة من دليل التواصل يضيف بريدها إلى حقل «إلى» (دون تكرار) ويدعم عدة مستلمين
  $("#em-pick", ov)?.addEventListener("change", (e) => {
    const addr = e.target.value;
    e.target.value = "";
    if (!addr) return;
    const to = $("#em-to", ov);
    const list = to.value.split(",").map((s) => s.trim()).filter(Boolean);
    if (!list.includes(addr)) list.push(addr);
    to.value = list.join(", ");
  });

  // يضمّن رابط المجلد في نص الرسالة إن غيّره المستخدم ولم يعد مذكوراً
  const composed = () => {
    let text = $("#em-body", ov).value;
    const url = val("em-repo", ov);
    if (url && !text.includes(url)) text += `\n\nرابط المجلد: ${url}`;
    return text;
  };

  $("#em-copy", ov).onclick = async () => {
    try { await navigator.clipboard.writeText(composed()); toast("نُسخت الرسالة"); }
    catch { toast("تعذّر النسخ — انسخ النص يدوياً", true); }
  };

  $("#em-send", ov).onclick = () => {
    const recipients = val("em-to", ov).split(",").map((s) => s.trim()).filter(Boolean);
    if (recipients.some((p) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p))) return toast("صيغة البريد الإلكتروني غير صحيحة", true);
    const subj = val("em-subject", ov);
    const href = `mailto:${encodeURIComponent(recipients.join(","))}?subject=${encodeURIComponent(subj)}&body=${encodeURIComponent(composed())}`;
    window.location.href = href;
    toast("فُتح تطبيق البريد");
    ov.remove();
  };
}
