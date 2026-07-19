// التقارير — ملخص تنفيذي ومؤشرات وجداول، تصدير Excel / PDF (طباعة) / Word
import { store, deptName, authName, userName, reqLabel } from "../state.js";
import * as db from "../db.js";
import { esc, toast, fmtDate } from "../ui.js";
import {
  riskLevel, CRITICALITY, REQ_TYPES, REQ_CATEGORIES, REQ_STATUS,
  RISK_STATUS, MON_TYPES, MON_FREQ, MON_STATUS, MON_RESULT, NC_LEVELS,
  PLAN_STATUS, PLAN_SOURCES, PLAN_TYPES, SA_STATUS, SA_ANSWERS, FND_SEVERITY, FND_STATUS, FND_SOURCES,
  COR_DIRECTION, COR_PRIORITY, COR_STATUS, DISCLOSURE_TYPES, DISCLOSURE_STATUS, TRAINING_TYPES, TRAINING_STATUS,
} from "../meta.js";

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
];

export function renderReports(el) {
  el.innerHTML = `
    <div class="page-head"><h1>📊 التقارير</h1><p class="muted">اختر التقرير ثم صيغة التصدير — التقارير تُبنى لحظياً من بيانات جميع الوحدات</p></div>
    <div class="report-grid">
      ${REPORTS.map(
        (r) => `<div class="card report-card">
          <h2>${r.icon} ${esc(r.title)}</h2>
          <p class="muted">${esc(r.desc)}</p>
          <div class="row">
            <button class="small" data-view="${r.key}">👁 عرض / PDF</button>
            <button class="secondary small" data-xlsx="${r.key}">⬇ Excel</button>
            <button class="secondary small" data-doc="${r.key}">⬇ Word</button>
          </div>
        </div>`
      ).join("")}
    </div>`;

  el.querySelectorAll("[data-view]").forEach((b) => (b.onclick = () => viewReport(b.dataset.view)));
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
          ${repBars([
            { label: "حرج", count: k.riskCounts.CRITICAL, color: C.critical },
            { label: "عالٍ", count: k.riskCounts.HIGH, color: C.serious },
            { label: "متوسط", count: k.riskCounts.MEDIUM, color: C.warning },
            { label: "منخفض", count: k.riskCounts.LOW, color: C.good },
          ])}
        </div>
        <div class="rep-chart">
          <h3>نتائج أنشطة المراقبة المنفذة</h3>
          ${repBars([
            { label: "ملتزم", count: monResults.COMPLIANT, color: C.good },
            { label: "ملتزم جزئياً", count: monResults.PARTIAL, color: C.warning },
            { label: "غير ملتزم", count: monResults.NON_COMPLIANT, color: C.critical },
          ])}
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
    body = `
      ${kpiBlock}
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
