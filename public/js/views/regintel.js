// الرصد التنظيمي وإدارة التغيير — الواجهة الموحّدة (تبويبات داخل وحدة واحدة)
// لوحة الرصد · المستجدات · بانتظار المراجعة · المصادر · الالتزامات المولّدة ·
// المواعيد التنظيمية · الإجراءات · التقارير الأسبوعية
import { store, reload, deptName, deptOptions, authName, authOptions, userName } from "../state.js";
import * as db from "../db.js";
import { canEdit, canApprove } from "../auth.js";
import {
  $, esc, toast, modal, confirmBox, fld, txt, area, sel, dateInp, val,
  fmtDate, fmtDateTime, daysUntil, isoFromInput, statusBadgeFrom, levelBadge, emptyMsg,
  chip, keepFocus, statTile, distBar, progressBar, hBars, spinnerHtml,
} from "../ui.js";
import {
  REG_SOURCE_TYPES, REG_SOURCE_STATUS, REG_SOURCE_STATUS_ROLE,
  REG_UPDATE_STATUS, REG_UPDATE_ROLE, REG_APPLICABILITY, REG_APPLICABILITY_ROLE,
  REG_IMPACT, REG_IMPACT_ROLE, REG_SCAN_STATUS, REG_SCAN_STATUS_ROLE, REG_SCAN_TRIGGER,
  REG_ANALYSIS_METHOD, REG_DEADLINE_KINDS, REG_SOURCE_SEED,
  DOC_SECTORS, CRITICALITY, ACTION_STATUS, PLAN_STATUS,
} from "../meta.js";
import * as engine from "../regintel.js";
import { aiEnabled } from "../ai-assist.js";

const TABS = {
  dashboard: { icon: "📊", label: "لوحة الرصد", tip: "مؤشرات الرصد التنظيمي: المستجدات والانطباق والأثر وحالة المصادر" },
  updates: { icon: "📰", label: "المستجدات التنظيمية", tip: "كل ما رُصد من أنظمة ولوائح وتعاميم وقرارات" },
  pending: { icon: "⏳", label: "بانتظار المراجعة", tip: "المستجدات المحلَّلة التي تنتظر قرار مدير الالتزام" },
  sources: { icon: "🌐", label: "مصادر الرصد", tip: "الجهات والروابط التي يفحصها المحرك أسبوعياً" },
  obligations: { icon: "📌", label: "الالتزامات المولّدة", tip: "متطلبات مكتبة الالتزام المولّدة من المستجدات المعتمدة" },
  deadlines: { icon: "⏰", label: "المواعيد التنظيمية", tip: "تواريخ النفاذ ومهل الامتثال واستحقاقات الالتزامات والإجراءات" },
  actions: { icon: "🛠", label: "الإجراءات التنظيمية", tip: "الإجراءات التصحيحية ومبادرات الخطة الناشئة عن المستجدات" },
  reports: { icon: "🗓", label: "التقارير الأسبوعية", tip: "تقرير أسبوعي بحصاد الرصد التنظيمي" },
};

const state = { tab: "dashboard" };
const filters = { search: "", status: "", applicability: "", impact: "", source: "" };

const upd = (id) => store.regUpdates.find((u) => u.id === id);
const sourceName = (id) => store.regSources.find((s) => s.id === id)?.name || "—";

function head(editable, approver) {
  return `
    <div class="page-head">
      <h1>🛰 الرصد التنظيمي</h1>
      <div class="row">
        ${approver ? '<button id="ri-scan" title="تشغيل فحص فوري لكل المصادر المفعّلة (يمنع المحرك تشغيل فحصين معاً)">⟳ تشغيل الفحص الآن</button>' : ""}
        ${editable ? '<button class="secondary" id="ri-manual" title="تسجيل مستجد تنظيمي يدوياً (لصق العنوان والرابط والنص)">＋ مستجد يدوي</button>' : ""}
        ${approver ? '<button class="secondary" id="ri-cfg" title="إعدادات الرصد: سياق المنشأة والتحليل التلقائي والتقرير الأسبوعي">⚙ الإعدادات</button>' : ""}
      </div>
    </div>
    <p class="muted">رصد المستجدات التنظيمية من مصادرها الرسمية، وتحليل انطباقها على المنشأة بالذكاء الاصطناعي،
      ثم اعتمادها ودمجها آلياً في مكتبة الالتزام وسجل المخاطر والضوابط وبرنامج المراقبة والخطة السنوية والملاحظات.</p>
    <div class="subtabs plan-axes">
      ${Object.entries(TABS)
        .map(([k, t]) => `<button class="subtab ${state.tab === k ? "active" : ""}" data-tab="${k}" title="${esc(t.tip)}">${t.icon} ${esc(t.label)}</button>`)
        .join("")}
    </div>`;
}

export function renderRegIntel(el, nav, refresh, params = {}) {
  if (params.tab && TABS[params.tab]) state.tab = params.tab;
  const editable = canEdit(store.user);
  const approver = canApprove(store.user);
  const rerender = () => renderRegIntel(el, nav, refresh);

  const body = { dashboard: viewDashboard, updates: viewUpdates, pending: viewPending, sources: viewSources,
    obligations: viewObligations, deadlines: viewDeadlines, actions: viewActions, reports: viewReports }[state.tab];

  el.innerHTML = head(editable, approver) + `<div id="ri-body">${body(nav, rerender)}</div>`;

  el.querySelectorAll("[data-tab]").forEach((b) => (b.onclick = () => { state.tab = b.dataset.tab; rerender(); }));
  $("#ri-scan", el)?.addEventListener("click", () => runScan(rerender));
  $("#ri-manual", el)?.addEventListener("click", () => openManualForm(rerender));
  $("#ri-cfg", el)?.addEventListener("click", () => openConfig());
  bindBody(el, nav, rerender);
}

// ---------- 1) لوحة الرصد ----------
function viewDashboard() {
  const all = store.regUpdates;
  const pending = all.filter((u) => ["DETECTED", "ANALYZED"].includes(u.status));
  const approved = all.filter((u) => u.status === "APPROVED");
  const applicable = all.filter((u) => u.applicability === "APPLICABLE");
  const deadlines = engine.collectDeadlines();
  const overdue = deadlines.filter((d) => daysUntil(d.date) < 0);
  const soon = deadlines.filter((d) => { const n = daysUntil(d.date); return n >= 0 && n <= 30; });
  const actions = engine.collectActions();
  const openActions = actions.filter((a) => !["COMPLETED", "CLOSED"].includes(a.status));
  const lastScan = store.regScans.slice().sort((a, b) => String(b.startedAt || "").localeCompare(String(a.startedAt || "")))[0];
  const activeSources = store.regSources.filter((s) => s.active !== false);
  const genReqs = store.requirements.filter((r) => r.regUpdateId).length;
  const genRisks = store.risks.filter((r) => r.regUpdateId).length;
  const genMon = store.monitoring.filter((m) => m.regUpdateId).length;
  const genFnd = store.findings.filter((f) => f.regUpdateId).length;

  const byMonth = {};
  for (const u of all) {
    const k = String(u.detectedAt || u.createdAt || "").slice(0, 7);
    if (k) byMonth[k] = (byMonth[k] || 0) + 1;
  }
  const months = Object.keys(byMonth).sort().slice(-6);

  return `
    <div class="stats">
      ${statTile(all.length, "إجمالي المستجدات المرصودة")}
      ${statTile(pending.length, "بانتظار المراجعة", pending.length ? '<span class="lvl lvl-warning"><span class="dot"></span>يلزم قرار</span>' : "")}
      ${statTile(applicable.length, "منطبقة على المنشأة")}
      ${statTile(approved.length, "معتمدة ومدمجة")}
      ${statTile(overdue.length, "مواعيد متأخرة", overdue.length ? '<span class="lvl lvl-critical"><span class="dot"></span>تجاوزت الاستحقاق</span>' : "")}
      ${statTile(soon.length, "مواعيد خلال 30 يوماً")}
    </div>

    <div class="grid-2">
      <section class="card">
        <h2>الانطباق على المنشأة</h2>
        ${distBar(Object.entries(REG_APPLICABILITY).map(([k, label]) => ({
          label, count: all.filter((u) => (u.applicability || "UNKNOWN") === k).length, role: REG_APPLICABILITY_ROLE[k],
        })))}
        <h2 style="margin-top:16px">درجة الأثر</h2>
        ${distBar(Object.entries(REG_IMPACT).map(([k, label]) => ({
          label, count: all.filter((u) => (u.impact || "LOW") === k).length, role: REG_IMPACT_ROLE[k],
        })))}
      </section>

      <section class="card">
        <h2>الأثر على وحدات الالتزام</h2>
        <p class="muted">السجلات التي وُلّدت في الوحدات القائمة من المستجدات المعتمدة — اضغط للانتقال.</p>
        ${hBars([
          { label: "التزامات في مكتبة الالتزام", count: genReqs, tip: "متطلبات وُلّدت من مستجدات تنظيمية معتمدة" },
          { label: "مخاطر في السجل", count: genRisks, tip: "مخاطر عدم التزام مرتبطة بالمستجدات" },
          { label: "أنشطة مراقبة", count: genMon, tip: "أنشطة رقابية للتحقق من التطبيق" },
          { label: "فجوات وخطط تصحيح", count: genFnd, tip: "ملاحظات فُتحت لفجوات الامتثال" },
          { label: "مبادرات في الخطة السنوية", count: store.planItems.filter((p) => p.regUpdateId).length, tip: "مبادرات متابعة تنظيمية" },
          { label: "نماذج فحص ذاتي", count: store.assessments.filter((x) => x.regUpdateId).length, tip: "فحوصات ذاتية للإدارات" },
        ])}
      </section>
    </div>

    <div class="grid-2">
      <section class="card">
        <h2>حالة الفحص الدوري</h2>
        <div class="detail-grid">
          <div><span class="muted">المصادر المفعّلة</span><br/><strong>${activeSources.length}</strong> من ${store.regSources.length}</div>
          <div><span class="muted">آخر فحص</span><br/>${lastScan ? fmtDateTime(lastScan.startedAt) : "—"}</div>
          <div><span class="muted">نتيجة آخر فحص</span><br/>${lastScan ? statusBadgeFrom(REG_SCAN_STATUS, lastScan.status, REG_SCAN_STATUS_ROLE) : '<span class="muted">لم يُشغَّل بعد</span>'}</div>
          <div><span class="muted">التحليل الذكي</span><br/>${aiEnabled()
            ? '<span class="lvl lvl-good"><span class="dot"></span>مفعّل في المتصفح</span>'
            : '<span class="lvl lvl-warning"><span class="dot"></span>غير مفعّل — أضف مفتاح Claude من ⚙</span>'}</div>
        </div>
        <p class="muted" style="margin-top:8px">يعمل الفحص المجدول أسبوعياً في الخادم، ويمكن لمدير الالتزام تشغيله يدوياً من أعلى الصفحة.</p>
        ${lastScan ? `<p class="muted">آخر فحص: ${lastScan.sourcesScanned || 0} مصدر · ${lastScan.itemsFound || 0} عنصر · ${lastScan.created || 0} مستجد جديد${lastScan.errors?.length ? ` · ${lastScan.errors.length} خطأ` : ""}</p>` : ""}
      </section>

      <section class="card">
        <h2>المرصود شهرياً</h2>
        ${months.length ? hBars(months.map((m) => ({ label: m, count: byMonth[m] }))) : emptyMsg("لا توجد بيانات بعد — شغّل الفحص أو سجّل مستجداً يدوياً")}
        <h2 style="margin-top:16px">الإجراءات التنظيمية</h2>
        ${actions.length
          ? `${progressBar((100 * (actions.length - openActions.length)) / actions.length)}
             <p class="muted">${actions.length - openActions.length} مكتمل من ${actions.length} إجراء</p>`
          : emptyMsg("لا توجد إجراءات مرتبطة بمستجدات تنظيمية بعد")}
      </section>
    </div>

    ${pending.length ? `<section class="card">
      <h2>⏳ أقرب المستجدات المنتظرة للمراجعة</h2>
      <div class="link-list">
        ${pending.slice(0, 6).map((u) => `<div class="link-item" data-open="${esc(u.id)}">
          <strong>${esc(u.code)}</strong> ${esc(String(u.title).slice(0, 90))}
          ${statusBadgeFrom(REG_UPDATE_STATUS, u.status, REG_UPDATE_ROLE)}
        </div>`).join("")}
      </div>
    </section>` : ""}`;
}

// ---------- 2) المستجدات ----------
function updatesTable(rows) {
  return `<div style="overflow-x:auto">
    <table>
      <thead><tr>
        <th>الرقم</th><th>المستجد</th><th>المصدر</th><th>النشر</th>
        <th>الانطباق</th><th>الأثر</th><th>الالتزامات</th><th>الحالة</th>
      </tr></thead>
      <tbody>
        ${rows.map((u) => `<tr class="rowlink" data-open="${esc(u.id)}">
          <td><strong>${esc(u.code)}</strong></td>
          <td><strong>${esc(String(u.title).slice(0, 110))}</strong>
            ${u.analysisMethod ? `<span class="chip chip-auto" data-tip="${esc(REG_ANALYSIS_METHOD[u.analysisMethod] || u.analysisMethod)}">${u.analysisMethod === "ai" ? "🤖 ذكاء اصطناعي" : "📝 تحليل نصي"}</span>` : ""}
            ${u.analysis?.summary ? `<div class="muted clamp">${esc(u.analysis.summary)}</div>` : ""}</td>
          <td>${esc(u.sourceName || sourceName(u.sourceId))}</td>
          <td>${fmtDate(u.publishedAt || u.detectedAt)}</td>
          <td>${statusBadgeFrom(REG_APPLICABILITY, u.applicability || "UNKNOWN", REG_APPLICABILITY_ROLE)}</td>
          <td>${statusBadgeFrom(REG_IMPACT, u.impact || "LOW", REG_IMPACT_ROLE)}</td>
          <td>${u.generated?.requirementIds?.length
            ? chip(`${u.generated.requirementIds.length} التزام`)
            : (u.analysis?.obligations?.length ? `<span class="muted">${u.analysis.obligations.length} مقترح</span>` : '<span class="muted">—</span>')}</td>
          <td>${statusBadgeFrom(REG_UPDATE_STATUS, u.status, REG_UPDATE_ROLE)}</td>
        </tr>`).join("") || `<tr><td colspan="8">${emptyMsg("لا توجد مستجدات مطابقة")}</td></tr>`}
      </tbody>
    </table>
  </div>`;
}

function applyFilters(list) {
  return list.filter((u) => {
    if (filters.search && !`${u.code} ${u.title} ${u.analysis?.summary || ""}`.includes(filters.search)) return false;
    if (filters.status && u.status !== filters.status) return false;
    if (filters.applicability && (u.applicability || "UNKNOWN") !== filters.applicability) return false;
    if (filters.impact && (u.impact || "LOW") !== filters.impact) return false;
    if (filters.source && u.sourceId !== filters.source) return false;
    return true;
  }).sort((a, b) => String(b.detectedAt || "").localeCompare(String(a.detectedAt || "")));
}

function viewUpdates() {
  const rows = applyFilters(store.regUpdates);
  return `<section class="card">
    <div class="row filters">
      <input type="text" id="f-search" class="grow" placeholder="بحث بالرقم أو العنوان أو الملخّص…" value="${esc(filters.search)}" />
      ${sel("f-status", REG_UPDATE_STATUS, filters.status, { empty: "كل الحالات" })}
      ${sel("f-app", REG_APPLICABILITY, filters.applicability, { empty: "كل درجات الانطباق" })}
      ${sel("f-imp", REG_IMPACT, filters.impact, { empty: "كل درجات الأثر" })}
      ${sel("f-src", store.regSources.map((s) => ({ id: s.id, name: s.name })), filters.source, { empty: "كل المصادر" })}
    </div>
    ${updatesTable(rows)}
    <p class="muted">عدد النتائج: ${rows.length} من ${store.regUpdates.length}</p>
  </section>`;
}

function viewPending() {
  const rows = store.regUpdates
    .filter((u) => ["DETECTED", "ANALYZED"].includes(u.status))
    .sort((a, b) => String(b.detectedAt || "").localeCompare(String(a.detectedAt || "")));
  const unanalyzed = rows.filter((u) => u.status === "DETECTED");
  return `<section class="card">
    <div class="row" style="justify-content:space-between">
      <h2>⏳ بانتظار مراجعة الالتزام (${rows.length})</h2>
      ${unanalyzed.length && canEdit(store.user)
        ? `<button class="secondary small" id="ri-analyze-all" title="تحليل كل المستجدات غير المحلَّلة تباعاً">🤖 تحليل الكل (${unanalyzed.length})</button>`
        : ""}
    </div>
    <p class="muted">افتح المستجد لمراجعة الملخّص وقرار الانطباق، ثم اعتمده لدمجه في وحدات الالتزام أو استبعده.</p>
    ${updatesTable(rows)}
  </section>`;
}

// ---------- 3) المصادر ----------
function viewSources() {
  const editable = canEdit(store.user);
  const rows = store.regSources;
  return `<section class="card">
    <div class="row" style="justify-content:space-between">
      <h2>🌐 مصادر الرصد (${rows.length})</h2>
      ${editable ? `<div class="row">
        <button class="small" id="src-add" title="إضافة مصدر رصد جديد">＋ مصدر</button>
        <button class="secondary small" id="src-seed" title="إضافة قائمة الجهات الرسمية السعودية كمصادر معطّلة للتحقق منها">📥 بذر المصادر الرسمية</button>
      </div>` : ""}
    </div>
    <p class="muted">يُسمح بروابط HTTPS العامة فقط؛ ويرفض الخادم أي عنوان يشير إلى شبكة داخلية أو منفذ غير قياسي (حماية SSRF).</p>
    <div style="overflow-x:auto">
      <table>
        <thead><tr>
          <th>المصدر</th><th>النوع</th><th>القطاع</th><th>الجهة</th>
          <th>آخر فحص</th><th>النتيجة</th><th>مستجدات</th><th>الحالة</th>${editable ? "<th></th>" : ""}
        </tr></thead>
        <tbody>
          ${rows.map((s) => `<tr>
            <td><strong>${esc(s.name)}</strong>${s.url ? `<div class="muted clamp"><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.url)}</a></div>` : ""}</td>
            <td>${esc(REG_SOURCE_TYPES[s.type] || s.type)}</td>
            <td>${esc(s.sector || "—")}</td>
            <td>${esc(s.authorityId ? authName(s.authorityId) : "—")}</td>
            <td>${s.lastScanAt ? fmtDateTime(s.lastScanAt) : "—"}</td>
            <td>${statusBadgeFrom(REG_SOURCE_STATUS, s.lastStatus || "NEVER", REG_SOURCE_STATUS_ROLE)}
              ${s.lastError ? `<div class="muted clamp" data-tip="${esc(s.lastError)}">${esc(String(s.lastError).slice(0, 60))}</div>` : ""}</td>
            <td>${s.totalDetected || 0}</td>
            <td>${s.active !== false
              ? '<span class="lvl lvl-good"><span class="dot"></span>مفعّل</span>'
              : '<span class="lvl lvl-neutral"><span class="dot"></span>معطّل</span>'}</td>
            ${editable ? `<td class="row">
              <button class="secondary small" data-edit-src="${esc(s.id)}" title="تعديل المصدر">تعديل</button>
              ${canApprove(store.user) && s.active !== false && s.type !== "MANUAL" ? `<button class="secondary small" data-scan-src="${esc(s.id)}" title="فحص هذا المصدر الآن">⟳</button>` : ""}
              <button class="danger small" data-del-src="${esc(s.id)}" title="حذف المصدر">✕</button>
            </td>` : ""}
          </tr>`).join("") || `<tr><td colspan="${editable ? 9 : 8}">${emptyMsg("لا توجد مصادر — أضف مصدراً أو ابذر القائمة الرسمية")}</td></tr>`}
        </tbody>
      </table>
    </div>
  </section>

  <section class="card">
    <h2>سجل عمليات الفحص</h2>
    <div style="overflow-x:auto">
      <table>
        <thead><tr><th>البدء</th><th>المشغّل</th><th>مصادر</th><th>عناصر</th><th>مستجدات جديدة</th><th>أخطاء</th><th>الحالة</th></tr></thead>
        <tbody>
          ${store.regScans.slice().sort((a, b) => String(b.startedAt || "").localeCompare(String(a.startedAt || ""))).slice(0, 20)
            .map((s) => `<tr>
              <td>${fmtDateTime(s.startedAt)}</td>
              <td>${esc(REG_SCAN_TRIGGER[s.trigger] || s.trigger || "—")}${s.triggeredByName ? ` — ${esc(s.triggeredByName)}` : ""}</td>
              <td>${s.sourcesScanned || 0}</td><td>${s.itemsFound || 0}</td><td>${s.created || 0}</td>
              <td>${s.errors?.length ? `<span class="lvl lvl-critical" data-tip="${esc(s.errors.map((e) => `${e.source}: ${e.error}`).join(" · "))}"><span class="dot"></span>${s.errors.length}</span>` : "0"}</td>
              <td>${statusBadgeFrom(REG_SCAN_STATUS, s.status, REG_SCAN_STATUS_ROLE)}</td>
            </tr>`).join("") || `<tr><td colspan="7">${emptyMsg("لم يُشغَّل أي فحص بعد")}</td></tr>`}
        </tbody>
      </table>
    </div>
  </section>`;
}

// ---------- 4) الالتزامات المولّدة ----------
function viewObligations() {
  const rows = store.requirements.filter((r) => r.regUpdateId);
  return `<section class="card">
    <h2>📌 الالتزامات المولّدة من المستجدات التنظيمية (${rows.length})</h2>
    <p class="muted">هذه سجلات حقيقية في <strong>مكتبة الالتزام</strong> — لا نسخة موازية — ولكل التزام مخاطره وضوابطه وأنشطة مراقبته.</p>
    <div style="overflow-x:auto">
      <table>
        <thead><tr>
          <th>الرمز</th><th>الالتزام</th><th>المستجد المصدر</th><th>الإدارة المالكة</th>
          <th>الأهمية</th><th>الاستحقاق</th><th>مخاطر</th><th>مراقبة</th><th>فجوات</th><th>الدليل المطلوب</th>
        </tr></thead>
        <tbody>
          ${rows.map((r) => {
            const src = upd(r.regUpdateId);
            const d = daysUntil(r.nextReviewDate);
            return `<tr>
              <td><strong>${esc(r.code)}</strong></td>
              <td><strong>${esc(r.title)}</strong><div class="muted clamp">${esc(r.summary || "")}</div></td>
              <td>${src ? `<span class="link-item" data-open="${esc(src.id)}" style="display:inline-block;padding:2px 6px">${esc(src.code)}</span>` : '<span class="muted">—</span>'}</td>
              <td>${esc(deptName(r.ownerDeptId))}</td>
              <td>${levelBadge(r.criticality, CRITICALITY[r.criticality] || r.criticality || "—")}</td>
              <td>${fmtDate(r.nextReviewDate)}${d !== null && d < 0 ? ' <span class="lvl lvl-critical"><span class="dot"></span>متأخر</span>' : ""}</td>
              <td>${store.risks.filter((x) => x.requirementId === r.id).length}</td>
              <td>${store.monitoring.filter((x) => x.requirementId === r.id).length}</td>
              <td>${store.findings.filter((x) => x.requirementId === r.id).length}</td>
              <td class="muted clamp">${esc(r.evidenceRequired || "—")}</td>
            </tr>`;
          }).join("") || `<tr><td colspan="10">${emptyMsg("لم تُولَّد التزامات بعد — اعتمد مستجداً تنظيمياً لتوليدها")}</td></tr>`}
        </tbody>
      </table>
    </div>
  </section>`;
}

// ---------- 5) المواعيد ----------
function viewDeadlines() {
  const all = engine.collectDeadlines();
  const overdue = all.filter((d) => daysUntil(d.date) < 0);
  const soon = all.filter((d) => { const n = daysUntil(d.date); return n >= 0 && n <= 30; });
  const later = all.filter((d) => daysUntil(d.date) > 30);
  const row = (d) => {
    const n = daysUntil(d.date);
    return `<tr class="rowlink" ${d.updateCode ? `data-open="${esc(d.updateId)}"` : `data-nav="${esc(d.view)}"`}>
      <td><strong>${esc(d.date)}</strong></td>
      <td>${esc(REG_DEADLINE_KINDS[d.kind] || d.kind)}</td>
      <td>${esc(d.title)}</td>
      <td>${esc(d.refCode || "—")}</td>
      <td>${n < 0 ? `<span class="lvl lvl-critical"><span class="dot"></span>متأخر ${-n} يوماً</span>`
        : n === 0 ? '<span class="lvl lvl-serious"><span class="dot"></span>يستحق اليوم</span>'
        : n <= 30 ? `<span class="lvl lvl-warning"><span class="dot"></span>خلال ${n} يوماً</span>`
        : `<span class="lvl lvl-good"><span class="dot"></span>بعد ${n} يوماً</span>`}</td>
    </tr>`;
  };
  const table = (title, rows) => `<section class="card">
    <h2>${title} (${rows.length})</h2>
    <div style="overflow-x:auto"><table>
      <thead><tr><th>التاريخ</th><th>النوع</th><th>البند</th><th>المرجع</th><th>الحالة</th></tr></thead>
      <tbody>${rows.map(row).join("") || `<tr><td colspan="5">${emptyMsg("لا يوجد")}</td></tr>`}</tbody>
    </table></div>
  </section>`;
  return `
    <div class="stats">
      ${statTile(all.length, "إجمالي المواعيد")}
      ${statTile(overdue.length, "متأخرة")}
      ${statTile(soon.length, "خلال 30 يوماً")}
      ${statTile(later.length, "لاحقة")}
    </div>
    ${table("⏰ متأخرة", overdue)}
    ${table("📅 قريبة (30 يوماً)", soon)}
    ${table("🗓 لاحقة", later)}`;
}

// ---------- 6) الإجراءات ----------
function viewActions() {
  const rows = engine.collectActions();
  const done = rows.filter((a) => ["COMPLETED", "CLOSED"].includes(a.status)).length;
  return `
    <div class="stats">
      ${statTile(rows.length, "إجمالي الإجراءات")}
      ${statTile(rows.filter((a) => a.kind === "FINDING").length, "إجراءات تصحيحية")}
      ${statTile(rows.filter((a) => a.kind === "PLAN").length, "مبادرات الخطة")}
      ${statTile(done, "مكتملة")}
    </div>
    <section class="card">
      <h2>🛠 الإجراءات الناشئة عن المستجدات التنظيمية</h2>
      <p class="muted">الإجراءات تُدار في وحداتها الأصلية (الملاحظات والتصحيح · الخطة السنوية) — اضغط الصف للانتقال إليها.</p>
      <div style="overflow-x:auto"><table>
        <thead><tr><th>المصدر</th><th>الإجراء</th><th>المستجد</th><th>الإدارة</th><th>المسؤول</th><th>الاستحقاق</th><th>التقدم</th><th>الحالة</th></tr></thead>
        <tbody>
          ${rows.map((a) => {
            const src = upd(a.regUpdateId);
            return `<tr class="rowlink" data-nav="${esc(a.view)}">
              <td>${a.kind === "FINDING" ? "🛠 ملاحظة" : "📅 خطة"} <span class="muted">${esc(a.code)}</span></td>
              <td><strong>${esc(String(a.title || "").slice(0, 120))}</strong>${a.parentTitle && a.parentTitle !== a.title ? `<div class="muted clamp">${esc(a.parentTitle)}</div>` : ""}</td>
              <td>${src ? esc(src.code) : "—"}</td>
              <td>${esc(deptName(a.departmentId))}</td>
              <td>${esc(a.ownerId ? userName(a.ownerId) : "—")}</td>
              <td>${fmtDate(a.dueDate)}</td>
              <td>${progressBar(a.progress)}</td>
              <td>${esc(ACTION_STATUS[a.status] || PLAN_STATUS[a.status] || a.status)}</td>
            </tr>`;
          }).join("") || `<tr><td colspan="8">${emptyMsg("لا توجد إجراءات مرتبطة بمستجدات تنظيمية")}</td></tr>`}
        </tbody>
      </table></div>
    </section>`;
}

// ---------- 7) التقارير الأسبوعية ----------
function viewReports() {
  const live = engine.buildWeeklyReport();
  const saved = store.regReports.slice().sort((a, b) => String(b.to || "").localeCompare(String(a.to || "")));
  return `
    <section class="card">
      <div class="row" style="justify-content:space-between">
        <h2>🗓 تقرير الأسبوع (${live.from.slice(0, 10)} → ${live.to.slice(0, 10)})</h2>
        ${canEdit(store.user) ? '<button class="small" id="rep-save" title="حفظ التقرير الأسبوعي في السجل">💾 حفظ التقرير</button>' : ""}
      </div>
      <div class="stats">
        ${statTile(live.total, "مستجدات الأسبوع")}
        ${statTile(live.approved, "معتمدة ومدمجة")}
        ${statTile(live.pending, "بانتظار المراجعة")}
        ${statTile(live.highImpact, "عالية الأثر")}
        ${statTile(live.generatedRequirements, "التزامات مولّدة")}
        ${statTile(live.generatedRisks, "مخاطر مولّدة")}
      </div>
      <h3>المستجدات</h3>
      <div style="overflow-x:auto"><table>
        <thead><tr><th>الرقم</th><th>المستجد</th><th>المصدر</th><th>الانطباق</th><th>الأثر</th><th>الحالة</th></tr></thead>
        <tbody>${live.items.map((i) => `<tr class="rowlink" data-open="${esc(i.id)}">
          <td><strong>${esc(i.code || "")}</strong></td><td>${esc(String(i.title).slice(0, 110))}</td>
          <td>${esc(i.sourceName || "—")}</td>
          <td>${statusBadgeFrom(REG_APPLICABILITY, i.applicability, REG_APPLICABILITY_ROLE)}</td>
          <td>${statusBadgeFrom(REG_IMPACT, i.impact, REG_IMPACT_ROLE)}</td>
          <td>${statusBadgeFrom(REG_UPDATE_STATUS, i.status, REG_UPDATE_ROLE)}</td>
        </tr>`).join("") || `<tr><td colspan="6">${emptyMsg("لا مستجدات في هذا الأسبوع")}</td></tr>`}</tbody>
      </table></div>
      <h3 style="margin-top:14px">أقرب المواعيد</h3>
      ${live.upcomingDeadlines.length
        ? `<div class="link-list">${live.upcomingDeadlines.slice(0, 12).map((d) => `<div class="link-item"><strong>${esc(d.date)}</strong> — ${esc(d.title)} <span class="muted">${esc(REG_DEADLINE_KINDS[d.kind] || d.kind)}</span></div>`).join("")}</div>`
        : emptyMsg("لا مواعيد قريبة")}
      <p class="muted" style="margin-top:10px">التقرير الأسبوعي يُولَّد آلياً في الخادم كل أسبوع ويُرسل ملخّصه بالبريد لمديري الالتزام،
        ويمكن توليده وحفظه يدوياً من هنا. التصدير إلى Excel/Word/PDF متاح من وحدة <strong>التقارير</strong>.</p>
    </section>

    <section class="card">
      <h2>التقارير المحفوظة (${saved.length})</h2>
      <div style="overflow-x:auto"><table>
        <thead><tr><th>الأسبوع</th><th>مستجدات</th><th>معتمدة</th><th>منتظرة</th><th>التزامات</th><th>مخاطر</th><th>التوليد</th></tr></thead>
        <tbody>${saved.slice(0, 30).map((r) => `<tr>
          <td><strong>${esc(String(r.from || "").slice(0, 10))} → ${esc(String(r.to || "").slice(0, 10))}</strong></td>
          <td>${r.total || 0}</td><td>${r.approved || 0}</td><td>${r.pending || 0}</td>
          <td>${r.generatedRequirements || 0}</td><td>${r.generatedRisks || 0}</td>
          <td>${fmtDateTime(r.generatedAt)}<div class="muted">${esc(r.generatedByName || (r.trigger === "SCHEDULE" ? "الجدولة الأسبوعية" : "—"))}</div></td>
        </tr>`).join("") || `<tr><td colspan="7">${emptyMsg("لا توجد تقارير محفوظة بعد")}</td></tr>`}</tbody>
      </table></div>
    </section>`;
}

// ---------- الربط ----------
function bindBody(el, nav, rerender) {
  const b = $("#ri-body", el);
  if (!b) return;
  $("#f-search", b)?.addEventListener("input", (e) => { filters.search = e.target.value; keepFocus(rerender); });
  $("#f-status", b) && ($("#f-status", b).onchange = (e) => { filters.status = e.target.value; rerender(); });
  $("#f-app", b) && ($("#f-app", b).onchange = (e) => { filters.applicability = e.target.value; rerender(); });
  $("#f-imp", b) && ($("#f-imp", b).onchange = (e) => { filters.impact = e.target.value; rerender(); });
  $("#f-src", b) && ($("#f-src", b).onchange = (e) => { filters.source = e.target.value; rerender(); });

  b.querySelectorAll("[data-open]").forEach((n) => n.addEventListener("click", () => openDetail(n.dataset.open, nav, rerender)));
  b.querySelectorAll("[data-nav]").forEach((n) => n.addEventListener("click", () => nav(n.dataset.nav)));

  $("#src-add", b)?.addEventListener("click", () => openSourceForm(null, rerender));
  $("#src-seed", b)?.addEventListener("click", async () => {
    if (!(await confirmBox(`ستُضاف ${REG_SOURCE_SEED.length} جهة رسمية كمصادر معطّلة تتحقق منها وتفعّلها يدوياً. متابعة؟`))) return;
    try {
      const n = await engine.seedSources(REG_SOURCE_SEED);
      toast(n ? `أُضيف ${n} مصدراً (معطّلة حتى التفعيل)` : "كل المصادر الرسمية موجودة مسبقاً");
      rerender();
    } catch (e) { toast(e.message, true); }
  });
  b.querySelectorAll("[data-edit-src]").forEach((n) =>
    n.addEventListener("click", () => openSourceForm(store.regSources.find((s) => s.id === n.dataset.editSrc), rerender)));
  b.querySelectorAll("[data-del-src]").forEach((n) =>
    n.addEventListener("click", async () => {
      const s = store.regSources.find((x) => x.id === n.dataset.delSrc);
      if (!(await confirmBox(`حذف المصدر «${s?.name}»؟ لا تُحذف المستجدات المرصودة منه.`))) return;
      try { await engine.deleteSource(n.dataset.delSrc); toast("حُذف المصدر"); rerender(); }
      catch (e) { toast(e.message, true); }
    }));
  b.querySelectorAll("[data-scan-src]").forEach((n) =>
    n.addEventListener("click", () => runScan(rerender, n.dataset.scanSrc)));

  $("#ri-analyze-all", b)?.addEventListener("click", () => analyzeAll(rerender));
  $("#rep-save", b)?.addEventListener("click", async () => {
    try { const r = await engine.saveWeeklyReport(); toast(`حُفظ تقرير الأسبوع (${r.total} مستجد)`); rerender(); }
    catch (e) { toast(e.message, true); }
  });
}

// ---------- تشغيل الفحص ----------
async function runScan(rerender, sourceId = null) {
  const ov = modal(`<h2>⟳ تشغيل الفحص التنظيمي</h2><div id="scan-log">${spinnerHtml("جاري الاتصال بخدمة الفحص…")}</div>`);
  try {
    const res = await engine.requestScan({ sourceId });
    $("#scan-log", ov).innerHTML = `
      <p class="lvl lvl-good"><span class="dot"></span>اكتمل الفحص</p>
      <div class="detail-grid">
        <div><span class="muted">مصادر مفحوصة</span><br/><strong>${res.sourcesScanned || 0}</strong></div>
        <div><span class="muted">عناصر مقروءة</span><br/><strong>${res.itemsFound || 0}</strong></div>
        <div><span class="muted">مستجدات جديدة</span><br/><strong>${res.created || 0}</strong></div>
        <div><span class="muted">حُلّلت آلياً</span><br/><strong>${res.analyzed || 0}</strong></div>
      </div>
      ${res.errors?.length ? `<p class="lvl lvl-critical"><span class="dot"></span>${res.errors.length} مصدر فشل فحصه</p>
        <ul>${res.errors.map((e) => `<li>${esc(e.source)}: ${esc(e.error)}</li>`).join("")}</ul>` : ""}
      <div class="row" style="margin-top:12px"><button class="secondary" id="scan-close">إغلاق</button></div>`;
    $("#scan-close", ov).onclick = () => { ov.remove(); rerender(); };
  } catch (e) {
    $("#scan-log", ov).innerHTML = `
      <p class="lvl lvl-critical"><span class="dot"></span>${esc(e.message)}</p>
      <p class="muted">يمكنك دائماً تسجيل المستجدات يدوياً عبر «＋ مستجد يدوي» وتحليلها واعتمادها من المتصفح.</p>
      <div class="row" style="margin-top:12px"><button class="secondary" id="scan-close">إغلاق</button></div>`;
    $("#scan-close", ov).onclick = () => ov.remove();
  }
}

// ---------- تحليل الكل ----------
async function analyzeAll(rerender) {
  const pending = store.regUpdates.filter((u) => u.status === "DETECTED");
  if (!pending.length) return toast("لا توجد مستجدات بحاجة إلى تحليل");
  const ov = modal(`<h2>🤖 تحليل المستجدات</h2><div id="an-log">${spinnerHtml("بدء التحليل…")}</div>`);
  let done = 0, failed = 0;
  for (const u of pending) {
    $("#an-log", ov).innerHTML = spinnerHtml(`تحليل ${u.code} (${done + failed + 1} من ${pending.length})…`);
    try { await engine.analyzeUpdate(u, (m) => { $("#an-log", ov).innerHTML = spinnerHtml(`${u.code}: ${m}`); }); done++; }
    catch (e) { console.warn("analyze failed", e); failed++; }
  }
  ov.remove();
  toast(`اكتمل التحليل: ${done} مستجد${failed ? ` — تعذّر تحليل ${failed}` : ""}`, failed > 0);
  rerender();
}

// ---------- نموذج المصدر ----------
function openSourceForm(src, done) {
  const isNew = !src;
  const ov = modal(`
    <h2>${isNew ? "إضافة مصدر رصد" : `تعديل ${esc(src.name)}`}</h2>
    <div class="form-grid">
      ${fld("اسم المصدر *", txt("s-name", src?.name, "مثال: الهيئة العامة للغذاء والدواء — الأخبار"))}
      ${fld("نوع المصدر", sel("s-type", REG_SOURCE_TYPES, src?.type || "RSS"))}
      ${fld("رابط المصدر (HTTPS)", txt("s-url", src?.url, "https://example.gov.sa/rss"))}
      ${fld("القطاع", sel("s-sector", DOC_SECTORS, src?.sector || "", { empty: "— اختر —" }))}
      ${fld("الجهة المصدرة", sel("s-auth", authOptions(), src?.authorityId || "", { empty: "— اختر —" }))}
      ${fld("نمط تصفية الروابط (للصفحات)", txt("s-pattern", src?.linkPattern, "مثال: news|regulation|لائحة"))}
    </div>
    ${fld("ملاحظات", area("s-notes", src?.notes, "", 2))}
    <div class="chk-line"><label><input type="checkbox" id="s-active" ${src?.active !== false ? "checked" : ""} /> مصدر مفعّل يُفحص أسبوعياً</label></div>
    <p class="muted">HTTPS فقط، ولا يُقبل أي عنوان يشير إلى شبكة داخلية أو يتضمّن بيانات دخول.</p>
    <div class="row" style="margin-top:14px">
      <button id="s-save">حفظ</button>
      <button class="secondary" id="s-cancel">إلغاء</button>
    </div>`, { wide: true });
  $("#s-cancel", ov).onclick = () => ov.remove();
  $("#s-save", ov).onclick = async () => {
    try {
      await engine.saveSource({
        name: val("s-name", ov),
        type: val("s-type", ov),
        url: val("s-url", ov),
        sector: val("s-sector", ov),
        authorityId: val("s-auth", ov) || null,
        linkPattern: val("s-pattern", ov),
        notes: val("s-notes", ov),
        active: $("#s-active", ov).checked,
      }, src?.id || null);
      ov.remove();
      toast("حُفظ المصدر");
      done();
    } catch (e) { toast(e.message, true); }
  };
}

// ---------- نموذج المستجد اليدوي ----------
function openManualForm(done) {
  const ov = modal(`
    <h2>＋ تسجيل مستجد تنظيمي يدوياً</h2>
    <p class="muted">استخدم هذا النموذج لتسجيل نظام أو لائحة أو تعميم وصلك خارج المصادر المرصودة — ثم حلّله واعتمده بنفس المسار.</p>
    <div class="form-grid">
      ${fld("عنوان المستجد *", txt("m-title", "", "مثال: تعديل لائحة المنشآت الصحية الخاصة"))}
      ${fld("الجهة المصدرة", sel("m-auth", authOptions(), "", { empty: "— اختر —" }))}
      ${fld("رابط المصدر", txt("m-url", "", "https://…"))}
      ${fld("تاريخ النشر", dateInp("m-pub", ""))}
    </div>
    ${fld("نص المستجد / ملخّصه *", area("m-text", "", "الصق نص التعميم أو اللائحة أو ملخّصاً وافياً…", 8))}
    <div class="row" style="margin-top:14px">
      <button id="m-save">حفظ وتحليل</button>
      <button class="secondary" id="m-save-only">حفظ فقط</button>
      <button class="secondary" id="m-cancel">إلغاء</button>
    </div>`, { wide: true });
  $("#m-cancel", ov).onclick = () => ov.remove();

  const save = async (analyze) => {
    const title = val("m-title", ov);
    const text = val("m-text", ov);
    if (!title) return toast("عنوان المستجد إلزامي", true);
    if (!text) return toast("نص المستجد أو ملخّصه إلزامي", true);
    const url = val("m-url", ov);
    if (url) {
      const { validateSourceUrl } = await import("../regintel-core.js");
      const check = validateSourceUrl(url);
      if (!check.ok) return toast(`الرابط غير مقبول: ${check.reason}`, true);
    }
    try {
      const { created, update } = await engine.ingestUpdate(
        {
          title, url,
          summary: text,
          publishedAt: isoFromInput(val("m-pub", ov)),
          externalId: null,
          authorityId: val("m-auth", ov) || null,
        },
        { sourceId: null, sourceName: "إدخال يدوي", trigger: "MANUAL" }
      );
      await reload("regUpdates");
      if (!created) { ov.remove(); toast("هذا المستجد مسجَّل مسبقاً"); return done(); }
      if (!analyze) { ov.remove(); toast(`سُجّل المستجد ${update.code}`); return done(); }
      const box = $("#m-text", ov).parentElement;
      box.innerHTML = spinnerHtml("جاري التحليل…");
      await engine.analyzeUpdate(update, (m) => { box.innerHTML = spinnerHtml(m); });
      ov.remove();
      toast(`سُجّل وحُلّل المستجد ${update.code}`);
      done();
    } catch (e) { toast(e.message, true); }
  };
  $("#m-save", ov).onclick = () => save(true);
  $("#m-save-only", ov).onclick = () => save(false);
}

// ---------- الإعدادات ----------
async function openConfig() {
  const cfg = await engine.loadConfig();
  const ov = modal(`
    <h2>⚙ إعدادات الرصد التنظيمي</h2>
    ${fld("سياق المنشأة (يُمرَّر للذكاء الاصطناعي لتقدير الانطباق)", area("c-org", cfg.orgContext, "", 5))}
    <div class="chk-line"><label><input type="checkbox" id="c-auto" ${cfg.autoAnalyze !== false ? "checked" : ""} /> تحليل المستجدات آلياً فور رصدها في الخادم</label></div>
    <div class="chk-line"><label><input type="checkbox" id="c-mail" ${cfg.weeklyEmail !== false ? "checked" : ""} /> إرسال التقرير الأسبوعي بالبريد لمديري الالتزام</label></div>
    ${fld("أقصى عدد عناصر تُقرأ من كل مصدر في الفحص الواحد", `<input type="number" id="c-max" min="5" max="100" value="${Number(cfg.maxItemsPerSource) || 25}" />`)}
    <p class="muted">مفتاح Claude API للتحليل داخل المتصفح يُضبط من زر ⚙ في الشريط الجانبي (يُحفظ في متصفحك وحدك).
      أما تحليل الخادم فيستخدم سر <code>ANTHROPIC_API_KEY</code> المضبوط في Firebase — ولا يظهر أبداً في المتصفح.</p>
    <div class="row" style="margin-top:14px">
      <button id="c-save">حفظ</button>
      <button class="secondary" id="c-cancel">إلغاء</button>
    </div>`, { wide: true });
  $("#c-cancel", ov).onclick = () => ov.remove();
  $("#c-save", ov).onclick = async () => {
    try {
      await engine.saveConfig({
        orgContext: val("c-org", ov),
        autoAnalyze: $("#c-auto", ov).checked,
        weeklyEmail: $("#c-mail", ov).checked,
        maxItemsPerSource: Math.min(100, Math.max(5, Number(val("c-max", ov)) || 25)),
      });
      await db.audit("UPDATE", "AppConfig", "regintel", "تحديث إعدادات الرصد التنظيمي");
      ov.remove();
      toast("حُفظت الإعدادات");
    } catch (e) { toast(e.message, true); }
  };
}

// ---------- تفاصيل المستجد ----------
export function openDetail(id, nav, done) {
  const u = upd(id);
  if (!u) return;
  const editable = canEdit(store.user);
  const approver = canApprove(store.user);
  const a = u.analysis || {};
  const g = u.generated || {};
  const reqs = store.requirements.filter((r) => r.regUpdateId === u.id);
  const risks = store.risks.filter((r) => r.regUpdateId === u.id);
  const mons = store.monitoring.filter((m) => m.regUpdateId === u.id);
  const finds = store.findings.filter((f) => f.regUpdateId === u.id);
  const plans = store.planItems.filter((p) => p.regUpdateId === u.id);
  const asmts = store.assessments.filter((x) => x.regUpdateId === u.id);
  const change = store.regChanges.find((c) => c.id === u.regChangeId || c.regUpdateId === u.id);
  const depts = [...new Set(reqs.map((r) => r.ownerDeptId).filter(Boolean))];

  const linkList = (title, items, view) =>
    items.length
      ? `<h3 style="margin:12px 0 6px">${title} (${items.length})</h3>
         <div class="link-list">${items.slice(0, 25).map((x) => `<div class="link-item" data-goto="${view}">
           <strong>${esc(x.code || x.id.slice(0, 8))}</strong> ${esc(String(x.title || x.name || "").slice(0, 90))}</div>`).join("")}</div>`
      : "";

  const ov = modal(`
    <div class="row" style="justify-content:space-between">
      <h2>🛰 ${esc(u.code)} — ${esc(String(u.title).slice(0, 120))}</h2>
      <span>${statusBadgeFrom(REG_UPDATE_STATUS, u.status, REG_UPDATE_ROLE)}</span>
    </div>
    <div class="detail-grid">
      <div><span class="muted">المصدر</span><br/>${esc(u.sourceName || sourceName(u.sourceId))}</div>
      <div><span class="muted">تاريخ النشر</span><br/>${fmtDate(u.publishedAt)}</div>
      <div><span class="muted">تاريخ الرصد</span><br/>${fmtDateTime(u.detectedAt)}</div>
      <div><span class="muted">الانطباق</span><br/>${statusBadgeFrom(REG_APPLICABILITY, u.applicability || "UNKNOWN", REG_APPLICABILITY_ROLE)}</div>
      <div><span class="muted">الأثر</span><br/>${statusBadgeFrom(REG_IMPACT, u.impact || "LOW", REG_IMPACT_ROLE)}</div>
      <div><span class="muted">طريقة التحليل</span><br/>${esc(REG_ANALYSIS_METHOD[u.analysisMethod] || "لم يُحلَّل بعد")}</div>
    </div>
    ${u.url ? `<p>🔗 <a href="${esc(u.url)}" target="_blank" rel="noopener noreferrer">فتح المصدر الأصلي</a></p>` : ""}
    ${u.analysisError ? `<p class="lvl lvl-warning"><span class="dot"></span>${esc(u.analysisError)}</p>` : ""}

    ${a.summary ? `<h3 style="margin:12px 0 6px">الملخّص التنفيذي</h3><p class="pre-line">${esc(a.summary)}</p>` : ""}
    ${a.applicabilityRationale ? `<p class="muted pre-line"><strong>مبرر الانطباق:</strong> ${esc(a.applicabilityRationale)}</p>` : ""}
    ${a.isRegulatory === false ? '<p class="lvl lvl-warning"><span class="dot"></span>لم يُصنَّف هذا المحتوى كمستجد تنظيمي — راجعه قبل الاعتماد</p>' : ""}

    ${(a.obligations || []).length ? `<h3 style="margin:12px 0 6px">الالتزامات المقترحة (${a.obligations.length})</h3>
      <div style="overflow-x:auto"><table>
        <thead><tr><th>الالتزام</th><th>الإدارة</th><th>الأهمية</th><th>الاستحقاق</th><th>الدليل</th><th>فجوة</th></tr></thead>
        <tbody>${a.obligations.map((o) => `<tr>
          <td><strong>${esc(o.title)}</strong><div class="muted clamp">${esc(o.description || "")}</div></td>
          <td>${esc(o.ownerDepartment || "—")}</td>
          <td>${esc(CRITICALITY[o.criticality] || o.criticality || "—")}</td>
          <td>${esc(o.dueDate || "—")}</td>
          <td class="muted clamp">${esc(o.evidenceNeeded || "—")}</td>
          <td>${o.gapExpected ? '<span class="lvl lvl-critical"><span class="dot"></span>متوقعة</span>' : '<span class="muted">—</span>'}</td>
        </tr>`).join("")}</tbody>
      </table></div>` : ""}

    ${(a.risks || []).length ? `<h3 style="margin:12px 0 6px">المخاطر المقترحة (${a.risks.length})</h3>
      <div class="link-list">${a.risks.map((r) => `<div class="link-item">
        <strong>${esc(r.title)}</strong> <span class="muted">احتمالية ${esc(r.likelihood)} × أثر ${esc(r.impact)}</span>
        ${(r.controls || []).length ? `<div class="muted">ضوابط مقترحة: ${esc(r.controls.map((c) => `${c.name} (${c.type})`).join(" · "))}</div>` : ""}
      </div>`).join("")}</div>` : ""}

    ${(u.deadlines || []).length ? `<h3 style="margin:12px 0 6px">المواعيد التنظيمية</h3>
      <div class="link-list">${u.deadlines.map((d) => `<div class="link-item"><strong>${esc(d.date)}</strong> — ${esc(d.label || "")}</div>`).join("")}</div>` : ""}

    ${(a.recommendedActions || []).length ? `<h3 style="margin:12px 0 6px">الإجراءات الموصى بها</h3>
      <ul>${a.recommendedActions.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}

    ${u.status === "APPROVED" ? `
      <h3 style="margin:14px 0 6px">🔗 السجلات المرتبطة في وحدات النظام</h3>
      <p class="muted">اعتُمد بواسطة ${esc(u.reviewedByName || "—")} في ${fmtDateTime(u.reviewedAt)}</p>
      ${change ? `<div class="link-list"><div class="link-item" data-goto="regchange"><strong>${esc(change.code)}</strong> سجل التغيّر التنظيمي</div></div>` : ""}
      ${linkList("📖 الالتزامات في مكتبة الالتزام", reqs, "library")}
      ${linkList("⚠️ المخاطر المرتبطة", risks, "risks")}
      ${linkList("🔍 أنشطة المراقبة", mons, "monitoring")}
      ${linkList("🛠 الفجوات وخطط التصحيح", finds, "findings")}
      ${plans.length ? `<h3 style="margin:12px 0 6px">📅 مبادرات الخطة السنوية (${plans.length})</h3>
        <div class="link-list">${plans.map((p) => `<div class="link-item" data-goto="plan"><strong>${esc(String(p.title).slice(0, 90))}</strong></div>`).join("")}</div>` : ""}
      ${asmts.length ? `<h3 style="margin:12px 0 6px">📋 نماذج الفحص الذاتي (${asmts.length})</h3>
        <div class="link-list">${asmts.map((x) => `<div class="link-item" data-goto="assessments"><strong>${esc(x.title)}</strong></div>`).join("")}</div>` : ""}
      ${depts.length ? `<p class="muted">الإدارات المعنية: ${depts.map((d) => esc(deptName(d))).join(" · ")}</p>` : ""}
    ` : ""}

    ${u.reviewNotes ? `<p class="muted pre-line"><strong>ملاحظات المراجعة:</strong> ${esc(u.reviewNotes)}</p>` : ""}

    <div class="row" style="margin-top:16px">
      ${editable && u.status !== "APPROVED" ? '<button class="secondary" id="u-analyze" title="تحليل المستجد بالذكاء الاصطناعي (أو تحليل نصي عند غياب المفتاح)">🤖 تحليل / إعادة تحليل</button>' : ""}
      ${approver && ["DETECTED", "ANALYZED"].includes(u.status) ? '<button id="u-approve" title="اعتماد المستجد ودمجه في مكتبة الالتزام والمخاطر والمراقبة والخطة">✅ اعتماد ودمج</button>' : ""}
      ${approver && ["DETECTED", "ANALYZED"].includes(u.status) ? '<button class="secondary" id="u-reject" title="استبعاد المستجد لعدم انطباقه">✕ استبعاد</button>' : ""}
      ${editable && u.status !== "ARCHIVED" ? '<button class="secondary" id="u-archive" title="أرشفة السجل دون حذفه">🗄 أرشفة</button>' : ""}
      ${approver ? '<button class="danger" id="u-del" title="حذف سجل المستجد نهائياً (لا يحذف السجلات المولّدة)">حذف</button>' : ""}
      <button class="secondary" id="u-close">إغلاق</button>
    </div>`, { wide: true });

  $("#u-close", ov).onclick = () => ov.remove();
  ov.querySelectorAll("[data-goto]").forEach((n) => n.addEventListener("click", () => { ov.remove(); nav(n.dataset.goto); }));

  $("#u-analyze", ov)?.addEventListener("click", async () => {
    const btn = $("#u-analyze", ov);
    btn.disabled = true;
    const orig = btn.textContent;
    try {
      await engine.analyzeUpdate(u, (m) => { btn.textContent = m.slice(0, 40); });
      ov.remove();
      toast("اكتمل التحليل");
      done();
    } catch (e) { btn.disabled = false; btn.textContent = orig; toast(e.message, true); }
  });

  $("#u-approve", ov)?.addEventListener("click", () => { ov.remove(); openApprove(u, done); });

  $("#u-reject", ov)?.addEventListener("click", async () => {
    ov.remove();
    const rv = modal(`
      <h2>✕ استبعاد المستجد ${esc(u.code)}</h2>
      ${fld("سبب الاستبعاد", area("r-reason", "", "مثال: لا ينطبق على نشاط المنشأة…", 3))}
      <div class="row" style="margin-top:14px"><button class="danger" id="r-go">استبعاد</button><button class="secondary" id="r-no">إلغاء</button></div>`);
    $("#r-no", rv).onclick = () => rv.remove();
    $("#r-go", rv).onclick = async () => {
      try { await engine.rejectUpdate(u, val("r-reason", rv)); rv.remove(); toast("استُبعد المستجد"); done(); }
      catch (e) { toast(e.message, true); }
    };
  });

  $("#u-archive", ov)?.addEventListener("click", async () => {
    try { await engine.archiveUpdate(u); ov.remove(); toast("أُرشف المستجد"); done(); }
    catch (e) { toast(e.message, true); }
  });

  $("#u-del", ov)?.addEventListener("click", async () => {
    ov.remove();
    if (!(await confirmBox(`حذف سجل المستجد ${u.code}؟ السجلات المولّدة في الوحدات الأخرى لن تُحذف.`))) return;
    try {
      await db.removeRow("regUpdates", u.id);
      await db.audit("DELETE", "RegUpdate", u.code, `حذف سجل المستجد التنظيمي ${u.code}`);
      await reload("regUpdates");
      toast("حُذف السجل");
      done();
    } catch (e) { toast(e.message, true); }
  });
}

// ---------- نافذة الاعتماد والدمج ----------
function openApprove(u, done) {
  const a = u.analysis || {};
  const obligations = a.obligations || [];
  const ov = modal(`
    <h2>✅ اعتماد ودمج المستجد ${esc(u.code)}</h2>
    <p class="muted">سيُنشئ النظام السجلات التالية في وحداته القائمة ويربطها ببعضها وبهذا المستجد:</p>
    <ul>
      <li>سجل في <strong>سجل التغيّر التنظيمي</strong> مع المتطلبات المتأثرة</li>
      <li><strong>${obligations.length}</strong> التزام في <strong>مكتبة الالتزام</strong></li>
      <li>خطر مرتبط بضوابطه في <strong>سجل المخاطر</strong> لكل التزام</li>
      <li>نشاط مراقبة لكل التزام في <strong>برنامج المراقبة</strong> (اختياري)</li>
      <li>مبادرة متابعة في <strong>الخطة السنوية</strong> (اختياري)</li>
      <li>ملاحظة وخطة تصحيح لكل التزام ذي فجوة متوقعة (${obligations.filter((o) => o.gapExpected).length})</li>
    </ul>
    ${!obligations.length ? '<p class="lvl lvl-warning"><span class="dot"></span>لا توجد التزامات مشتقة — سيُسجَّل التغيّر التنظيمي فقط. شغّل التحليل أولاً لاشتقاق الالتزامات.</p>' : ""}
    <div class="form-grid">
      ${fld("الإدارة المسؤولة (للمبادرة والفحص الذاتي)", sel("ap-dept", deptOptions(), "", { empty: "— تُشتق من الالتزامات —" }))}
    </div>
    <div class="chk-line"><label><input type="checkbox" id="ap-mon" checked /> إنشاء أنشطة مراقبة للتحقق من التطبيق</label></div>
    <div class="chk-line"><label><input type="checkbox" id="ap-plan" checked /> إضافة مبادرة إلى الخطة السنوية</label></div>
    <div class="chk-line"><label><input type="checkbox" id="ap-asmt" /> إرسال نموذج فحص ذاتي للإدارة المعنية</label></div>
    ${fld("ملاحظات الاعتماد", area("ap-notes", "", "", 2))}
    <div id="ap-log"></div>
    <div class="row" style="margin-top:14px">
      <button id="ap-go">اعتماد ودمج</button>
      <button class="secondary" id="ap-cancel">إلغاء</button>
    </div>`, { wide: true });
  $("#ap-cancel", ov).onclick = () => ov.remove();
  $("#ap-go", ov).onclick = async () => {
    const btn = $("#ap-go", ov);
    btn.disabled = true;
    const log = $("#ap-log", ov);
    try {
      const g = await engine.approveUpdate(u, {
        deptId: val("ap-dept", ov) || null,
        createMonitoring: $("#ap-mon", ov).checked,
        createPlanItem: $("#ap-plan", ov).checked,
        createAssessment: $("#ap-asmt", ov).checked,
        notes: val("ap-notes", ov),
      }, (m) => { log.innerHTML = spinnerHtml(m); });
      ov.remove();
      toast(`اعتُمد ودُمج: ${g.requirementIds.length} التزام · ${g.riskIds.length} خطر · ${g.monitoringIds.length} مراقبة · ${g.findingIds.length} فجوة`);
      done();
    } catch (e) {
      btn.disabled = false;
      log.innerHTML = `<p class="lvl lvl-critical"><span class="dot"></span>${esc(e.message)}</p>`;
    }
  };
}
