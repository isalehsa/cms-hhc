// مؤشرات الأداء التنفيذية وسلاسلها الزمنية
// تُلتقط لقطة يومية واحدة (idempotent) في مجموعة metricSnapshots لبناء الاتجاه الزمني،
// وتُقاس القيم الحالية مقابل مستهدفات وعتبات قابلة للتهيئة مع مؤشر انحراف (RAG).
import { store } from "./state.js";
import * as db from "./db.js";
import { todayISO } from "./ui.js";
import { riskLevel } from "./meta.js";
import { currentDigest } from "./reminders.js";

const round = (n) => (n === null || n === undefined || isNaN(n) ? null : Math.round(n));

// ---------- حسابات المؤشرات من الحالة الراهنة ----------
function compScore(s) {
  const parts = [];
  for (const m of s.monitoring) {
    if (m.result === "COMPLIANT") parts.push(100);
    else if (m.result === "PARTIAL") parts.push(50);
    else if (m.result === "NON_COMPLIANT") parts.push(0);
  }
  for (const a of s.assessments) for (const q of a.questions || []) {
    const ans = q.response?.answer;
    if (ans === "COMPLIANT") parts.push(100);
    else if (ans === "PARTIAL") parts.push(50);
    else if (ans === "NON_COMPLIANT") parts.push(0);
  }
  return parts.length ? parts.reduce((x, y) => x + y, 0) / parts.length : null;
}
const monCompletion = (s) => (s.monitoring.length ? (s.monitoring.filter((m) => ["COMPLETED", "CLOSED"].includes(m.status)).length / s.monitoring.length) * 100 : null);
const saCompletion = (s) => (s.assessments.length ? (s.assessments.filter((a) => a.status === "REVIEWED").length / s.assessments.length) * 100 : null);
const planAvg = (s) => {
  const yr = new Date().getFullYear();
  const items = s.planItems.filter((p) => p.year === yr);
  return items.length ? items.reduce((sum, p) => sum + (p.progress || 0), 0) / items.length : null;
};
const openFindings = (s) => s.findings.filter((f) => f.status !== "CLOSED").length;
const highRisks = (s) => s.risks.filter((r) => ["CRITICAL", "HIGH"].includes(riskLevel(r.residualLikelihood ?? r.likelihood, r.residualImpact ?? r.impact).key)).length;
const overdueCount = (s) => { void s; return currentDigest().overdue.length; };

// تعريفات المؤشرات: الاتجاه (أعلى/أقل أفضل)، والمستهدف والعتبة الافتراضية
export const KPIS = [
  { key: "compScore", label: "نسبة الالتزام العامة", unit: "%", higherBetter: true, target: 85, amber: 70, calc: compScore },
  { key: "monCompletion", label: "إنجاز برنامج المراقبة", unit: "%", higherBetter: true, target: 90, amber: 70, calc: monCompletion },
  { key: "planAvg", label: "إنجاز الخطة السنوية", unit: "%", higherBetter: true, target: 80, amber: 60, calc: planAvg },
  { key: "saCompletion", label: "الفحص الذاتي المكتمل", unit: "%", higherBetter: true, target: 90, amber: 70, calc: saCompletion },
  { key: "openFindings", label: "الملاحظات المفتوحة", unit: "", higherBetter: false, target: 10, amber: 20, calc: openFindings },
  { key: "highRisks", label: "المخاطر العالية فأكثر (متبقية)", unit: "", higherBetter: false, target: 5, amber: 10, calc: highRisks },
  { key: "overdue", label: "الاستحقاقات المتأخرة", unit: "", higherBetter: false, target: 0, amber: 5, calc: overdueCount },
];

export function currentValues() {
  const out = {};
  for (const k of KPIS) out[k.key] = round(k.calc(store));
  return out;
}

// ---------- الدور اللوني (RAG) بحسب القيمة مقابل المستهدف/العتبة ----------
export function ragRole(kpi, value, cfg) {
  if (value === null || value === undefined) return "neutral";
  const target = cfg?.target ?? kpi.target;
  const amber = cfg?.amber ?? kpi.amber;
  if (kpi.higherBetter) {
    if (value >= target) return "good";
    if (value >= amber) return "warning";
    return "critical";
  }
  if (value <= target) return "good";
  if (value <= amber) return "warning";
  return "critical";
}

// انحراف عن المستهدف: موجب = أفضل من المستهدف في اتجاه المؤشر
export function deviation(kpi, value, cfg) {
  if (value === null || value === undefined) return null;
  const target = cfg?.target ?? kpi.target;
  return kpi.higherBetter ? value - target : target - value;
}

// ---------- اللقطة اليومية ----------
export async function captureSnapshot() {
  const id = `snap_${todayISO()}`;
  try {
    await db.setRow("metricSnapshots", id, {
      date: todayISO(),
      values: currentValues(),
      capturedAt: db.now(),
    });
    return true;
  } catch (e) {
    console.warn("snapshot failed", e);
    return false;
  }
}

// تحميل آخر N يوماً من اللقطات مرتّبة زمنياً تصاعدياً
export async function loadSnapshots(days = 90) {
  const rows = await db.listCol("metricSnapshots").catch(() => []);
  const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  return rows
    .filter((r) => (r.date || "") >= cutoff)
    .sort((a, b) => (a.date || "").localeCompare(b.date || ""));
}

// إعدادات المستهدفات/العتبات لكل مؤشر
export const loadTargets = () => db.getConfig("kpiTargets", {}).catch(() => ({}));
export const saveTargets = (data) => db.setConfig("kpiTargets", data);
