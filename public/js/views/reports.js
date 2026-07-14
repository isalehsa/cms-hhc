// التقارير — ملخص تنفيذي ومؤشرات وجداول، تصدير Excel / PDF (طباعة) / Word
import { store, deptName, authName, userName, reqLabel } from "../state.js";
import * as db from "../db.js";
import { esc, toast, fmtDate } from "../ui.js";
import {
  riskLevel, CRITICALITY, REQ_TYPES, REQ_CATEGORIES, REQ_STATUS,
  RISK_STATUS, MON_TYPES, MON_FREQ, MON_STATUS, MON_RESULT, NC_LEVELS,
  PLAN_STATUS, PLAN_SOURCES, SA_STATUS, SA_ANSWERS, FND_SEVERITY, FND_STATUS, FND_SOURCES,
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
        head: ["المبادرة", "السنة", "الربع", "المصدر", "الإدارة", "المسؤول", "المخرجات المتوقعة", "الإنجاز ٪", "الحالة"],
        rows: store.planItems.map((p) => [
          p.title, p.year || "", p.quarter ? `الربع ${p.quarter}` : "", PLAN_SOURCES[p.source] || p.source,
          deptName(p.departmentId), userName(p.ownerId), p.expectedOutput || "", p.progress || 0, PLAN_STATUS[p.status] || p.status,
        ]),
      };
    case "findings":
      return {
        head: ["الرقم", "الملاحظة", "المصدر", "الخطورة", "الإدارة", "المتطلب", "الاستحقاق", "الإجراءات التصحيحية", "متوسط التقدم ٪", "الحالة"],
        rows: store.findings.map((f) => [
          f.code, f.title, FND_SOURCES[f.source] || f.source, FND_SEVERITY[f.severity] || f.severity,
          deptName(f.departmentId), reqLabel(f.requirementId), fmtDate(f.dueDate),
          (f.actions || []).map((a) => `${a.description} (${a.progress || 0}٪)`).join(" | "),
          (f.actions || []).length ? Math.round(f.actions.reduce((s, a) => s + (a.progress || 0), 0) / f.actions.length) : 0,
          FND_STATUS[f.status] || f.status,
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

// ---------- عرض التقرير (وللطباعة PDF) ----------
function reportHtml(key) {
  const k = kpis();
  const today = new Date().toLocaleDateString("ar-SA", { dateStyle: "long" });
  const meta = REPORTS.find((r) => r.key === key);
  let body = "";

  const kpiBlock = `
    <table class="rep-kpi"><tbody><tr>
      <td><strong>${k.activeReqs.length}</strong><br/>متطلب نشط</td>
      <td><strong>${store.risks.length}</strong><br/>خطر مسجل</td>
      <td><strong>${k.riskCounts.CRITICAL + k.riskCounts.HIGH}</strong><br/>مخاطر عالية فأكثر</td>
      <td><strong>${store.monitoring.length ? Math.round((k.monDone / store.monitoring.length) * 100) : 0}٪</strong><br/>إنجاز المراقبة</td>
      <td><strong>${k.openFnd.length}</strong><br/>ملاحظة مفتوحة</td>
      <td><strong>${k.planAvg}٪</strong><br/>إنجاز الخطة السنوية</td>
    </tr></tbody></table>`;

  if (key === "executive") {
    const { top, recs } = execHighlights();
    body = `
      <h2>الملخص التنفيذي</h2>
      <p>يعرض هذا التقرير حالة الالتزام المؤسسي وفق منهجية ISO 37301: تغطي مكتبة الالتزام ${k.activeReqs.length} متطلباً نظامياً نشطاً،
      ويرصد سجل المخاطر ${store.risks.length} خطراً منها ${k.riskCounts.CRITICAL} حرج و${k.riskCounts.HIGH} عالٍ (بعد الضوابط)،
      وبلغت نسبة إنجاز برنامج المراقبة ${store.monitoring.length ? Math.round((k.monDone / store.monitoring.length) * 100) : 0}٪،
      مع ${k.openFnd.length} ملاحظة مفتوحة قيد المعالجة، ونسبة إنجاز الخطة السنوية ${k.planAvg}٪.</p>
      ${kpiBlock}
      <h2>أبرز المخاطر (بعد الضوابط)</h2>
      <table><thead><tr><th>الرقم</th><th>الخطر</th><th>المستوى</th><th>الإدارة</th><th>الحالة</th></tr></thead><tbody>
        ${top.map((x) => `<tr><td>${esc(x.r.code)}</td><td>${esc(x.r.title)}</td><td>${x.lvl.label} (${x.lvl.score})</td><td>${esc(deptName(x.r.ownerDeptId))}</td><td>${esc(RISK_STATUS[x.r.status] || "")}</td></tr>`).join("") || '<tr><td colspan="5">لا توجد مخاطر عالية</td></tr>'}
      </tbody></table>
      <h2>الملاحظات المفتوحة عالية الخطورة</h2>
      <table><thead><tr><th>الرقم</th><th>الملاحظة</th><th>الخطورة</th><th>الإدارة</th><th>الاستحقاق</th></tr></thead><tbody>
        ${k.openFnd.filter((f) => ["CRITICAL", "HIGH"].includes(f.severity)).map((f) => `<tr><td>${esc(f.code)}</td><td>${esc(f.title)}</td><td>${esc(FND_SEVERITY[f.severity])}</td><td>${esc(deptName(f.departmentId))}</td><td>${fmtDate(f.dueDate)}</td></tr>`).join("") || '<tr><td colspan="5">لا يوجد</td></tr>'}
      </tbody></table>
      <h2>التوصيات</h2>
      <ul>${recs.map((r) => `<li>${esc(r)}</li>`).join("") || "<li>لا توجد توصيات مسجلة</li>"}</ul>`;
  } else {
    const t = tableFor(key);
    body = `
      ${kpiBlock}
      <table><thead><tr>${t.head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead>
      <tbody>${t.rows.map((row) => `<tr>${row.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("") || `<tr><td colspan="${t.head.length}">لا توجد بيانات</td></tr>`}</tbody></table>`;
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
      body{font-family:"Segoe UI",Tahoma,sans-serif;margin:24px;color:#222}
      h1{font-size:1.4rem;margin:0}h2{font-size:1.05rem;margin:22px 0 8px;color:#1d5c4d}
      table{width:100%;border-collapse:collapse;margin:8px 0;font-size:.85rem}
      th,td{border:1px solid #ccc;padding:6px 8px;text-align:right;vertical-align:top}
      th{background:#eef3f0}
      .rep-head{display:flex;justify-content:space-between;align-items:start;border-bottom:3px solid #1d5c4d;padding-bottom:10px}
      .rep-kpi td{text-align:center;font-size:.95rem}
      .rep-foot{margin-top:24px;color:#888;font-size:.8rem;border-top:1px solid #ddd;padding-top:8px}
      .print-btn{position:fixed;top:12px;left:12px;padding:10px 18px;background:#1d5c4d;color:#fff;border:none;border-radius:8px;cursor:pointer}
      @media print{.print-btn{display:none}}
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
      ["نسبة إنجاز المراقبة ٪", store.monitoring.length ? Math.round((k.monDone / store.monitoring.length) * 100) : 0],
      ["ملاحظات مفتوحة", k.openFnd.length],
      ["نسبة إنجاز الخطة السنوية ٪", k.planAvg],
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
