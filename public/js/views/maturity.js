// تقييم نضج الالتزام في التجمعات الصحية (ISO 37301)
// التجمع يقيّم نفسه (0..3 لكل معيار مع الأدلة) ويرسل، ومدير الالتزام في الشركة يراجع
// ربعياً ويعيد التقييم بناءً على الأدلة الداعمة. النتائج الربعية تظهر للجميع المعنيين.
import { store, reload, deptName, clusterOptions } from "../state.js";
import * as db from "../db.js";
import {
  $, esc, safeUrl, toast, modal, confirmBox, fld, sel, area, val,
  fmtDate, statusBadgeFrom, levelBadge, progressBar, emptyMsg,
} from "../ui.js";
import { MATURITY_MODEL, MATURITY_SCALE, MATURITY_STATUS, maturityLevel } from "../meta.js";
import { canEdit, canApprove, isClusterOfficer } from "../auth.js";

const ST_ROLE = { DRAFT: "neutral", SUBMITTED: "warning", REVIEWED: "good" };
const tabState = { tab: "list" }; // list | results

// نسخة جديدة من النموذج القياسي (40 معياراً) بدرجات صفرية
function blankDomains() {
  return MATURITY_MODEL.map((d) => ({
    name: d.name, ref: d.ref,
    criteria: d.criteria.map((text) => ({ text, selfScore: 0, reviewScore: null, evidence: "", note: "" })),
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

  const domHtml = (m.domains || []).map((dom, di) => {
    const p = domainPct(dom, useReview);
    const crits = dom.criteria.map((c, ci) => {
      const scoreCell = canSelfEdit
        ? `<select class="mt-self" data-d="${di}" data-c="${ci}">${[0, 1, 2, 3].map((n) => `<option value="${n}" ${n === (c.selfScore || 0) ? "selected" : ""}>${n}</option>`).join("")}</select>`
        : `<span class="chip">ذاتي: ${c.selfScore || 0}</span>`;
      const reviewCell = canReview
        ? `<select class="mt-review" data-d="${di}" data-c="${ci}"><option value="">— كالذاتي —</option>${[0, 1, 2, 3].map((n) => `<option value="${n}" ${c.reviewScore === n ? "selected" : ""}>${n}</option>`).join("")}</select>`
        : (c.reviewScore != null ? `<span class="chip chip-auto">مراجعة: ${c.reviewScore}</span>` : "");
      const evCell = canSelfEdit
        ? `<input type="text" class="mt-ev" data-d="${di}" data-c="${ci}" placeholder="رابط الدليل الداعم" value="${esc(c.evidence || "")}" />`
        : (c.evidence ? `<a href="${safeUrl(c.evidence)}" target="_blank" rel="noopener">📎 دليل</a>` : '<span class="muted">لا دليل</span>');
      return `<tr>
        <td>${esc(c.text)}</td>
        <td>${scoreCell}</td>
        <td>${reviewCell}</td>
        <td style="min-width:160px">${evCell}</td>
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
  const ov = modal(`
    <div class="row" style="justify-content:space-between">
      <h2>${esc(m.code)} — ${esc(deptName(m.clusterId))}</h2>
      <span>${statusBadgeFrom(MATURITY_STATUS, m.status, ST_ROLE)}</span>
    </div>
    <p class="muted">الربع ${m.quarter} / ${m.year} · النضج المعتمد: ${levelBadge(maturityLevel(pct).key, `${pct}٪ — ${maturityLevel(pct).label}`)}</p>
    <div class="scale-note muted">مقياس التقييم: ${Object.entries(MATURITY_SCALE).map(([k, v]) => `<strong>${k}</strong>=${esc(v)}`).join(" · ")}</div>
    ${domHtml}
    ${canReview ? fld("ملاحظات المراجعة الربعية", area("mt-rnotes", m.reviewNotes, "قرار المراجعة والملاحظات على الأدلة", 2)) : m.reviewNotes ? `<p><strong>ملاحظات المراجعة:</strong> ${esc(m.reviewNotes)}</p>` : ""}
    <div class="row" style="margin-top:14px">
      ${canSelfEdit ? '<button id="mt-savedraft" class="secondary">حفظ مؤقت</button><button id="mt-submit">📤 إرسال للمراجعة</button>' : ""}
      ${canReview ? '<button id="mt-review">✔ اعتماد المراجعة الربعية</button>' : ""}
      ${(canEdit(user) || officer) && m.status !== "REVIEWED" ? '<button class="danger" id="mt-del">حذف</button>' : ""}
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
  $("#mt-del", ov)?.addEventListener("click", async () => {
    ov.remove();
    if (!(await confirmBox(`حذف تقييم ${m.code}؟`))) return;
    await db.removeRow("maturity", m.id);
    await db.audit("DELETE", "Maturity", m.code, `حذف تقييم نضج ${m.code}`);
    await reload("maturity"); toast("تم الحذف"); done();
  });
}
