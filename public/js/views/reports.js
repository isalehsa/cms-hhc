// التقارير — ملخص تنفيذي ومؤشرات وجداول، تصدير Excel / PDF (طباعة) / Word
import { store, deptName, authName, userName, reqLabel, clusterWave } from "../state.js";
import * as db from "../db.js";
import { esc, toast, fmtDate, donutChart, groupedBarChart } from "../ui.js";
import {
  riskLevel, CRITICALITY, REQ_TYPES, REQ_CATEGORIES, REQ_STATUS,
  RISK_STATUS, MON_TYPES, MON_FREQ, MON_STATUS, MON_RESULT, NC_LEVELS,
  PLAN_STATUS, PLAN_SOURCES, PLAN_TYPES, SA_STATUS, SA_ANSWERS, FND_SEVERITY, FND_STATUS, FND_SOURCES,
  COR_DIRECTION, COR_PRIORITY, COR_STATUS, DISCLOSURE_TYPES, DISCLOSURE_STATUS, TRAINING_TYPES, TRAINING_STATUS,
  MATURITY_MODEL, MATURITY_STATUS, maturityLevel, CLUSTER_WAVES, CLUSTER_WAVE_ORDER,
} from "../meta.js";

const waveShort = (clusterId) => clusterWave(clusterId)?.short || "غير مصنّف";

// ---------- تعريف التقارير ----------
const REPORTS = [
  { key: "executive", icon: "🏛", title: "تقرير الالتزام التنفيذي", desc: "ملخص شامل لمجلس الإدارة والإدارة التنفيذية: المؤشرات، أبرز المخاطر، التوصيات" },
  { key: "requirements", icon: "📖", title: "تقرير المتطلبات التنظيمية", desc: "مكتبة الالتزام كاملة بحالاتها وتواريخ مراجعتها" },
  { key: "risks", icon: "⚠", title: "تقرير سجل المخاطر", desc: "المخاطر بتقييمها قبل الضوابط وبعدها وخطط معالجتها" },
  { key: "monitoring", icon: "🔍", title: "تقرير برنامج المراقبة", desc: "الأنشطة الرقابية ونتائجها وتوصياتها" },
  { key: "assessments", icon: "📋", title: "تقرير الفحص الذاتي", desc: "نتائج الفحوصات الذاتية للإدارات وإجاباتها" },
  { key: "plan", icon: "📅", title: "تقرير الخطة السنوية", desc: "مبادرات الخطة ونسب إنجازها" },
  { key: "findings", icon: "🛠", title: "تقرير الملاحظات وخطط التصحيح", desc: "الملاحظات المفتوحة والمغلقة وتقدم الإجراءات التصحيحية" },
  { key: "correspondence", icon: "📨", title: "تقرير سجل المراسلات", desc: "المراسلات الواردة والصادرة مع الجهات وحالات الرد عليها" },
  { key: "disclosures", icon: "🗂", title: "تقرير سجل الإفصاحات", desc: "إفصاحات تعارض المصالح والهدايا والإفصاحات المالية وقرارات معالجتها" },
  { key: "training", icon: "🎓", title: "تقرير التدريب والتوعية", desc: "برامج التدريب وحملات التوعية وأعداد المتدربين ونسب الإنجاز" },
  { key: "maturity", icon: "📊", title: "تقرير نضج التجمعات الصحية", desc: "نتائج تقييم نضج الالتزام بالتجمعات حسب المحاور والمستوى" },
];

export function renderReports(el) {
  const k = kpis();
  const monPct = store.monitoring.length ? Math.round((k.monDone / store.monitoring.length) * 100) : 0;
  const strip = [
    { v: k.activeReqs.length, l: "متطلب نشط", c: C.primary },
    { v: store.risks.length, l: "خطر مسجل", c: "#2a78d6" },
    { v: k.riskCounts.CRITICAL + k.riskCounts.HIGH, l: "مخاطر عالية فأكثر", c: (k.riskCounts.CRITICAL + k.riskCounts.HIGH) ? C.critical : C.good },
    { v: monPct + "%", l: "إنجاز المراقبة", c: monPct >= 70 ? C.good : monPct >= 40 ? C.warning : C.critical },
    { v: k.openFnd.length, l: "ملاحظة مفتوحة", c: k.openFnd.length ? C.warning : C.good },
    { v: k.planAvg + "%", l: "إنجاز الخطة", c: k.planAvg >= 70 ? C.good : k.planAvg >= 40 ? C.warning : C.critical },
  ];
  el.innerHTML = `
    <div class="page-head"><h1>📊 التقارير</h1><p class="muted">لوحات ومؤشرات لحظية — اعرض التقرير أو صدّره PDF أو عرضاً تقديمياً أو Excel أو Word</p></div>
    <section class="card">
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px">
        ${strip.map((s) => `<div style="text-align:center;padding:8px 6px;border-left:1px solid rgba(120,130,125,.12)">
          <div style="font-size:1.8rem;font-weight:800;color:${s.c};line-height:1.1">${esc(String(s.v))}</div>
          <div class="muted" style="font-size:.74rem;margin-top:2px">${esc(s.l)}</div></div>`).join("")}
      </div>
    </section>
    <div class="report-grid">
      ${REPORTS.map((r) => {
        const st = cardStat(r.key);
        const tc = TONE_CARD[st.tone] || C.primary;
        return `<div class="card report-card" style="border-top:4px solid ${tc}">
          <div class="row" style="justify-content:space-between;align-items:flex-start;gap:8px">
            <h2 style="margin:0;font-size:1.05rem">${r.icon} ${esc(r.title)}</h2>
            <div style="text-align:center;min-width:60px;flex-shrink:0">
              <div style="font-size:1.5rem;font-weight:800;color:${tc};line-height:1">${esc(String(st.value))}</div>
              <div class="muted" style="font-size:.64rem">${esc(st.label)}</div>
            </div>
          </div>
          <p class="muted" style="min-height:2.4em">${esc(r.desc)}</p>
          <div class="row" style="flex-wrap:wrap;gap:6px">
            <button class="small" data-view="${r.key}">👁 عرض / PDF</button>
            <button class="secondary small" data-pptx="${r.key}">📊 عرض تقديمي</button>
            <button class="secondary small" data-xlsx="${r.key}">⬇ Excel</button>
            <button class="secondary small" data-doc="${r.key}">⬇ Word</button>
          </div>
        </div>`;
      }).join("")}
    </div>`;

  el.querySelectorAll("[data-view]").forEach((b) => (b.onclick = () => viewReport(b.dataset.view)));
  el.querySelectorAll("[data-pptx]").forEach((b) => (b.onclick = () => exportPptx(b.dataset.pptx).catch((e) => toast(e.message, true))));
  el.querySelectorAll("[data-xlsx]").forEach((b) => (b.onclick = () => exportExcel(b.dataset.xlsx).catch((e) => toast(e.message, true))));
  el.querySelectorAll("[data-doc]").forEach((b) => (b.onclick = () => exportWord(b.dataset.doc).catch((e) => toast(e.message, true))));
}

// ---------- بناء بيانات التقارير (رؤوس + صفوف) ----------
function tableFor(key) {
  const lvl = (r) => riskLevel(r.residualLikelihood ?? r.likelihood, r.residualImpact ?? r.impact);
  switch (key) {
    case "requirements":
      return {
        head: ["الرمز", "المتطلب", "الجهة", "النوع", "التصنيف", "الأهمية", "الإدارة المالكة", "الإصدار", "المراجعة القادمة", "الحالة"],
        rows: store.requirements.map((r) => [
          r.code, r.title, authName(r.authorityId), REQ_TYPES[r.type] || r.type, REQ_CATEGORIES[r.category] || r.category,
          CRITICALITY[r.criticality] || r.criticality, deptName(r.ownerDeptId), fmtDate(r.issueDate), fmtDate(r.nextReviewDate), REQ_STATUS[r.status] || r.status,
        ]),
      };
    case "risks":
      return {
        head: ["الرقم", "الخطر", "المتطلب", "الاحتمالية", "الأثر", "قبل الضوابط", "بعد الضوابط", "الضوابط", "الإدارة", "مالك المعالجة", "خطة المعالجة", "KRI", "الاستحقاق", "الحالة"],
        rows: store.risks.map((r) => {
          const pre = riskLevel(r.likelihood, r.impact);
          const post = lvl(r);
          return [
            r.code, r.title, reqLabel(r.requirementId), r.likelihood, r.impact,
            `${pre.label} (${pre.score})`, `${post.label} (${post.score})`,
            (r.controls || []).map((c) => c.name).join(" | "),
            deptName(r.ownerDeptId), userName(r.treatmentOwnerId), r.treatmentPlan || "", r.kri || "",
            fmtDate(r.dueDate), RISK_STATUS[r.status] || r.status,
          ];
        }),
      };
    case "monitoring":
      return {
        head: ["الرقم", "النشاط", "المتطلب", "النوع", "التكرار", "الإدارة المستهدفة", "المسؤول", "البداية", "النهاية", "النتيجة", "مستوى عدم الالتزام", "الملاحظات", "التوصيات", "الحالة"],
        rows: store.monitoring.map((m) => [
          m.code, m.name, reqLabel(m.requirementId), MON_TYPES[m.type] || m.type, MON_FREQ[m.frequency] || m.frequency,
          deptName(m.targetDeptId), userName(m.assigneeId), fmtDate(m.startDate), fmtDate(m.endDate),
          MON_RESULT[m.result] || "—", NC_LEVELS[m.nonComplianceLevel] || "—", m.notes || "", m.recommendations || "", MON_STATUS[m.status] || m.status,
        ]),
      };
    case "assessments": {
      const rows = [];
      for (const a of store.assessments) {
        for (const q of a.questions || []) {
          rows.push([
            a.title, deptName(a.departmentId), a.period || "", SA_STATUS[a.status] || a.status,
            q.text, reqLabel(q.requirementId), SA_ANSWERS[q.response?.answer] || "—",
            q.response?.comment || "", a.reviewNotes || "",
          ]);
        }
      }
      return { head: ["الفحص", "الإدارة", "الفترة", "الحالة", "السؤال", "المتطلب", "الإجابة", "تعليق الإدارة", "ملاحظات المراجعة"], rows };
    }
    case "plan":
      return {
        head: ["المبادرة", "السنة", "الربع", "المصدر", "الإدارة", "المسؤول", "المخرجات المتوقعة", "الإنجاز %", "الحالة"],
        rows: store.planItems.map((p) => [
          p.title, p.year || "", p.quarter ? `الربع ${p.quarter}` : "", PLAN_SOURCES[p.source] || p.source,
          deptName(p.departmentId), userName(p.ownerId), p.expectedOutput || "", p.progress || 0, PLAN_STATUS[p.status] || p.status,
        ]),
      };
    case "findings":
      return {
        head: ["الرقم", "الملاحظة", "المصدر", "الخطورة", "الإدارة", "المتطلب", "الاستحقاق", "الإجراءات التصحيحية", "متوسط التقدم %", "الحالة"],
        rows: store.findings.map((f) => [
          f.code, f.title, FND_SOURCES[f.source] || f.source, FND_SEVERITY[f.severity] || f.severity,
          deptName(f.departmentId), reqLabel(f.requirementId), fmtDate(f.dueDate),
          (f.actions || []).map((a) => `${a.description} (${a.progress || 0}%)`).join(" | "),
          (f.actions || []).length ? Math.round(f.actions.reduce((s, a) => s + (a.progress || 0), 0) / f.actions.length) : 0,
          FND_STATUS[f.status] || f.status,
        ]),
      };
    case "correspondence":
      return {
        head: ["الرقم", "الموضوع", "الاتجاه", "الجهة", "الرقم المرجعي", "تاريخ الخطاب", "استحقاق الرد", "الإدارة المعنية", "المسؤول", "المتطلب", "الأولوية", "الرد/الإجراء", "الحالة"],
        rows: store.correspondence.map((c) => [
          c.code, c.subject, COR_DIRECTION[c.direction] || c.direction, authName(c.authorityId), c.refNumber || "",
          fmtDate(c.date), fmtDate(c.dueDate), deptName(c.ownerDeptId), userName(c.assigneeId),
          reqLabel(c.requirementId), COR_PRIORITY[c.priority] || "عادية", c.replyNotes || "", COR_STATUS[c.status] || c.status,
        ]),
      };
    case "disclosures":
      return {
        head: ["الرقم", "النوع", "الموضوع", "المُفصِح", "الإدارة", "التاريخ", "القيمة (ريال)", "الطرف ذو العلاقة", "القرار/الإجراء", "الحالة"],
        rows: store.disclosures.map((d) => [
          d.code, DISCLOSURE_TYPES[d.type] || d.type, d.title, d.discloserName || userName(d.discloserId),
          deptName(d.departmentId), fmtDate(d.date), d.value || "", d.relatedParty || "",
          d.decision || "", DISCLOSURE_STATUS[d.status] || d.status,
        ]),
      };
    case "training":
      return {
        head: ["الرقم", "النوع", "العنوان", "الجمهور", "المتطلب", "المسؤول", "التاريخ", "المستهدفون", "المنجزون", "الإنجاز %", "الحالة"],
        rows: store.trainings.map((t) => [
          t.code, TRAINING_TYPES[t.type] || t.type, t.title,
          t.audienceType === "all" ? "المنشأة كاملة" : deptName(t.departmentId),
          reqLabel(t.requirementId), userName(t.ownerId), fmtDate(t.date),
          t.targetCount || 0, t.completedCount || 0,
          t.targetCount ? Math.round(((t.completedCount || 0) / t.targetCount) * 100) : 0,
          TRAINING_STATUS[t.status] || t.status,
        ]),
      };
    case "maturity": {
      const critScore = (c, useReview) => (useReview && c.reviewScore != null ? c.reviewScore : (c.selfScore || 0));
      const overall = (m, useReview) => {
        const crits = (m.domains || []).flatMap((d) => d.criteria);
        const max = crits.length * 3;
        return max ? Math.round((crits.reduce((s, c) => s + critScore(c, useReview), 0) / max) * 100) : 0;
      };
      return {
        head: ["الرقم", "التجمع", "الموجة", "الفترة", ...MATURITY_MODEL.map((d) => d.name), "تقييم التجمع %", "بعد المراجعة %", "المستوى", "الحالة"],
        rows: store.maturity.map((m) => {
          const useReview = m.status === "REVIEWED";
          const domCells = MATURITY_MODEL.map((dm) => {
            const dom = (m.domains || []).find((d) => d.name === dm.name);
            if (!dom) return "—";
            const max = dom.criteria.length * 3;
            return max ? Math.round((dom.criteria.reduce((s, c) => s + critScore(c, useReview), 0) / max) * 100) + "%" : "—";
          });
          const self = overall(m, false);
          const reviewed = useReview ? overall(m, true) : null;
          const tot = useReview ? reviewed : self;
          return [
            m.code, deptName(m.clusterId), waveShort(m.clusterId), `ر${m.quarter}/${m.year}`, ...domCells,
            self + "%", reviewed == null ? "— بانتظار المراجعة" : reviewed + "%",
            maturityLevel(tot).label, MATURITY_STATUS[m.status] || m.status,
          ];
        }),
      };
    }
    case "directory":
      return {
        head: ["التجمع", "الاسم", "المسمى", "الجوال", "البريد الإلكتروني", "البريد الرسمي للإدارة", "ملاحظات"],
        rows: store.directory.map((c) => [c.cluster || "", c.name || "", c.title || "", c.mobile || "", c.email || "", c.officialEmail || "", c.comment || ""]),
      };
    default:
      return { head: [], rows: [] };
  }
}

// المؤشرات التنفيذية المشتركة
function kpis() {
  const activeReqs = store.requirements.filter((r) => r.status !== "CANCELLED");
  const riskCounts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
  for (const r of store.risks) riskCounts[riskLevel(r.residualLikelihood ?? r.likelihood, r.residualImpact ?? r.impact).key]++;
  const monDone = store.monitoring.filter((m) => ["COMPLETED", "CLOSED"].includes(m.status)).length;
  const openFnd = store.findings.filter((f) => f.status !== "CLOSED");
  const planYear = store.planItems.filter((p) => p.year === new Date().getFullYear());
  const planAvg = planYear.length ? Math.round(planYear.reduce((s, p) => s + (p.progress || 0), 0) / planYear.length) : 0;
  return { activeReqs, riskCounts, monDone, openFnd, planAvg, planYear };
}

// أبرز المخاطر والتوصيات للملخص التنفيذي
function execHighlights() {
  const top = store.risks
    .map((r) => ({ r, lvl: riskLevel(r.residualLikelihood ?? r.likelihood, r.residualImpact ?? r.impact) }))
    .filter((x) => ["CRITICAL", "HIGH"].includes(x.lvl.key))
    .sort((a, b) => b.lvl.score - a.lvl.score)
    .slice(0, 5);
  const recs = store.monitoring.filter((m) => m.recommendations).slice(0, 5).map((m) => `${m.code}: ${m.recommendations}`);
  return { top, recs };
}

// ---------- مكوّنات بصرية للتقرير (CSS ذاتي الاحتواء للنافذة المطبوعة) ----------
const C = { good: "#0ca30c", warning: "#e6a100", serious: "#ec835a", critical: "#d03b3b", neutral: "#8a8578", primary: "#14705c" };
const KPI_BG = { req: "#14705c", risk: "#2a78d6", good: "#0ca30c", warn: "#e6a100", danger: "#d03b3b" };

function kpiCard(value, label, tone) {
  return `<div class="kpi-card" style="border-top-color:${KPI_BG[tone] || C.primary}">
    <div class="kpi-num" style="color:${KPI_BG[tone] || C.primary}">${esc(value)}</div>
    <div class="kpi-lbl">${esc(label)}</div>
  </div>`;
}

// شريط توزيع أفقي بالقيم نصياً — لكل شريحة لونها وطولها بالنسبة لأكبر قيمة
function repBars(items) {
  const max = Math.max(...items.map((i) => i.count), 1);
  const total = items.reduce((s, i) => s + i.count, 0);
  if (!total) return '<p class="muted">لا توجد بيانات</p>';
  return `<div class="bars">${items
    .map(
      (i) => `<div class="bar-row">
        <span class="bar-lbl">${esc(i.label)}</span>
        <span class="bar-track"><span class="bar-fill" style="width:${Math.max(3, Math.round((i.count / max) * 100))}%;background:${i.color}"></span></span>
        <span class="bar-num">${i.count}</span>
      </div>`
    )
    .join("")}</div>`;
}

const LVL_COLOR = { CRITICAL: C.critical, HIGH: C.serious, MEDIUM: C.warning, LOW: C.good };
function lvlPill(key, label) {
  const c = LVL_COLOR[key] || C.neutral;
  return `<span class="pill" style="background:${c}22;color:${c};border:1px solid ${c}55">${esc(label)}</span>`;
}

// تلوين خلايا الحالة الشائعة في الجداول التفصيلية
const CELL_TONE = {
  "غير ملتزم": C.critical, "مرفوض": C.critical, "متأخر": C.critical, "مفتوحة": C.critical, "مفتوح": C.critical,
  "ملتزم جزئياً": C.warning, "قيد المعالجة": C.warning, "بانتظار المراجعة": C.warning, "قيد المراجعة": C.warning,
  "ملتزم": C.good, "معتمد": C.good, "مغلقة": C.good, "عولج": C.good, "مكتملة": C.good, "معتمد / لا تعارض": C.good, "معالَج بإجراء": C.good, "تم الرد": C.good,
};
function cell(v) {
  const s = String(v ?? "");
  const c = CELL_TONE[s.trim()];
  return c ? `<span class="pill" style="background:${c}22;color:${c};border:1px solid ${c}55">${esc(s)}</span>` : esc(s);
}

// ---------- لوحات بصرية لكل تقرير (داش بورد) — تُشارك بين العرض والعرض التقديمي ----------
const tally = (arr, fn) => { const t = {}; for (const x of arr) { const k = fn(x); if (k != null && k !== "") t[k] = (t[k] || 0) + 1; } return t; };
const mapItems = (map, dict, colorOf) =>
  Object.entries(map).map(([k, count]) => ({ label: (dict && dict[k]) || k, count, color: colorOf ? colorOf(k) : C.primary }));
const chartBox = (title, inner) => `<div class="rep-chart"><h3>${esc(title)}</h3>${inner}</div>`;
const chartsWrap = (...c) => (c.filter(Boolean).length ? `<div class="rep-charts">${c.join("")}</div>` : "");

const TONE_STATUS = { ACTIVE: C.good, UPDATED: "#2a78d6", UNDER_REVIEW: C.warning, CANCELLED: C.neutral };
const TONE_CRIT = { CRITICAL: C.critical, HIGH: C.serious, MEDIUM: C.warning, LOW: C.good };
const TONE_MON_RES = { COMPLIANT: C.good, PARTIAL: C.warning, NON_COMPLIANT: C.critical };
const TONE_MON_ST = { PLANNED: C.neutral, IN_PROGRESS: C.warning, COMPLETED: C.good, CLOSED: "#2a78d6" };
const TONE_SA = { COMPLIANT: C.good, PARTIAL: C.warning, NON_COMPLIANT: C.critical, NA: C.neutral };
const TONE_PLAN = { NOT_STARTED: C.neutral, IN_PROGRESS: C.warning, COMPLETED: C.good, DELAYED: C.critical };
const TONE_FND_ST = { OPEN: C.critical, IN_PROGRESS: C.warning, CLOSED: C.good };
const TONE_COR_ST = { OPEN: C.warning, REPLIED: C.good, CLOSED: "#2a78d6" };
const TONE_DIS_ST = { PENDING: C.warning, UNDER_REVIEW: C.warning, APPROVED: C.good, MITIGATED: C.good, REJECTED: C.critical };
const TONE_TRN_ST = { PLANNED: C.neutral, IN_PROGRESS: C.warning, COMPLETED: C.good, CANCELLED: C.neutral };
const TONE_CARD = { primary: C.primary, danger: C.critical, warn: C.warning, good: C.good };
// لون مستوى النضج (هيكس ليعمل في PDF وExcel والعرض التقديمي)
const matLevelHex = (pct) => ({ good: C.good, warning: C.warning, serious: C.serious, critical: C.critical }[maturityLevel(pct).key]);
const maturityOverall = (m, useRev) => {
  const cs = (m.domains || []).flatMap((d) => d.criteria); const max = cs.length * 3;
  return max ? Math.round((cs.reduce((s, c) => s + ((useRev && c.reviewScore != null) ? c.reviewScore : (c.selfScore || 0)), 0) / max) * 100) : 0;
};

// المواصفات الموحّدة للرسوم: [{ title, items:[{label,count,color}] }]
function distSpecs(key) {
  switch (key) {
    case "executive": {
      const k = kpis();
      const mr = { COMPLIANT: 0, PARTIAL: 0, NON_COMPLIANT: 0 };
      for (const m of store.monitoring) if (m.result && mr[m.result] !== undefined) mr[m.result]++;
      return [
        { title: "توزيع المخاطر (بعد الضوابط)", items: [
          { label: "حرج", count: k.riskCounts.CRITICAL, color: C.critical }, { label: "عالٍ", count: k.riskCounts.HIGH, color: C.serious },
          { label: "متوسط", count: k.riskCounts.MEDIUM, color: C.warning }, { label: "منخفض", count: k.riskCounts.LOW, color: C.good } ] },
        { title: "نتائج أنشطة المراقبة", items: [
          { label: "ملتزم", count: mr.COMPLIANT, color: C.good }, { label: "ملتزم جزئياً", count: mr.PARTIAL, color: C.warning },
          { label: "غير ملتزم", count: mr.NON_COMPLIANT, color: C.critical } ] },
      ];
    }
    case "requirements": {
      const active = store.requirements.filter((r) => r.status !== "CANCELLED");
      return [
        { title: "حسب الحالة", items: mapItems(tally(store.requirements, (r) => r.status), REQ_STATUS, (k) => TONE_STATUS[k] || C.primary) },
        { title: "حسب الأهمية (النشطة)", items: mapItems(tally(active, (r) => r.criticality), CRITICALITY, (k) => TONE_CRIT[k] || C.primary) },
      ];
    }
    case "risks": {
      const rc = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
      for (const r of store.risks) rc[riskLevel(r.residualLikelihood ?? r.likelihood, r.residualImpact ?? r.impact).key]++;
      return [
        { title: "مستوى الخطر (بعد الضوابط)", items: [
          { label: "حرج", count: rc.CRITICAL, color: C.critical }, { label: "عالٍ", count: rc.HIGH, color: C.serious },
          { label: "متوسط", count: rc.MEDIUM, color: C.warning }, { label: "منخفض", count: rc.LOW, color: C.good } ] },
        { title: "حسب الحالة", items: mapItems(tally(store.risks, (r) => r.status), RISK_STATUS, () => "#2a78d6") },
      ];
    }
    case "monitoring":
      return [
        { title: "نتائج الأنشطة المنفذة", items: mapItems(tally(store.monitoring.filter((m) => m.result), (m) => m.result), MON_RESULT, (k) => TONE_MON_RES[k]) },
        { title: "حسب الحالة", items: mapItems(tally(store.monitoring, (m) => m.status), MON_STATUS, (k) => TONE_MON_ST[k] || C.primary) },
      ];
    case "assessments":
      return [{ title: "توزيع إجابات الفحص الذاتي", items: mapItems(tally(store.assessments.flatMap((a) => a.questions || []), (q) => q.response?.answer), SA_ANSWERS, (k) => TONE_SA[k] || C.neutral) }];
    case "plan":
      return [{ title: "مبادرات الخطة حسب الحالة", items: mapItems(tally(store.planItems, (p) => p.status), PLAN_STATUS, (k) => TONE_PLAN[k] || C.primary) }];
    case "findings":
      return [
        { title: "حسب الخطورة", items: mapItems(tally(store.findings, (f) => f.severity), FND_SEVERITY, (k) => TONE_CRIT[k] || C.primary) },
        { title: "حسب الحالة", items: mapItems(tally(store.findings, (f) => f.status), FND_STATUS, (k) => TONE_FND_ST[k] || C.primary) },
      ];
    case "correspondence":
      return [
        { title: "حسب الاتجاه", items: mapItems(tally(store.correspondence, (c) => c.direction), COR_DIRECTION, () => C.primary) },
        { title: "حسب الحالة", items: mapItems(tally(store.correspondence, (c) => c.status), COR_STATUS, (k) => TONE_COR_ST[k] || C.primary) },
      ];
    case "disclosures":
      return [
        { title: "حسب النوع", items: mapItems(tally(store.disclosures, (d) => d.type), DISCLOSURE_TYPES, () => C.primary) },
        { title: "حسب الحالة", items: mapItems(tally(store.disclosures, (d) => d.status), DISCLOSURE_STATUS, (k) => TONE_DIS_ST[k] || C.primary) },
      ];
    case "training":
      return [{ title: "برامج التدريب حسب الحالة", items: mapItems(tally(store.trainings, (t) => t.status), TRAINING_STATUS, (k) => TONE_TRN_ST[k] || C.primary) }];
    case "maturity": {
      const lc = { good: 0, warning: 0, serious: 0, critical: 0 };
      for (const m of store.maturity) lc[maturityLevel(maturityOverall(m, m.status === "REVIEWED")).key]++;
      const rev = store.maturity.filter((m) => m.status === "REVIEWED");
      const avg = (a) => (a.length ? Math.round(a.reduce((s, x) => s + x, 0) / a.length) : 0);
      const avgSelf = avg(store.maturity.map((m) => maturityOverall(m, false)));
      const avgRev = avg(rev.map((m) => maturityOverall(m, true)));
      return [
        { title: "توزيع التجمعات حسب المستوى", items: [
          { label: "رائد", count: lc.good, color: C.good }, { label: "متقدم", count: lc.warning, color: C.warning },
          { label: "نامٍ", count: lc.serious, color: C.serious }, { label: "مبتدئ", count: lc.critical, color: C.critical } ] },
        { title: "متوسط النسب (٪)", bars: true, items: [
          { label: "تقييم التجمعات (ذاتي)", count: avgSelf, color: matLevelHex(avgSelf) },
          { label: "بعد المراجعة", count: avgRev, color: matLevelHex(avgRev) } ] },
      ];
    }
    default:
      return [];
  }
}

function reportCharts(key) {
  const specs = distSpecs(key);
  let html = specs.length ? chartsWrap(...specs.map((s) => chartBox(s.title, s.bars ? repBars(s.items) : donutChart(s.items, { size: 140, unit: "الإجمالي" })))) : "";
  // مقارنة تقييم التجمع (ذاتي) مقابل ما بعد المراجعة لكل تجمع (أحدث تقييم) + متوسط حسب الموجة
  if (key === "maturity") {
    const latest = {};
    for (const m of store.maturity) { const c = m.clusterId; if (!latest[c] || (m.year * 4 + m.quarter) > (latest[c].year * 4 + latest[c].quarter)) latest[c] = m; }
    const items = Object.values(latest).sort((a, b) => maturityOverall(b, b.status === "REVIEWED") - maturityOverall(a, a.status === "REVIEWED"));
    const boxes = [];
    // متوسط النضج حسب الموجة (مقارنة الموجتين)
    const avgOf = (a) => (a.length ? Math.round(a.reduce((s, x) => s + x, 0) / a.length) : 0);
    const grp = {}; CLUSTER_WAVE_ORDER.forEach((k) => (grp[k] = []));
    for (const m of items) grp[clusterWave(m.clusterId)?.key || "PREP"].push(m);
    const wk = CLUSTER_WAVE_ORDER.filter((k) => grp[k].length);
    if (wk.length) {
      boxes.push(chartBox("متوسط النضج حسب الموجة", groupedBarChart(
        wk.map((k) => CLUSTER_WAVES[k].short),
        { name: "تقييم التجمع (ذاتي)", color: "#2a78d6", values: wk.map((k) => avgOf(grp[k].map((m) => maturityOverall(m, false)))) },
        { name: "بعد المراجعة", color: C.good, values: wk.map((k) => avgOf(grp[k].filter((m) => m.status === "REVIEWED").map((m) => maturityOverall(m, true)))) },
      )));
    }
    // مقارنة لكل تجمع
    if (items.length) {
      const top = items.slice(0, 12);
      boxes.push(chartBox("مقارنة التجمعات: ذاتي مقابل ما بعد المراجعة", groupedBarChart(
        top.map((m) => `${deptName(m.clusterId)} (${waveShort(m.clusterId)})`),
        { name: "تقييم التجمع (ذاتي)", color: "#2a78d6", values: top.map((m) => maturityOverall(m, false)) },
        { name: "بعد المراجعة", color: C.good, values: top.map((m) => (m.status === "REVIEWED" ? maturityOverall(m, true) : 0)) },
      )));
    }
    if (boxes.length) html += chartsWrap(...boxes);
  }
  return html;
}

// مؤشر مصغّر بارز على بطاقة كل تقرير (يجعل تبويب التقارير لوحة حية)
function cardStat(key) {
  const k = kpis();
  const hi = k.riskCounts.CRITICAL + k.riskCounts.HIGH;
  const monPct = store.monitoring.length ? Math.round((k.monDone / store.monitoring.length) * 100) : 0;
  switch (key) {
    case "executive": return { value: hi, label: "مخاطر عالية فأكثر", tone: hi ? "danger" : "good" };
    case "requirements": return { value: k.activeReqs.length, label: "متطلب نشط", tone: "primary" };
    case "risks": return { value: hi, label: "مخاطر عالية فأكثر", tone: hi ? "danger" : "good" };
    case "monitoring": return { value: monPct + "%", label: "إنجاز المراقبة", tone: monPct >= 70 ? "good" : monPct >= 40 ? "warn" : "danger" };
    case "assessments": return { value: store.assessments.length, label: "فحص ذاتي", tone: "primary" };
    case "plan": return { value: k.planAvg + "%", label: "إنجاز الخطة", tone: k.planAvg >= 70 ? "good" : k.planAvg >= 40 ? "warn" : "danger" };
    case "findings": return { value: k.openFnd.length, label: "ملاحظة مفتوحة", tone: k.openFnd.length ? "warn" : "good" };
    case "correspondence": { const o = store.correspondence.filter((c) => c.status === "OPEN").length; return { value: o, label: "قيد المعالجة", tone: o ? "warn" : "good" }; }
    case "disclosures": { const p = store.disclosures.filter((d) => ["PENDING", "UNDER_REVIEW"].includes(d.status)).length; return { value: p, label: "بانتظار المراجعة", tone: p ? "warn" : "good" }; }
    case "training": { const d = store.trainings.filter((t) => t.status === "COMPLETED").length; return { value: `${d}/${store.trainings.length}`, label: "برامج منفذة", tone: "primary" }; }
    case "maturity": { const a = store.maturity.length ? Math.round(store.maturity.reduce((s, m) => s + maturityOverall(m, m.status === "REVIEWED"), 0) / store.maturity.length) : 0; return { value: a + "%", label: "متوسط النضج", tone: a >= 70 ? "good" : a >= 40 ? "warn" : "danger" }; }
    default: return { value: "", label: "", tone: "primary" };
  }
}

// ---------- عرض التقرير (وللطباعة PDF) ----------
function reportHtml(key) {
  const k = kpis();
  const today = new Date().toLocaleDateString("ar-SA-u-ca-gregory-nu-latn", { dateStyle: "long" });
  const meta = REPORTS.find((r) => r.key === key);
  let body = "";

  const monPct = store.monitoring.length ? Math.round((k.monDone / store.monitoring.length) * 100) : 0;
  const kpiBlock = `
    <div class="rep-kpi">
      ${kpiCard(k.activeReqs.length, "متطلب نشط", "req")}
      ${kpiCard(store.risks.length, "خطر مسجل", "risk")}
      ${kpiCard(k.riskCounts.CRITICAL + k.riskCounts.HIGH, "مخاطر عالية فأكثر", (k.riskCounts.CRITICAL + k.riskCounts.HIGH) ? "danger" : "good")}
      ${kpiCard(monPct + "%", "إنجاز المراقبة", monPct >= 70 ? "good" : monPct >= 40 ? "warn" : "danger")}
      ${kpiCard(k.openFnd.length, "ملاحظة مفتوحة", k.openFnd.length ? "warn" : "good")}
      ${kpiCard(k.planAvg + "%", "إنجاز الخطة السنوية", k.planAvg >= 70 ? "good" : k.planAvg >= 40 ? "warn" : "danger")}
    </div>`;

  if (key === "executive") {
    const { top, recs } = execHighlights();
    const monResults = { COMPLIANT: 0, PARTIAL: 0, NON_COMPLIANT: 0 };
    for (const m of store.monitoring) if (m.result && monResults[m.result] !== undefined) monResults[m.result]++;
    body = `
      <h2>الملخص التنفيذي</h2>
      <p>يعرض هذا التقرير حالة الالتزام المؤسسي وفق منهجية ISO 37301: تغطي مكتبة الالتزام ${k.activeReqs.length} متطلباً نظامياً نشطاً،
      ويرصد سجل المخاطر ${store.risks.length} خطراً منها ${k.riskCounts.CRITICAL} حرج و${k.riskCounts.HIGH} عالٍ (بعد الضوابط)،
      وبلغت نسبة إنجاز برنامج المراقبة ${monPct}%،
      مع ${k.openFnd.length} ملاحظة مفتوحة قيد المعالجة، ونسبة إنجاز الخطة السنوية ${k.planAvg}%.</p>
      ${kpiBlock}
      <div class="rep-charts">
        <div class="rep-chart">
          <h3>توزيع المخاطر حسب المستوى (بعد الضوابط)</h3>
          ${donutChart([
            { label: "حرج", count: k.riskCounts.CRITICAL, color: C.critical },
            { label: "عالٍ", count: k.riskCounts.HIGH, color: C.serious },
            { label: "متوسط", count: k.riskCounts.MEDIUM, color: C.warning },
            { label: "منخفض", count: k.riskCounts.LOW, color: C.good },
          ], { size: 140, unit: "خطر" })}
        </div>
        <div class="rep-chart">
          <h3>نتائج أنشطة المراقبة المنفذة</h3>
          ${donutChart([
            { label: "ملتزم", count: monResults.COMPLIANT, color: C.good },
            { label: "ملتزم جزئياً", count: monResults.PARTIAL, color: C.warning },
            { label: "غير ملتزم", count: monResults.NON_COMPLIANT, color: C.critical },
          ], { size: 140, unit: "نشاط" })}
        </div>
      </div>
      <h2>أبرز المخاطر (بعد الضوابط)</h2>
      <table><thead><tr><th>الرقم</th><th>الخطر</th><th>المستوى</th><th>الإدارة</th><th>الحالة</th></tr></thead><tbody>
        ${top.map((x) => `<tr><td>${esc(x.r.code)}</td><td>${esc(x.r.title)}</td><td>${lvlPill(x.lvl.key, `${x.lvl.label} (${x.lvl.score})`)}</td><td>${esc(deptName(x.r.ownerDeptId))}</td><td>${esc(RISK_STATUS[x.r.status] || "")}</td></tr>`).join("") || '<tr><td colspan="5">لا توجد مخاطر عالية</td></tr>'}
      </tbody></table>
      <h2>الملاحظات المفتوحة عالية الخطورة</h2>
      <table><thead><tr><th>الرقم</th><th>الملاحظة</th><th>الخطورة</th><th>الإدارة</th><th>الاستحقاق</th></tr></thead><tbody>
        ${k.openFnd.filter((f) => ["CRITICAL", "HIGH"].includes(f.severity)).map((f) => `<tr><td>${esc(f.code)}</td><td>${esc(f.title)}</td><td>${lvlPill(f.severity, FND_SEVERITY[f.severity])}</td><td>${esc(deptName(f.departmentId))}</td><td>${fmtDate(f.dueDate)}</td></tr>`).join("") || '<tr><td colspan="5">لا يوجد</td></tr>'}
      </tbody></table>
      <h2>التوصيات</h2>
      <ul>${recs.map((r) => `<li>${esc(r)}</li>`).join("") || "<li>لا توجد توصيات مسجلة</li>"}</ul>`;
  } else {
    const t = tableFor(key);
    const charts = reportCharts(key);
    body = `
      ${kpiBlock}
      ${charts ? `<h2>مؤشرات ${esc(meta.title.replace("تقرير ", ""))}</h2>${charts}` : ""}
      <h2>التفاصيل</h2>
      <table><thead><tr>${t.head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead>
      <tbody>${t.rows.map((row) => `<tr>${row.map((c) => `<td>${cell(c)}</td>`).join("")}</tr>`).join("") || `<tr><td colspan="${t.head.length}">لا توجد بيانات</td></tr>`}</tbody></table>`;
  }

  return `
    <div class="report-doc" dir="rtl">
      <header class="rep-head">
        <div><h1>${esc(meta.title)}</h1><p>نظام إدارة الالتزام — Compliance Management System</p></div>
        <div class="rep-date">تاريخ الإصدار: ${today}</div>
      </header>
      ${body}
      <footer class="rep-foot">أُنشئ آلياً من نظام إدارة الالتزام · ${today}</footer>
    </div>`;
}

function viewReport(key) {
  const win = window.open("", "_blank");
  if (!win) return toast("اسمح بالنوافذ المنبثقة لعرض التقرير", true);
  win.document.write(`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"/>
    <title>${esc(REPORTS.find((r) => r.key === key).title)}</title>
    <style>
      *{box-sizing:border-box}
      body{font-family:"IBM Plex Sans Arabic","Segoe UI",Tahoma,sans-serif;margin:0;padding:28px 32px;color:#1a2c27;background:#f6f9f8;line-height:1.6}
      h1{font-size:1.5rem;margin:0}
      h2{font-size:1.1rem;margin:24px 0 10px;color:#0d5243;border-right:4px solid #14705c;padding-right:10px}
      h3{font-size:.95rem;margin:0 0 8px;color:#0d5243}
      p{margin:8px 0}
      table{width:100%;border-collapse:collapse;margin:10px 0;font-size:.85rem;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 6px rgba(15,55,45,.06)}
      th,td{border-bottom:1px solid #e6ecea;padding:8px 10px;text-align:right;vertical-align:top}
      th{background:linear-gradient(135deg,#1a8a70,#0d5243);color:#fff;font-weight:600;white-space:nowrap}
      tr:nth-child(even) td{background:#fafcfb}
      .report-doc{max-width:1000px;margin:0 auto}
      .rep-head{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #14705c;padding:0 0 14px;margin-bottom:8px}
      .rep-head h1{color:#0d5243}.rep-head p{color:#5d6c66;font-size:.85rem;margin:4px 0 0}
      .rep-date{color:#5d6c66;font-size:.85rem;text-align:left}
      .rep-kpi{display:grid;grid-template-columns:repeat(6,1fr);gap:12px;margin:14px 0}
      .kpi-card{background:#fff;border-radius:12px;border-top:4px solid #14705c;padding:14px 10px;text-align:center;box-shadow:0 2px 10px rgba(15,55,45,.07)}
      .kpi-num{font-size:1.7rem;font-weight:800;letter-spacing:-.02em}
      .kpi-lbl{font-size:.72rem;color:#5d6c66;margin-top:4px}
      .rep-charts{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin:12px 0}
      .rep-chart{background:#fff;border-radius:12px;padding:16px;box-shadow:0 2px 10px rgba(15,55,45,.07)}
      .bars{display:flex;flex-direction:column;gap:8px}
      .bar-row{display:flex;align-items:center;gap:10px}
      .bar-lbl{min-width:92px;font-size:.8rem;color:#5d6c66}
      .bar-track{flex:1;height:14px;border-radius:7px;background:#eef2f0;overflow:hidden}
      .bar-fill{display:block;height:100%;border-radius:7px}
      .bar-num{min-width:26px;font-weight:700;font-size:.85rem}
      .pill{display:inline-block;border-radius:11px;padding:2px 10px;font-size:.76rem;font-weight:600;white-space:nowrap}
      .muted{color:#8a8578;font-size:.85rem}
      ul{padding-right:22px}li{margin:4px 0}
      .rep-foot{margin-top:26px;color:#8a9a94;font-size:.78rem;border-top:1px solid #e0e6e4;padding-top:10px;text-align:center}
      .print-btn{position:fixed;top:14px;left:14px;padding:10px 20px;background:linear-gradient(135deg,#1a8a70,#0d5243);color:#fff;border:none;border-radius:10px;cursor:pointer;font-family:inherit;font-weight:600;box-shadow:0 4px 14px rgba(13,82,67,.3)}
      @media print{body{background:#fff;padding:0}.print-btn{display:none}.kpi-card,.rep-chart,table{box-shadow:none;border:1px solid #e0e6e4}th{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
      @media(max-width:700px){.rep-kpi{grid-template-columns:repeat(3,1fr)}.rep-charts{grid-template-columns:1fr}}
    </style></head><body>
    <button class="print-btn" onclick="window.print()">🖨 طباعة / حفظ PDF</button>
    ${reportHtml(key)}
    </body></html>`);
  win.document.close();
  logReport(key);
}

// ---------- تصدير Excel ----------
async function exportExcel(key) {
  if (typeof ExcelJS === "undefined") throw new Error("مكتبة التصدير لم تُحمَّل — أعد تحميل الصفحة");
  toast("جاري تجهيز ملف Excel…");
  const meta = REPORTS.find((r) => r.key === key);
  const wb = new ExcelJS.Workbook();
  wb.creator = "نظام إدارة الالتزام";
  wb.created = new Date();

  const addSheet = (name, head, rows) => {
    const ws = wb.addWorksheet(name.replace(/[\\/*?:\[\]]/g, "-").slice(0, 31), { views: [{ rightToLeft: true }] });
    ws.columns = head.map((h) => ({ header: h, width: Math.max(14, Math.min(50, h.length * 2 + 10)) }));
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8F0EC" } };
    for (const r of rows) ws.addRow(r).alignment = { wrapText: true, vertical: "top", horizontal: "right" };
    ws.autoFilter = { from: "A1", to: { row: 1, column: head.length } };
  };

  if (key === "executive") {
    const k = kpis();
    addSheet("المؤشرات", ["المؤشر", "القيمة"], [
      ["المتطلبات النشطة", k.activeReqs.length],
      ["إجمالي المخاطر", store.risks.length],
      ["مخاطر حرجة (بعد الضوابط)", k.riskCounts.CRITICAL],
      ["مخاطر عالية", k.riskCounts.HIGH],
      ["نسبة إنجاز المراقبة %", store.monitoring.length ? Math.round((k.monDone / store.monitoring.length) * 100) : 0],
      ["ملاحظات مفتوحة", k.openFnd.length],
      ["نسبة إنجاز الخطة السنوية %", k.planAvg],
    ]);
    for (const sub of ["requirements", "risks", "monitoring", "findings", "plan"]) {
      const t = tableFor(sub);
      addSheet(REPORTS.find((r) => r.key === sub).title.replace("تقرير ", ""), t.head, t.rows);
    }
  } else {
    const t = tableFor(key);
    addSheet(meta.title.replace("تقرير ", ""), t.head, t.rows);
  }

  const buffer = await wb.xlsx.writeBuffer();
  downloadBlob(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${meta.title}.xlsx`);
  logReport(key);
}

// ---------- تصدير Word (HTML بامتداد doc) ----------
async function exportWord(key) {
  const meta = REPORTS.find((r) => r.key === key);
  const html = `<html xmlns:w="urn:schemas-microsoft-com:office:word" lang="ar" dir="rtl"><head><meta charset="utf-8"/>
    <style>body{font-family:Arial;direction:rtl}table{border-collapse:collapse;width:100%}th,td{border:1px solid #999;padding:5px;text-align:right}th{background:#eef3f0}h2{color:#1d5c4d}</style>
    </head><body>${reportHtml(key)}</body></html>`;
  downloadBlob(new Blob(["﻿" + html], { type: "application/msword" }), `${meta.title}.doc`);
  logReport(key);
}

// ---------- تصدير عرض تقديمي (PowerPoint .pptx) ----------
async function exportPptx(key) {
  if (typeof PptxGenJS === "undefined") throw new Error("مكتبة العروض التقديمية لم تُحمَّل — تحقق من اتصالك وأعد تحميل الصفحة");
  toast("جاري تجهيز العرض التقديمي…");
  const meta = REPORTS.find((r) => r.key === key);
  const today = new Date().toLocaleDateString("ar-SA-u-ca-gregory-nu-latn", { dateStyle: "long" });
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE"; // 13.333 × 7.5
  pptx.rtlMode = true;
  pptx.author = "نظام إدارة الالتزام";
  const W = 13.333, GREEN = "0D5243", TEAL = "14705C", INK = "1A2C27", MUTED = "5D6C66", BG = "F6F9F8";
  const AR = { fontFace: "Arial", rtlMode: true };

  // شريحة العنوان
  const s1 = pptx.addSlide();
  s1.background = { color: GREEN };
  s1.addShape(pptx.ShapeType.rect, { x: 0, y: 3.15, w: W, h: 0.06, fill: { color: "3FA98C" } });
  s1.addText(meta.title, { x: 0.6, y: 2.2, w: W - 1.2, h: 1.0, fontSize: 40, bold: true, color: "FFFFFF", align: "center", ...AR });
  s1.addText("نظام إدارة الالتزام — Compliance Management System", { x: 0.6, y: 3.35, w: W - 1.2, h: 0.5, fontSize: 16, color: "CFE6DE", align: "center", ...AR });
  s1.addText(`تاريخ الإصدار: ${today}`, { x: 0.6, y: 4.1, w: W - 1.2, h: 0.4, fontSize: 13, color: "9FC4B8", align: "center", ...AR });

  const header = (slide, title) => {
    slide.background = { color: BG };
    slide.addText(title, { x: 0.4, y: 0.28, w: W - 0.8, h: 0.55, fontSize: 22, bold: true, color: GREEN, align: "right", ...AR });
    slide.addShape(pptx.ShapeType.line, { x: 0.4, y: 0.92, w: W - 0.8, h: 0, line: { color: TEAL, width: 2 } });
    slide.addText(`${meta.title} · ${today}`, { x: 0.4, y: 7.0, w: W - 0.8, h: 0.35, fontSize: 9, color: MUTED, align: "right", ...AR });
  };

  // بطاقات مؤشرات موحّدة
  const kpiCards = (slide, cards) => {
    const cw = (W - 0.8) / cards.length;
    cards.forEach((kp, i) => {
      const x = 0.4 + i * cw, w = cw - 0.18;
      slide.addShape(pptx.ShapeType.roundRect, { x, y: 2.4, w, h: 2.15, rectRadius: 0.09, fill: { color: "FFFFFF" }, line: { color: "E6ECEA", width: 1 }, shadow: { type: "outer", color: "AEBEB8", blur: 6, offset: 2, angle: 90, opacity: 0.45 } });
      slide.addText(String(kp.v), { x, y: 2.72, w, h: 0.9, fontSize: 30, bold: true, color: kp.c, align: "center", fontFace: "Arial" });
      slide.addText(kp.l, { x, y: 3.62, w, h: 0.55, fontSize: 12, color: INK, align: "center", ...AR });
      if (kp.s) slide.addText(kp.s, { x, y: 4.12, w, h: 0.4, fontSize: 9.5, color: MUTED, align: "center", ...AR });
    });
  };

  // ---- عناصر أصلية قابلة للتحرير في PowerPoint (تطابق مؤشرات الشاشة، ليست صوراً) ----
  const CARD_SHADOW = { type: "outer", color: "AEBEB8", blur: 5, offset: 2, angle: 90, opacity: 0.4 };
  // حلقة نسبية = مخطط دونات (شريحتان) + نسبة نصية في المركز
  const ringGauge = (slide, x, y, size, pct, colorHex, label, sub, card = true) => {
    if (card) slide.addShape(pptx.ShapeType.roundRect, { x, y, w: size, h: size + 0.5, rectRadius: 0.08, fill: { color: "FFFFFF" }, line: { color: "E6ECEA", width: 1 }, shadow: CARD_SHADOW });
    const p = (pct == null || isNaN(pct)) ? null : Math.max(0, Math.min(100, Math.round(pct)));
    const d = size * 0.66, rx = x + (size - d) / 2, ry = y + 0.12;
    slide.addChart(pptx.ChartType.doughnut, [{ name: "g", labels: ["v", "r"], values: p == null ? [0, 100] : [p, 100 - p] }], {
      x: rx, y: ry, w: d, h: d, holeSize: 74, chartColors: [p == null ? "D8DAD6" : colorHex, "EEF2F0"],
      showLegend: false, showValue: false, showTitle: false, showPercent: false, dataBorder: { pt: 1, color: "FFFFFF" },
    });
    slide.addText(p == null ? "—" : p + "%", { x: rx, y: ry, w: d, h: d, fontSize: Math.max(11, Math.round(size * 13)), bold: true, color: p == null ? "8A8578" : colorHex, align: "center", valign: "middle", fontFace: "Arial" });
    slide.addText(label, { x, y: y + d + 0.16, w: size, h: 0.3, fontSize: size < 1.6 ? 9.5 : 11.5, bold: true, color: INK, align: "center", ...AR });
    if (sub) slide.addText(sub, { x, y: y + d + 0.44, w: size, h: 0.26, fontSize: size < 1.6 ? 8 : 9, color: MUTED, align: "center", ...AR });
  };
  // بطاقة رقم = مستطيل + رقم كبير + عنوان
  const numTile = (slide, x, y, size, value, colorHex, label, sub) => {
    slide.addShape(pptx.ShapeType.roundRect, { x, y, w: size, h: size + 0.5, rectRadius: 0.08, fill: { color: "FFFFFF" }, line: { color: "E6ECEA", width: 1 }, shadow: CARD_SHADOW });
    slide.addText(String(value), { x, y: y + 0.16, w: size, h: size * 0.62, fontSize: Math.round(size * 18), bold: true, color: colorHex, align: "center", valign: "middle", fontFace: "Arial" });
    slide.addText(label, { x, y: y + size * 0.66, w: size, h: 0.32, fontSize: 11.5, bold: true, color: INK, align: "center", ...AR });
    if (sub) slide.addText(sub, { x, y: y + size * 0.66 + 0.3, w: size, h: 0.26, fontSize: 9, color: MUTED, align: "center", ...AR });
  };
  // شريط توزيع متدرّج = مستطيلات ملوّنة متتابعة + وسيلة إيضاح (كلها أشكال أصلية)
  const distributionBar = (slide, x, y, w, segs) => {
    const total = segs.reduce((s, dd) => s + dd.count, 0) || 1;
    const barH = 0.55;
    slide.addShape(pptx.ShapeType.roundRect, { x, y, w, h: barH, rectRadius: barH / 2, fill: { color: "E6ECEA" } });
    let cx = x;
    segs.forEach((dd) => { if (dd.count <= 0) return; const sw = (dd.count / total) * w; slide.addShape(pptx.ShapeType.rect, { x: cx, y, w: sw, h: barH, fill: { color: dd.color } }); cx += sw; });
    const gap = w / segs.length;
    segs.forEach((dd, i) => {
      const lx = x + i * gap;
      slide.addShape(pptx.ShapeType.roundRect, { x: lx, y: y + barH + 0.3, w: 0.24, h: 0.24, rectRadius: 0.05, fill: { color: dd.color } });
      slide.addText(`${dd.label} · ${dd.count}`, { x: lx + 0.32, y: y + barH + 0.24, w: gap - 0.4, h: 0.36, fontSize: 13, color: INK, align: "left", ...AR });
    });
  };

  // شريحة المؤشرات التنفيذية (لغير تقرير النضج — النضج له مؤشراته الربعية)
  if (key !== "maturity") {
    const k = kpis();
    const monPct = store.monitoring.length ? Math.round((k.monDone / store.monitoring.length) * 100) : 0;
    const sK = pptx.addSlide();
    header(sK, "أبرز المؤشرات");
    kpiCards(sK, [
      { v: k.activeReqs.length, l: "متطلب نشط", c: TEAL },
      { v: store.risks.length, l: "خطر مسجل", c: "2A78D6" },
      { v: k.riskCounts.CRITICAL + k.riskCounts.HIGH, l: "مخاطر عالية فأكثر", c: "D03B3B" },
      { v: monPct + "%", l: "إنجاز المراقبة", c: "0CA30C" },
      { v: k.openFnd.length, l: "ملاحظة مفتوحة", c: "E6A100" },
      { v: k.planAvg + "%", l: "إنجاز الخطة", c: "0CA30C" },
    ]);
  }

  // شرائح الرسوم — دائرية (دونات) للتوزيعات لتطابق الشاشة، وأعمدة للنسب (لغير النضج)
  if (key !== "maturity")
  for (const spec of distSpecs(key)) {
    const s = pptx.addSlide();
    header(s, spec.title);
    const colors = spec.items.map((i) => String(i.color).replace("#", ""));
    const total = spec.items.reduce((sum, i) => sum + (Number(i.count) || 0), 0);
    if (spec.bars) {
      const data = [{ name: spec.title, labels: spec.items.map((i) => i.label), values: spec.items.map((i) => Number(i.count) || 0) }];
      s.addChart(pptx.ChartType.bar, data, {
        x: 0.6, y: 1.35, w: W - 1.2, h: 5.1, barDir: "bar", chartColors: colors,
        showValue: true, dataLabelColor: "FFFFFF", dataLabelFontSize: 13, dataLabelFontBold: true, dataLabelPosition: "inEnd",
        showLegend: false, showTitle: false, valAxisHidden: true, catAxisLineShow: false,
        valGridLine: { style: "none" }, catAxisLabelColor: INK, catAxisLabelFontSize: 13, catAxisLabelFontFace: "Arial", barGapWidthPct: 45,
      });
    } else if (total > 0) {
      const data = [{ name: spec.title, labels: spec.items.map((i) => i.label), values: spec.items.map((i) => Number(i.count) || 0) }];
      s.addChart(pptx.ChartType.doughnut, data, {
        x: 1.0, y: 1.35, w: W - 2.0, h: 5.1, chartColors: colors, holeSize: 55,
        showLegend: true, legendPos: "r", legendFontSize: 13, legendFontFace: "Arial",
        showValue: true, dataLabelColor: "FFFFFF", dataLabelFontSize: 13, dataLabelFontBold: true, showTitle: false, showPercent: false,
      });
    } else {
      s.addText("لا توجد بيانات لهذا المؤشر", { x: 0.6, y: 3, w: W - 1.2, h: 1, fontSize: 15, color: MUTED, align: "center", ...AR });
    }
  }

  // ---------- تقرير النضج: يطابق لوحة النتائج الربعية (نفس المؤشرات والتصميم) ----------
  if (key === "maturity") {
    // أحدث تقييم لكل تجمع (مُرسل أو معتمد) — كما في صفحة النتائج
    const considered = store.maturity.filter((m) => ["REVIEWED", "SUBMITTED"].includes(m.status));
    const latest = {};
    for (const m of considered) { const c = m.clusterId; if (!latest[c] || (m.year * 4 + m.quarter) > (latest[c].year * 4 + latest[c].quarter)) latest[c] = m; }
    const items = Object.values(latest);
    const avg = (a) => (a.length ? Math.round(a.reduce((s, x) => s + x, 0) / a.length) : 0);
    const reviewed = items.filter((m) => m.status === "REVIEWED");
    const finalOf = (m) => maturityOverall(m, m.status === "REVIEWED");
    const avgSelf = avg(items.map((m) => maturityOverall(m, false)));
    const avgRev = avg(reviewed.map((m) => maturityOverall(m, true)));
    const domPct = (dom, useRev) => { const mx = dom.criteria.length * 3; return mx ? Math.round(dom.criteria.reduce((s, c) => s + ((useRev && c.reviewScore != null) ? c.reviewScore : (c.selfScore || 0)), 0) / mx * 100) : 0; };
    // تدرّج ألوان النضج (HSL→HEX) لتطابق تصميم الشاشة
    const hslHex = (h, s, l) => { s /= 100; l /= 100; const kk = (n) => (n + h / 30) % 12; const a = s * Math.min(l, 1 - l); const f = (n) => l - a * Math.max(-1, Math.min(kk(n) - 3, Math.min(9 - kk(n), 1))); const to = (x) => Math.round(255 * x).toString(16).padStart(2, "0").toUpperCase(); return to(f(0)) + to(f(8)) + to(f(4)); };
    const matHex = (p) => hslHex(Math.round(Math.max(0, Math.min(100, p)) * 1.2), 58, 44);
    const lighten = (hex, amt) => { const n = (i) => parseInt(hex.substr(i, 2), 16); const mm = (x) => Math.round(x + (255 - x) * amt).toString(16).padStart(2, "0").toUpperCase(); return mm(n(0)) + mm(n(2)) + mm(n(4)); };

    if (!items.length) {
      const s = pptx.addSlide(); header(s, "المؤشرات الربعية للنضج");
      s.addText("لا توجد نتائج بعد — تظهر التقييمات المُرسلة أو المعتمدة", { x: 0.6, y: 3, w: W - 1.2, h: 1, fontSize: 16, color: MUTED, align: "center", ...AR });
    } else {
      const lc = { good: 0, warning: 0, serious: 0, critical: 0 };
      for (const m of items) lc[maturityLevel(finalOf(m)).key]++;
      const grp = {}; CLUSTER_WAVE_ORDER.forEach((kk) => (grp[kk] = []));
      for (const m of items) grp[clusterWave(m.clusterId)?.key || "PREP"].push(m);
      const wk = CLUSTER_WAVE_ORDER.filter((kk) => grp[kk].length);
      const waveAvg = (kk, rev) => avg((rev ? grp[kk].filter((m) => m.status === "REVIEWED") : grp[kk]).map((m) => maturityOverall(m, rev)));

      // 1) بطاقات المؤشرات الربعية — حلقتان نسبيتان + بطاقتا أرقام (كلها عناصر أصلية قابلة للتحرير)
      const sK = pptx.addSlide(); header(sK, "المؤشرات الربعية للنضج");
      const iw = 2.55, cgap = (W - 0.8 - 4 * iw) / 3, cy = 2.15;
      const cardX = (i) => 0.4 + i * (iw + cgap);
      ringGauge(sK, cardX(0), cy, iw, avgSelf, matHex(avgSelf), "متوسط تقييم التجمعات", "التقييم الذاتي");
      ringGauge(sK, cardX(1), cy, iw, reviewed.length ? avgRev : null, matHex(avgRev), "متوسط بعد المراجعة", reviewed.length ? `${reviewed.length} معتمد` : "لا يوجد معتمد");
      numTile(sK, cardX(2), cy, iw, items.length, TEAL, "تجمعات في النتائج", "");
      numTile(sK, cardX(3), cy, iw, reviewed.length, "0CA30C", "تقييمات معتمدة", `${items.length - reviewed.length} بانتظار المراجعة`);

      // 2) توزيع التجمعات حسب مستوى النضج — شريط متدرّج من مستطيلات أصلية + وسيلة إيضاح
      const sd = pptx.addSlide(); header(sd, "توزيع التجمعات حسب مستوى النضج");
      const distSegs = [
        { label: "مبتدئ", count: lc.critical, color: matHex(12) }, { label: "نامٍ", count: lc.serious, color: matHex(38) },
        { label: "متقدم", count: lc.warning, color: matHex(63) }, { label: "رائد", count: lc.good, color: matHex(90) },
      ];
      if (distSegs.some((x) => x.count > 0)) distributionBar(sd, 0.7, 2.9, W - 1.4, distSegs);
      else sd.addText("لا توجد بيانات", { x: 0.6, y: 3, w: W - 1.2, h: 1, fontSize: 15, color: MUTED, align: "center", ...AR });

      // 3) مقارنة الموجات — بطاقة لكل موجة بحلقتين نسبيتين (ذاتي / بعد المراجعة)
      if (wk.length) {
        const s = pptx.addSlide(); header(s, "مقارنة الموجات");
        const cardW = (W - 0.8) / wk.length;
        for (let i = 0; i < wk.length; i++) {
          const kk = wk[i], g = grp[kk], rev = g.filter((m) => m.status === "REVIEWED");
          const x0 = 0.4 + i * cardW, cw = cardW - 0.2;
          s.addShape(pptx.ShapeType.roundRect, { x: x0, y: 1.35, w: cw, h: 4.7, rectRadius: 0.1, fill: { color: "FFFFFF" }, line: { color: "E6ECEA", width: 1 }, shadow: CARD_SHADOW });
          s.addShape(pptx.ShapeType.roundRect, { x: x0, y: 1.35, w: cw, h: 0.6, rectRadius: 0.1, fill: { color: CLUSTER_WAVES[kk].color.replace("#", "") } });
          s.addText(CLUSTER_WAVES[kk].label, { x: x0 + 0.08, y: 1.35, w: cw - 0.16, h: 0.6, fontSize: 12, bold: true, color: "FFFFFF", align: "center", valign: "middle", ...AR });
          const rw = Math.min(1.7, (cw - 0.4) / 2), gx = x0 + (cw - (2 * rw + 0.15)) / 2;
          ringGauge(s, gx, 2.25, rw, waveAvg(kk, false), matHex(waveAvg(kk, false)), "متوسط الذاتي", "", false);
          ringGauge(s, gx + rw + 0.15, 2.25, rw, rev.length ? waveAvg(kk, true) : null, matHex(waveAvg(kk, true)), "بعد المراجعة", rev.length ? "" : "لا يوجد", false);
          s.addText(`${g.length} تجمع`, { x: x0 + 0.08, y: 2.35 + rw + 0.5, w: cw - 0.16, h: 0.4, fontSize: 12, color: MUTED, align: "center", ...AR });
        }
      }

      // 3.5) قائمة نضج التجمعات — أشرطة تقدّم أصلية (تطابق شاشة «التقييمات» بنفس التصميم)
      const listRows = store.maturity.slice().sort((a, b) => (b.year - a.year) || (b.quarter - a.quarter) || (b.createdAt || "").localeCompare(a.createdAt || ""));
      if (listRows.length) {
        const RX = 13.03; // الحافة اليمنى للمحتوى
        const cols = { code: 1.0, name: 3.1, wave: 1.55, quarter: 1.2, bar: 3.0, level: 1.15, status: 1.45 };
        const cx = {}; let acc = RX;
        for (const kk of ["code", "name", "wave", "quarter", "bar", "level", "status"]) { cx[kk] = acc - cols[kk]; acc = cx[kk]; }
        const stColor = { DRAFT: "8A8578", SUBMITTED: "FAB219", REVIEWED: "0CA30C" };
        const rh = 0.46, yTop = 1.12, PER_L = 11;
        // شارة حبّة (pill): خلفية مستديرة + نص — عنصر أصلي قابل للتحرير
        const pill = (slide, x, y, w, h, fillHex, txtHex, text, fs, borderHex) => {
          slide.addShape(pptx.ShapeType.roundRect, { x, y: y + (rh - h) / 2, w, h, rectRadius: h / 2, fill: { color: fillHex }, ...(borderHex ? { line: { color: borderHex, width: 0.75 } } : {}) });
          slide.addText(text, { x: x + 0.03, y, w: w - 0.06, h: rh, fontSize: fs, color: txtHex, bold: true, align: "center", valign: "middle", ...AR });
        };
        const drawHeader = (slide) => {
          slide.addShape(pptx.ShapeType.roundRect, { x: cx.status, y: yTop, w: RX - cx.status, h: 0.42, rectRadius: 0.06, fill: { color: GREEN } });
          const htxt = (x, w, t, al) => slide.addText(t, { x: x + 0.05, y: yTop, w: w - 0.1, h: 0.42, fontSize: 9, bold: true, color: "FFFFFF", align: al || "center", valign: "middle", ...AR });
          htxt(cx.code, cols.code, "الرقم"); htxt(cx.name, cols.name, "التجمع", "right"); htxt(cx.wave, cols.wave, "الموجة");
          htxt(cx.quarter, cols.quarter, "الفترة"); htxt(cx.bar, cols.bar, "النضج المعتمد"); htxt(cx.level, cols.level, "المستوى"); htxt(cx.status, cols.status, "الحالة");
        };
        for (let i = 0; i < listRows.length; i += PER_L) {
          const slide = pptx.addSlide(); header(slide, i === 0 ? "قائمة نضج التجمعات" : "قائمة نضج التجمعات (تابع)");
          drawHeader(slide);
          listRows.slice(i, i + PER_L).forEach((m, j) => {
            const y = yTop + 0.5 + j * rh;
            const pct = maturityOverall(m, m.status === "REVIEWED");
            const wv = clusterWave(m.clusterId), lvl = maturityLevel(pct);
            if (j % 2 === 1) slide.addShape(pptx.ShapeType.rect, { x: cx.status, y, w: RX - cx.status, h: rh, fill: { color: "EEF3F1" } });
            slide.addText(m.code || "—", { x: cx.code, y, w: cols.code, h: rh, fontSize: 8.5, bold: true, color: INK, align: "center", valign: "middle", fontFace: "Arial" });
            slide.addText(deptName(m.clusterId), { x: cx.name + 0.05, y, w: cols.name - 0.1, h: rh, fontSize: 9, color: INK, align: "right", valign: "middle", ...AR });
            if (wv) { const wc = (wv.color || "#8a8578").replace("#", ""); pill(slide, cx.wave + 0.1, y, cols.wave - 0.2, 0.28, lighten(wc, 0.82), wc, wv.short, 8, lighten(wc, 0.45)); }
            else slide.addText("قيد التجهيز", { x: cx.wave, y, w: cols.wave, h: rh, fontSize: 8, color: MUTED, align: "center", valign: "middle", ...AR });
            slide.addText(`الربع ${m.quarter} / ${m.year}`, { x: cx.quarter, y, w: cols.quarter, h: rh, fontSize: 8, color: MUTED, align: "center", valign: "middle", ...AR });
            // شريط النضج: مسار + تعبئة ملوّنة تنمو من اليمين (RTL) + النسبة نصاً
            const bx = cx.bar, pctW = 0.5, trackX = bx + pctW + 0.08, trackW = cols.bar - pctW - 0.16, trackH = 0.17, trackY = y + (rh - trackH) / 2;
            slide.addShape(pptx.ShapeType.roundRect, { x: trackX, y: trackY, w: trackW, h: trackH, rectRadius: trackH / 2, fill: { color: "E9EEEC" } });
            if (pct > 0) { const fw = Math.max(trackH, trackW * pct / 100); slide.addShape(pptx.ShapeType.roundRect, { x: trackX + trackW - fw, y: trackY, w: fw, h: trackH, rectRadius: trackH / 2, fill: { color: matHex(pct) } }); }
            slide.addText(pct + "%", { x: bx, y, w: pctW, h: rh, fontSize: 9, bold: true, color: matHex(pct), align: "center", valign: "middle", fontFace: "Arial" });
            pill(slide, cx.level + 0.08, y, cols.level - 0.16, 0.28, matHex(pct), "FFFFFF", lvl.label, 8.5);
            const scol = stColor[m.status] || "8A8578";
            pill(slide, cx.status + 0.05, y, cols.status - 0.1, 0.28, lighten(scol, 0.82), scol, MATURITY_STATUS[m.status] || m.status, 7, lighten(scol, 0.5));
          });
        }
      }

      // 3.6) فجوات النضج حسب المحاور — أشرطة أفقية أصلية (الأضعف أولاً)
      const gDomNames = MATURITY_MODEL.map((d) => d.name);
      const domGaps = gDomNames.map((dn) => {
        const scores = items.map((m) => { const dom = (m.domains || []).find((d) => d.name === dn); return dom ? domPct(dom, m.status === "REVIEWED") : null; }).filter((x) => x != null);
        const av = scores.length ? Math.round(scores.reduce((s, x) => s + x, 0) / scores.length) : 0;
        return { name: dn, avg: av, n: scores.length };
      }).sort((a, b) => a.avg - b.avg);
      if (domGaps.length) {
        const s = pptx.addSlide(); header(s, "فجوات النضج حسب المحاور");
        const weak = domGaps.filter((d) => d.n).slice(0, 3);
        s.addText(weak.length ? `أبرز فجوات النضج في: ${weak.map((d) => `«${d.name}» (${d.avg}%)`).join("  ·  ")} — أولوية التطوير` : "لا توجد بيانات كافية",
          { x: 0.4, y: 1.0, w: W - 0.8, h: 0.5, fontSize: 12, color: MUTED, align: "right", ...AR });
        // مخطط أعمدة أفقي حقيقي (قابل للتعديل) — كل عمود ملوّن بمستوى نضجه
        s.addChart(pptx.ChartType.bar, [{ name: "متوسط النضج", labels: domGaps.map((d) => d.name), values: domGaps.map((d) => d.avg) }], {
          x: 0.5, y: 1.6, w: W - 1.0, h: 5.2, barDir: "bar", chartColors: domGaps.map((d) => matHex(d.avg)),
          showValue: true, dataLabelColor: INK, dataLabelFontSize: 11, dataLabelFontBold: true, dataLabelPosition: "outEnd", dataLabelFormatCode: '0"%"',
          showLegend: false, showTitle: false, valAxisHidden: true, valAxisMaxVal: 100, valGridLine: { style: "none" },
          catAxisLabelColor: INK, catAxisLabelFontSize: 10.5, catAxisLabelFontFace: "Arial", catAxisLineShow: false, barGapWidthPct: 45,
        });
      }

      // 4) مصفوفة النضج حسب المحاور (جدول ملوّن يطابق الشاشة)
      const domNames = MATURITY_MODEL.map((d) => d.name);
      const domShort = domNames.map((n) => (n.length > 15 ? n.slice(0, 14) + "…" : n));
      const sorted = items.slice().sort((a, b) => finalOf(b) - finalOf(a));
      const nameW = 1.7, waveW = 1.0, selfW = 1.05, revW = 1.15, domW = (W - 0.6 - nameW - waveW - selfW - revW) / domNames.length;
      const colW = [nameW, waveW, ...domNames.map(() => domW), selfW, revW];
      const hdrOpt = { bold: true, color: "FFFFFF", fill: { color: GREEN }, align: "center", fontSize: 8, valign: "middle", ...AR };
      const headRow = [
        { text: "التجمع", options: { ...hdrOpt, align: "right" } }, { text: "الموجة", options: hdrOpt },
        ...domShort.map((n) => ({ text: n, options: hdrOpt })),
        { text: "تقييم التجمع", options: hdrOpt }, { text: "بعد المراجعة", options: hdrOpt },
      ];
      const pctCell = (p) => ({ text: p + "%", options: { fill: { color: lighten(matHex(p), 0.84) }, color: matHex(p), bold: true, align: "center", fontSize: 9, valign: "middle" } });
      const bodyRows = sorted.map((m) => {
        const rev = m.status === "REVIEWED";
        return [
          { text: deptName(m.clusterId), options: { align: "right", fontSize: 8.5, color: INK, valign: "middle", ...AR } },
          { text: waveShort(m.clusterId), options: { align: "center", fontSize: 8, color: INK, valign: "middle", ...AR } },
          ...domNames.map((dn) => { const dom = (m.domains || []).find((d) => d.name === dn); return dom ? pctCell(domPct(dom, rev)) : { text: "—", options: { align: "center", fontSize: 8, color: MUTED } }; }),
          pctCell(maturityOverall(m, false)),
          rev ? pctCell(maturityOverall(m, true)) : { text: "بانتظار", options: { align: "center", fontSize: 8, color: MUTED, ...AR } },
        ];
      });
      const PER = 15;
      for (let i = 0; i < bodyRows.length; i += PER) {
        const s = pptx.addSlide(); header(s, i === 0 ? "مصفوفة النضج حسب المحاور" : "مصفوفة النضج حسب المحاور (تابع)");
        s.addTable([headRow, ...bodyRows.slice(i, i + PER)], { x: 0.3, y: 1.1, w: W - 0.6, colW, border: { type: "solid", color: "E6ECEA", pt: 0.5 }, valign: "middle", autoPage: false, rowH: 0.28 });
      }
    }
  }

  // شرائح الجدول التفصيلي (مقسّمة) — النضج له مصفوفته الخاصة أعلاه
  const t = key === "maturity" ? { head: [], rows: [] } : tableFor(key);
  if (t.head.length) {
    const MAX = 60, PER = 12;
    const rows = t.rows.slice(0, MAX);
    for (let i = 0; i < rows.length; i += PER) {
      const chunk = rows.slice(i, i + PER);
      const s = pptx.addSlide();
      header(s, i === 0 ? "التفاصيل" : "التفاصيل (تابع)");
      const table = [
        t.head.map((h) => ({ text: String(h), options: { bold: true, color: "FFFFFF", fill: { color: GREEN }, align: "right", fontSize: 9, ...AR } })),
        ...chunk.map((r) => r.map((c) => ({ text: String(c ?? ""), options: { align: "right", fontSize: 8, color: INK, ...AR } }))),
      ];
      s.addTable(table, { x: 0.3, y: 1.1, w: W - 0.6, border: { type: "solid", color: "E6ECEA", pt: 0.5 }, valign: "middle", autoPage: false });
    }
    if (!rows.length) { const s = pptx.addSlide(); header(s, "التفاصيل"); s.addText("لا توجد بيانات", { x: 0.5, y: 3, w: W - 1, h: 1, fontSize: 16, color: MUTED, align: "center", ...AR }); }
    if (t.rows.length > MAX) { const s = pptx.addSlide(); header(s, "ملاحظة"); s.addText(`عُرضت أول ${MAX} سجل في العرض التقديمي — للسجل الكامل استخدم تصدير Excel.`, { x: 0.6, y: 3, w: W - 1.2, h: 1, fontSize: 15, color: MUTED, align: "center", ...AR }); }
  }

  await pptx.writeFile({ fileName: `${meta.title}.pptx` });
  toast("تم إنشاء العرض التقديمي");
  logReport(key);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

async function logReport(key) {
  const meta = REPORTS.find((r) => r.key === key);
  try {
    await db.addRow("reports", {
      type: key,
      title: meta.title,
      generatedById: store.user?.uid || null,
      createdAt: db.now(),
    });
  } catch { /* السجل اختياري */ }
}
