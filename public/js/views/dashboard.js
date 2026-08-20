// لوحة التحكم التنفيذية — مؤشرات الالتزام العامة والتنبيهات (تصميم لوحة حديث)
import { store, deptName, deptOptions } from "../state.js";
import {
  esc, statTile, progressBar, fmtDate, daysUntil, levelBadge, sel, lineIcon, sparkline,
  donutStat, donutChart, gaugeChart, trendChart, groupedBarChart, riskHeatmap, hBars, monthCalendar, MONTH_NAMES, fmtSAR,
} from "../ui.js";
import { riskLevel, CRITICALITY, FND_SEVERITY, MON_RESULT, SA_STATUS, CONTROL_TYPES, STATUS_COLORS } from "../meta.js";

const roleColor = (role) => STATUS_COLORS[role] || STATUS_COLORS.neutral;
const icon = (name, size = 22) => lineIcon(name, size);

// عدد العناصر لكل شهر (آخر N أشهر) — سلسلة زمنية حقيقية للـ sparkline
function seriesByMonth(items, getDate, months = 8) {
  const now = new Date();
  const out = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const start = d.toISOString().slice(0, 7);
    out.push(items.filter((x) => String(getDate(x) || "").slice(0, 7) === start).length);
  }
  return out;
}
// فرق النقطتين الأخيرتين كنسبة — { pct, dir, good }
function pctDelta(series, upIsGood = true) {
  const a = series[series.length - 2] || 0, b = series[series.length - 1] || 0;
  if (a === 0 && b === 0) return null;
  const pct = a === 0 ? 100 : Math.round(((b - a) / a) * 100);
  const dir = b >= a ? "up" : "down";
  return { pct, dir, good: dir === "up" ? upIsGood : !upIsGood };
}
const deltaChip = (d) => (d ? `<span class="kpi-chip ${d.good ? "good" : "bad"}">${d.dir === "up" ? "▲" : "▼"} ${Math.abs(d.pct)}%</span>` : "");

// حلقة نسبية صغيرة لبطاقة مؤشر
function miniRing(pct, color) {
  const p = Math.max(0, Math.min(100, Math.round(pct || 0)));
  const r = 27, c = 2 * Math.PI * r;
  return `<svg width="72" height="72" viewBox="0 0 72 72" aria-hidden="true">
    <circle cx="36" cy="36" r="${r}" fill="none" stroke="rgba(255,255,255,.12)" stroke-width="7"/>
    <circle cx="36" cy="36" r="${r}" fill="none" stroke="${color}" stroke-width="7" stroke-linecap="round" stroke-dasharray="${(p / 100 * c).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 36 36)"/>
    <text x="36" y="41" text-anchor="middle" style="font-size:16px;font-weight:800;fill:var(--text)">${p}%</text></svg>`;
}

// بطاقة مؤشر رئيسية بنمط اللوحة — بخط مؤشر مصغّر ونسبة تغيّر
function kpiCard({ title, ic, big, tag, tagRole, sub, ring, spark, sparkColor, delta }) {
  return `<div class="kpi">
    <div class="kpi-head"><span class="kpi-title">${ic ? `<span class="kpi-ic">${ic}</span>` : ""}${esc(title)}</span><span class="kpi-menu">⋯</span></div>
    <div class="kpi-body">
      ${ring ? `<div class="kpi-ring">${ring}</div>` : ""}
      <div class="kpi-main">
        <div class="kpi-valrow"><span class="kpi-val">${big}</span>${delta ? deltaChip(delta) : (tag ? `<span class="kpi-tag ${tagRole || ""}">${tag}</span>` : "")}</div>
        ${sub ? `<div class="kpi-delta">${sub}</div>` : ""}
      </div>
    </div>
    ${spark ? `<div class="kpi-spark">${sparkline(spark, { color: sparkColor || "#22d6a6" })}</div>` : ""}
  </div>`;
}

// لوحة زخرفية: درع متوهّج بحلقات وأيقونات طائرة في ترويسة لوحة التحكم
function shieldArt() {
  return `<div class="hero-art" aria-hidden="true">
    <svg class="shield-art" viewBox="0 0 320 320">
      <defs>
        <radialGradient id="hglow" cx="50%" cy="45%" r="55%"><stop offset="0" stop-color="#21d6a6" stop-opacity=".38"/><stop offset="1" stop-color="#21d6a6" stop-opacity="0"/></radialGradient>
        <linearGradient id="hsg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#34e7b8"/><stop offset="1" stop-color="#0e9c78"/></linearGradient>
      </defs>
      <circle cx="160" cy="150" r="150" fill="url(#hglow)"/>
      <circle class="ring ring-dash" cx="160" cy="150" r="128" fill="none" stroke="rgba(120,220,190,.28)" stroke-width="1.5" stroke-dasharray="4 10"/>
      <circle cx="160" cy="150" r="98" fill="none" stroke="rgba(120,220,190,.22)" stroke-width="1.5"/>
      <circle cx="160" cy="150" r="70" fill="none" stroke="rgba(33,214,166,.3)" stroke-width="1.5"/>
      <g transform="translate(160 150)">
        <path d="M0 -72 L60 -46 V6 C60 47 31 76 0 88 C-31 76 -60 47 -60 6 V-46 Z" fill="url(#hsg)" stroke="rgba(255,255,255,.28)" stroke-width="2"/>
        <path d="M-24 4 L-6 22 L28 -20" fill="none" stroke="#04241c" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
      </g>
    </svg>
    <span class="float f1">${icon("scale", 20)}</span>
    <span class="float f2">${icon("users", 20)}</span>
    <span class="float f3">${icon("doc", 20)}</span>
  </div>`;
}

// شهر التقويم المعروض — يبقى بين عمليات إعادة الرسم
const calState = { y: new Date().getFullYear(), m: new Date().getMonth() };
// فلاتر اللوحة (تبقى بين عمليات إعادة الرسم)
const dashFilter = { dept: "", year: "" };

// نسبة التقييم الذاتي لتقييم نضج (0-100)
function maturitySelfPct(m) {
  const cs = (m.domains || []).flatMap((d) => d.criteria);
  const max = cs.length * 3;
  return max ? Math.round((cs.reduce((s, c) => s + (c.selfScore || 0), 0) / max) * 100) : 0;
}

// تطبيق فلاتر الإدارة/التجمع والسنة على مجموعات النظام
function filteredStore() {
  const { dept, year } = dashFilter;
  const yr = (iso) => (iso ? String(iso).slice(0, 4) : "");
  const byDept = (arr, field) => (dept ? arr.filter((x) => x[field] === dept) : arr);
  const byYear = (arr, get) => (year ? arr.filter((x) => String(get(x) || "") === year) : arr);
  return {
    requirements: byDept(store.requirements, "ownerDeptId"),
    risks: byDept(store.risks, "ownerDeptId"),
    monitoring: byYear(byDept(store.monitoring, "targetDeptId"), (m) => yr(m.startDate || m.endDate)),
    assessments: byDept(store.assessments, "departmentId"),
    findings: byYear(byDept(store.findings, "departmentId"), (f) => yr(f.createdAt)),
    planItems: byYear(byDept(store.planItems, "departmentId"), (p) => p.year),
    correspondence: byYear(byDept(store.correspondence, "ownerDeptId"), (c) => yr(c.date)),
    disclosures: byYear(byDept(store.disclosures, "departmentId"), (d) => yr(d.date)),
    trainings: byYear(dept ? store.trainings.filter((t) => t.departmentId === dept || t.audienceType === "all") : store.trainings, (t) => yr(t.date)),
    maturity: byYear(byDept(store.maturity, "clusterId"), (m) => m.year),
  };
}

// السنوات المتاحة في البيانات (للفلتر)
function availableYears() {
  const ys = new Set();
  store.planItems.forEach((p) => p.year && ys.add(String(p.year)));
  store.maturity.forEach((m) => m.year && ys.add(String(m.year)));
  store.findings.forEach((f) => f.createdAt && ys.add(String(f.createdAt).slice(0, 4)));
  store.monitoring.forEach((m) => (m.startDate || m.endDate) && ys.add(String(m.startDate || m.endDate).slice(0, 4)));
  return [...ys].filter(Boolean).sort((a, b) => b.localeCompare(a));
}

// اتجاه متوسط التقييم الذاتي للنضج حسب الربع (آخر 6 فترات)
function maturityTrendPoints(mats) {
  const byP = {};
  for (const m of mats) (byP[`${m.year}-${m.quarter}`] ||= []).push(maturitySelfPct(m));
  return Object.keys(byP)
    .sort((a, b) => { const [ay, aq] = a.split("-").map(Number), [by, bq] = b.split("-").map(Number); return (ay * 4 + aq) - (by * 4 + bq); })
    .slice(-6)
    .map((k) => { const [y, q] = k.split("-"); const arr = byP[k]; return { label: `ر${q}/${y}`, value: Math.round(arr.reduce((s, x) => s + x, 0) / arr.length) }; });
}

// أحداث تقويم الالتزام من جميع الوحدات
function calendarEvents() {
  const evs = [];
  const today = new Date().toISOString().slice(0, 10);
  const add = (iso, ic, label, tip, view) => {
    if (!iso) return;
    const date = String(iso).slice(0, 10);
    evs.push({ date, ic, label, tip, view, overdue: date < today });
  };
  for (const r of store.requirements) if (r.status !== "CANCELLED") add(r.nextReviewDate, "book", r.code, `مراجعة المتطلب: ${r.code} — ${r.title}`, "library");
  for (const m of store.monitoring) if (!["COMPLETED", "CLOSED"].includes(m.status)) add(m.endDate, "search", m.code, `نهاية نشاط المراقبة: ${m.code} — ${m.name}`, "monitoring");
  for (const r of store.risks) if (["OPEN", "IN_TREATMENT"].includes(r.status)) add(r.dueDate, "alert", r.code, `استحقاق معالجة الخطر: ${r.code} — ${r.title}`, "risks");
  for (const f of store.findings) if (f.status !== "CLOSED") add(f.dueDate, "target", f.code, `استحقاق خطة التصحيح: ${f.code} — ${f.title}`, "findings");
  for (const a of store.assessments) if (["SENT", "SUBMITTED"].includes(a.status)) add(a.dueDate, "chat", "فحص", `استحقاق الفحص الذاتي: ${a.title}`, "assessments");
  for (const c of store.correspondence) if (c.status === "OPEN") add(c.dueDate, "doc", c.code, `استحقاق الرد على المراسلة: ${c.code} — ${c.subject}`, "correspondence");
  for (const t of store.trainings) if (["PLANNED", "IN_PROGRESS"].includes(t.status)) add(t.dueDate || t.date, "cap", t.code, `نشاط تدريب/توعية: ${t.code} — ${t.title}`, "training");
  // اجتماعات الالتزام (محاضر الأقسام واللجان) — تظهر بتاريخها في تقويم الالتزام
  for (const mt of store.meetings || []) if ((mt.type || "") === "DEPT") add(mt.date, "calendar", mt.code || "اجتماع", `اجتماع الالتزام: ${mt.party || mt.title || mt.code || ""}`, "deptmeetings");
  return evs;
}
// نسخة برموز تعبيرية للتقويم الشهري (يتوقّعها monthCalendar)
function calendarEventsEmoji() {
  const map = { book: "📖", search: "🔍", alert: "⚠", target: "🛠", chat: "📋", doc: "📨", cap: "🎓", calendar: "🗓" };
  return calendarEvents().map((e) => ({ ...e, icon: map[e.ic] || "•" }));
}

// اتجاه الملاحظات المنشأة حسب الربع (آخر 6 أرباع)
function findingsByQuarter(findings, quarters = 6) {
  const now = new Date();
  const out = [];
  for (let i = quarters - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i * 3, 1);
    const q = Math.floor(d.getMonth() / 3);
    const start = new Date(d.getFullYear(), q * 3, 1).toISOString();
    const end = new Date(d.getFullYear(), q * 3 + 3, 1).toISOString();
    const inQ = findings.filter((f) => f.createdAt >= start && f.createdAt < end);
    out.push({ label: `ر${q + 1}/${d.getFullYear()}`, value: inQ.length });
  }
  return out;
}

export function renderDashboard(el, nav) {
  const s = filteredStore();
  const u = store.user || {};

  // مؤشرات المتطلبات
  const activeReqs = s.requirements.filter((r) => r.status !== "CANCELLED");
  const critReqs = activeReqs.filter((r) => r.criticality === "CRITICAL").length;

  // المخاطر حسب المستوى (بعد الضوابط إن وُجد تقييم متبقٍ)
  const riskCounts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
  for (const r of s.risks) {
    const lvl = riskLevel(r.residualLikelihood ?? r.likelihood, r.residualImpact ?? r.impact);
    riskCounts[lvl.key]++;
  }
  const openRisks = s.risks.filter((r) => ["OPEN", "IN_TREATMENT"].includes(r.status));

  // خطة المراقبة: نسبة الإنجاز
  const monTotal = s.monitoring.length;
  const monDone = s.monitoring.filter((m) => ["COMPLETED", "CLOSED"].includes(m.status)).length;

  // نتائج المراقبة
  const monResults = { COMPLIANT: 0, PARTIAL: 0, NON_COMPLIANT: 0 };
  for (const m of s.monitoring) if (m.result && monResults[m.result] !== undefined) monResults[m.result]++;

  // الفحص الذاتي
  const saTotal = s.assessments.length;
  const saDone = s.assessments.filter((a) => a.status === "REVIEWED").length;
  const saPending = s.assessments.filter((a) => ["SENT", "SUBMITTED"].includes(a.status));

  // الملاحظات المفتوحة
  const openFindings = s.findings.filter((f) => f.status !== "CLOSED");
  const highFindings = openFindings.filter((f) => ["HIGH", "CRITICAL"].includes(f.severity)).length;

  // التدريب والتوعية: نسبة الإنجاز
  const trTotal = s.trainings.length;
  const trDone = s.trainings.filter((t) => t.status === "COMPLETED").length;
  const trainingPct = trTotal ? Math.round((trDone / trTotal) * 100) : 0;

  // الخطة السنوية
  const year = new Date().getFullYear();
  const planYear = s.planItems.filter((p) => p.year === year);
  const planAvg = planYear.length ? planYear.reduce((sum, p) => sum + (p.progress || 0), 0) / planYear.length : 0;

  // نسبة الالتزام العامة: متوسط نتائج المراقبة المنفذة وإجابات الفحص الذاتي
  const scoreParts = [];
  for (const m of s.monitoring) {
    if (m.result === "COMPLIANT") scoreParts.push(100);
    else if (m.result === "PARTIAL") scoreParts.push(50);
    else if (m.result === "NON_COMPLIANT") scoreParts.push(0);
  }
  for (const a of s.assessments) {
    for (const q of a.questions || []) {
      const ans = q.response?.answer;
      if (ans === "COMPLIANT") scoreParts.push(100);
      else if (ans === "PARTIAL") scoreParts.push(50);
      else if (ans === "NON_COMPLIANT") scoreParts.push(0);
    }
  }
  const compScore = scoreParts.length ? Math.round(scoreParts.reduce((x, y) => x + y, 0) / scoreParts.length) : null;
  const scoreLabel = compScore === null ? "—" : compScore >= 76 ? "ممتاز" : compScore >= 51 ? "جيد" : compScore >= 26 ? "مقبول" : "يحتاج تحسين";
  const scoreRole = compScore === null ? "neutral" : compScore >= 76 ? "good" : compScore >= 51 ? "warning" : compScore >= 26 ? "serious" : "critical";

  // التقدير المالي للغرامات من سجل المخاطر
  const expectedFines = openRisks.reduce((sum, r) => sum + (r.fineAmount || 0), 0);
  const avoidedFines = s.risks.filter((r) => ["TREATED", "CLOSED", "ACCEPTED"].includes(r.status)).reduce((sum, r) => sum + (r.fineAmount || 0), 0);

  // الضوابط المسجلة على المخاطر
  const allControls = s.risks.flatMap((r) => r.controls || []);
  const ctlTypes = CONTROL_TYPES.map((t) => ({ label: t, count: allControls.filter((c) => c.type === t).length }));
  const untyped = allControls.filter((c) => !c.type).length;
  if (untyped) ctlTypes.push({ label: "غير مصنف", count: untyped });

  // التنبيهات
  const alerts = [];
  for (const r of activeReqs) {
    const d = daysUntil(r.nextReviewDate);
    if (d !== null && d <= 30) alerts.push({ ic: "book", text: `${r.code} — ${r.title}: ${d < 0 ? `تأخرت مراجعته ${-d} يوماً` : `مراجعته تستحق خلال ${d} يوماً`}`, view: "library", overdue: d < 0 });
  }
  for (const f of openFindings) {
    const d = daysUntil(f.dueDate);
    if (d !== null && d <= 14) alerts.push({ ic: "target", text: `${f.code} — ${f.title}: ${d < 0 ? `خطة التصحيح متأخرة ${-d} يوماً` : `تستحق خلال ${d} يوماً`}`, view: "findings", overdue: d < 0 });
  }
  for (const a of saPending) {
    const d = daysUntil(a.dueDate);
    if (d !== null && d <= 7) alerts.push({ ic: "chat", text: `${a.title} (${deptName(a.departmentId)}): ${d < 0 ? `متأخر ${-d} يوماً` : `يستحق خلال ${d} يوماً`}`, view: "assessments", overdue: d < 0 });
  }
  for (const c of s.correspondence.filter((x) => x.status === "OPEN")) {
    const d = daysUntil(c.dueDate);
    if (d !== null && d <= 7) alerts.push({ ic: "doc", text: `${c.code} — ${c.subject}: ${d < 0 ? `الرد متأخر ${-d} يوماً` : `الرد مستحق خلال ${d} يوماً`}`, view: "correspondence", overdue: d < 0 });
  }
  alerts.sort((a, b) => (b.overdue ? 1 : 0) - (a.overdue ? 1 : 0));

  // المهام القادمة (استحقاقات مرتّبة زمنياً)
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = calendarEvents().filter((e) => e.date >= today).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5);

  // المستجدات التنظيمية (أحدث المتطلبات المضافة)
  const regUpdates = [...s.requirements].filter((r) => r.status !== "CANCELLED")
    .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || "")).slice(0, 3);

  const years = availableYears();
  const activeFilter = dashFilter.dept || dashFilter.year;
  const monLegend = [
    { k: "COMPLIANT", role: "good" }, { k: "PARTIAL", role: "warning" }, { k: "NON_COMPLIANT", role: "critical" },
  ].map((x) => `<div class="ov-leg"><span class="dot" style="background:${roleColor(x.role)}"></span>${esc(MON_RESULT[x.k])}<strong>${monResults[x.k]}</strong></div>`).join("");

  // سلاسل زمنية شهرية حقيقية للخطوط المصغّرة + نِسب التغيّر
  const riskSeries = seriesByMonth(s.risks, (r) => r.createdAt);
  const findingSeries = seriesByMonth(s.findings, (f) => f.createdAt);
  const trainingSeries = seriesByMonth(s.trainings, (t) => t.date || t.createdAt);
  const riskDelta = pctDelta(riskSeries, false);
  const findingDelta = pctDelta(findingSeries, false);
  const trainingDelta = pctDelta(trainingSeries, true);
  // مقارنة المخاطر: الكامنة (قبل الضوابط) مقابل المتبقية (بعد الضوابط)
  const inh = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
  for (const r of s.risks) inh[riskLevel(r.likelihood, r.impact).key]++;

  el.innerHTML = `
    <!-- بطاقة الترحيب + الدرع الزخرفي -->
    <section class="hero card">
      <div class="hero-text">
        <h1>مرحباً بعودتك، ${esc((u.name || "").split(" ")[0] || u.name || "")}</h1>
        <p class="hero-sub">راقب وادِر وعزّز الالتزام <span class="hl">برؤية وذكاء</span>.</p>
        <p class="hero-date">${new Date().toLocaleDateString("ar-SA-u-ca-gregory-nu-latn", { dateStyle: "full" })}</p>
        <div class="row" style="gap:8px;flex-wrap:wrap;margin-top:6px">
          ${sel("dash-dept", deptOptions(), dashFilter.dept, { empty: "كل الإدارات والتجمعات" })}
          ${sel("dash-year", years.map((y) => ({ id: y, name: y })), dashFilter.year, { empty: "كل السنوات" })}
          ${activeFilter ? '<button class="secondary small" id="dash-clear" title="إلغاء الفلاتر">✕ مسح</button>' : ""}
        </div>
      </div>
      ${shieldArt()}
    </section>

    <!-- صف المؤشرات الرئيسية -->
    <div class="kpi-row">
      ${kpiCard({ title: "درجة الالتزام", ring: miniRing(compScore ?? 0, roleColor(scoreRole)), big: scoreLabel, tag: compScore === null ? "" : `${compScore}%`, tagRole: scoreRole, sub: compScore === null ? "لا نتائج بعد" : `من ${scoreParts.length} نتيجة مراقبة وفحص` })}
      ${kpiCard({ title: "المخاطر المفتوحة", ic: icon("alert", 18), big: openRisks.length, delta: riskDelta, spark: riskSeries, sparkColor: roleColor("serious"), sub: `متوسط: ${riskCounts.MEDIUM} · عالٍ فأكثر: ${riskCounts.HIGH + riskCounts.CRITICAL}` })}
      ${kpiCard({ title: "الملاحظات المفتوحة", ic: icon("chat", 18), big: openFindings.length, delta: findingDelta, spark: findingSeries, sparkColor: roleColor("serious"), sub: `${highFindings} عالية الخطورة` })}
      ${kpiCard({ title: "إنجاز التدريب", ic: icon("cap", 18), big: `${trainingPct}%`, delta: trainingDelta, spark: trainingSeries, sparkColor: roleColor("good"), sub: `${trDone} من ${trTotal} نشاطاً` })}
    </div>

    <!-- مقارنة المخاطر: الكامنة مقابل المتبقية -->
    <section class="card">
      <div class="row" style="justify-content:space-between"><h2>مقارنة المخاطر — الكامنة مقابل المتبقية</h2><span class="muted">أثر الضوابط الحالية</span></div>
      ${s.risks.length ? groupedBarChart(
        ["حرج", "عالٍ", "متوسط", "منخفض"],
        { name: "كامنة (قبل الضوابط)", color: roleColor("serious"), values: [inh.CRITICAL, inh.HIGH, inh.MEDIUM, inh.LOW] },
        { name: "متبقية (بعد الضوابط)", color: roleColor("good"), values: [riskCounts.CRITICAL, riskCounts.HIGH, riskCounts.MEDIUM, riskCounts.LOW] }
      ) : '<p class="muted">لا توجد مخاطر مسجّلة بعد</p>'}
    </section>

    <!-- نظرة عامة على المخاطر + المستجدات التنظيمية -->
    <div class="dash-grid ov-layout">
      <section class="card">
        <div class="row" style="justify-content:space-between"><h2>نظرة عامة على مخاطر الالتزام</h2><span class="muted">${s.risks.length} خطر</span></div>
        <div class="overview-split">
          <div>${donutChart([
            { label: "حرج", count: riskCounts.CRITICAL, color: roleColor("critical") },
            { label: "عالٍ", count: riskCounts.HIGH, color: roleColor("serious") },
            { label: "متوسط", count: riskCounts.MEDIUM, color: roleColor("warning") },
            { label: "منخفض", count: riskCounts.LOW, color: roleColor("good") },
          ], { unit: "خطر", size: 140 })}</div>
          <div><h3 style="margin:0 0 4px">اتجاه الملاحظات</h3>${trendChart(findingsByQuarter(s.findings, 6), { unit: " ملاحظة", color: "#22d6a6" })}</div>
        </div>
      </section>
      <section class="card">
        <div class="row" style="justify-content:space-between"><h2>المستجدات التنظيمية</h2><span class="link-more" data-goto="library">عرض الكل</span></div>
        <div class="upd-list">
          ${regUpdates.length ? regUpdates.map((r) => `<div class="upd-item" data-goto="library">
            <span class="upd-ic">${icon("book", 18)}</span>
            <div class="upd-body"><div class="upd-title">${esc(r.title || r.code)}</div><div class="upd-date">${fmtDate(r.createdAt) || "—"}</div></div>
          </div>`).join("") : '<p class="muted">لا توجد إضافات حديثة</p>'}
        </div>
      </section>
    </div>

    <!-- مراقبة الالتزام + المهام القادمة + إجراءات سريعة -->
    <div class="dash-grid mid-layout">
      <section class="card">
        <h2>مراقبة الالتزام</h2>
        ${gaugeChart(compScore, { label: "الالتزام العام", sub: "", size: 190 })}
        <div class="ov-legend">${monLegend}</div>
      </section>
      <section class="card">
        <div class="row" style="justify-content:space-between"><h2>المهام القادمة</h2><span class="link-more" data-goto="findings">عرض الكل</span></div>
        <div class="task-list">
          ${upcoming.length ? upcoming.map((e) => `<div class="task-item ${e.overdue ? "overdue" : ""}" data-goto="${e.view}" title="${esc(e.tip)}">
            <span class="task-ic">${icon(e.ic, 16)}</span>
            <div class="task-body"><div class="task-title">${esc(e.tip)}</div></div>
            <span class="task-date">${fmtDate(e.date)}</span>
          </div>`).join("") : '<p class="muted">لا توجد استحقاقات قريبة ✅</p>'}
        </div>
      </section>
      <section class="card">
        <h2>إجراءات سريعة</h2>
        <div class="qa-grid">
          <button class="qa" data-goto="risks"><span class="qa-ic">${icon("plus")}</span>إضافة خطر</button>
          <button class="qa" data-goto="findings"><span class="qa-ic">${icon("alert")}</span>تسجيل ملاحظة</button>
          <button class="qa" data-goto="training"><span class="qa-ic">${icon("calendar")}</span>جدولة تدريب</button>
          <button class="qa" data-goto="library"><span class="qa-ic">${icon("doc")}</span>طلب سياسة</button>
        </div>
      </section>
    </div>

    <!-- الأثر المالي -->
    <div class="stats">
      ${statTile(fmtSAR(expectedFines), "الغرامات المتوقعة — مخاطر قائمة", levelBadge(expectedFines > 0 ? "HIGH" : "LOW", "قيمة مقدّرة من الأنظمة المحلَّلة"))}
      ${statTile(fmtSAR(avoidedFines), "الغرامات المتجنَّبة — مخاطر معالجة", levelBadge("LOW", "أثر جهود الالتزام"))}
      ${statTile(activeReqs.length, "المتطلبات النظامية", `${critReqs} حرجة`)}
      ${statTile(`${Math.round(planAvg)}%`, `إنجاز خطة ${year}`, `${planYear.length} مبادرة`)}
    </div>

    <h2 class="section-title">تحليلات تفصيلية</h2>

    <div class="grid-2">
      <section class="card">
        <h2>خريطة المخاطر الكامنة (قبل الضوابط)</h2>
        <p class="muted">انقر أي خلية للانتقال إلى سجل المخاطر</p>
        ${riskHeatmap(s.risks, { residual: false })}
      </section>
      <section class="card">
        <h2>خريطة المخاطر المتبقية (بعد الضوابط)</h2>
        <p class="muted">توزيع المخاطر بعد تطبيق الضوابط الحالية</p>
        ${riskHeatmap(s.risks, { residual: true })}
      </section>
    </div>

    <section class="card">
      <div class="row" style="justify-content:space-between">
        <h2>${icon("calendar", 20)} تقويم الالتزام — ${MONTH_NAMES[calState.m]} ${calState.y}</h2>
        <div class="row">
          <button class="secondary small" id="cal-prev" title="عرض الشهر السابق">›</button>
          <button class="secondary small" id="cal-today" title="العودة إلى الشهر الحالي">اليوم</button>
          <button class="secondary small" id="cal-next" title="عرض الشهر التالي">‹</button>
        </div>
      </div>
      <p class="muted">مراجعات المتطلبات 📖 · نهايات المراقبة 🔍 · استحقاقات المخاطر ⚠ · خطط التصحيح 🛠 · الفحص الذاتي 📋 · الاجتماعات 🗓 — الأحمر متأخر</p>
      ${monthCalendar(calState.y, calState.m, calendarEventsEmoji())}
    </section>

    <div class="grid-2">
      <section class="card">
        <h2>نتائج أنشطة المراقبة المنفذة</h2>
        ${donutChart([
          { label: MON_RESULT.COMPLIANT, count: monResults.COMPLIANT, color: roleColor("good") },
          { label: MON_RESULT.PARTIAL, count: monResults.PARTIAL, color: roleColor("warning") },
          { label: MON_RESULT.NON_COMPLIANT, count: monResults.NON_COMPLIANT, color: roleColor("critical") },
        ], { unit: "نشاط" })}
      </section>
      <section class="card">
        <h2>فعالية الضوابط المسجلة (${allControls.length})</h2>
        ${donutChart([
          { label: "فعّال", count: allControls.filter((c) => c.effectiveness === "فعّال").length, color: roleColor("good") },
          { label: "فعّال جزئيًا", count: allControls.filter((c) => c.effectiveness === "فعّال جزئيًا").length, color: roleColor("warning") },
          { label: "غير فعّال", count: allControls.filter((c) => c.effectiveness === "غير فعّال").length, color: roleColor("critical") },
        ], { unit: "ضابط" })}
        <h3 style="margin-top:16px">الضوابط حسب النوع</h3>
        ${allControls.length ? hBars(ctlTypes) : '<p class="muted">لا توجد ضوابط بعد</p>'}
      </section>
    </div>

    <div class="grid-2">
      <section class="card">
        <h2>أهمية المتطلبات النشطة</h2>
        ${donutChart(
          Object.entries(CRITICALITY).map(([k, label]) => ({
            label, count: activeReqs.filter((r) => r.criticality === k).length,
            color: roleColor({ CRITICAL: "critical", HIGH: "serious", MEDIUM: "warning", LOW: "good" }[k]),
          })), { unit: "متطلب" }
        )}
      </section>
      <section class="card">
        <h2>الملاحظات المفتوحة حسب الخطورة</h2>
        ${donutChart(
          Object.entries(FND_SEVERITY).map(([k, label]) => ({
            label, count: openFindings.filter((f) => f.severity === k).length,
            color: roleColor({ CRITICAL: "critical", HIGH: "serious", MEDIUM: "warning", LOW: "good" }[k]),
          })).reverse(), { unit: "ملاحظة" }
        )}
        <h3 style="margin-top:16px">اتجاه متوسط نضج التجمعات</h3>
        ${maturityTrendPoints(s.maturity).length > 1
          ? trendChart(maturityTrendPoints(s.maturity), { unit: "%", color: "#22d6a6" })
          : '<p class="muted">يظهر الاتجاه عند توفّر تقييمات نضج لفترتين أو أكثر</p>'}
      </section>
    </div>

    <section class="card">
      <h2>${icon("alert", 20)} تنبيهات تتطلب انتباهك (${alerts.length})</h2>
      ${alerts.length
        ? `<ul class="alert-list">${alerts.slice(0, 12).map((a) => `<li class="${a.overdue ? "overdue" : ""}" data-goto="${a.view}"><span class="task-ic">${icon(a.ic, 15)}</span> ${esc(a.text)}</li>`).join("")}</ul>`
        : '<p class="muted">لا توجد تنبيهات حالياً — كل شيء تحت السيطرة ✅</p>'}
    </section>

    <section class="card">
      <h2>الفحوصات الذاتية قيد المتابعة</h2>
      ${saPending.length
        ? `<div style="overflow-x:auto"><table><thead><tr><th>الفحص</th><th>الإدارة</th><th>الاستحقاق</th><th>الحالة</th></tr></thead><tbody>
          ${saPending.map((a) => `<tr data-goto="assessments" style="cursor:pointer">
            <td>${esc(a.title)}</td><td>${esc(deptName(a.departmentId))}</td>
            <td>${fmtDate(a.dueDate)}</td><td>${esc(SA_STATUS[a.status] || a.status)}</td></tr>`).join("")}
        </tbody></table></div>`
        : '<p class="muted">لا توجد فحوصات معلقة.</p>'}
    </section>`;

  el.querySelectorAll("[data-goto]").forEach((n) => n.addEventListener("click", () => nav(n.dataset.goto)));
  el.querySelectorAll(".heatmap [data-cell]").forEach((td) => td.addEventListener("click", () => nav("risks")));
  el.querySelectorAll(".cal-ev[data-nav]").forEach((ev) => ev.addEventListener("click", () => nav(ev.dataset.nav)));
  const rerender = () => renderDashboard(el, nav);
  el.querySelector("#dash-dept")?.addEventListener("change", (e) => { dashFilter.dept = e.target.value; rerender(); });
  el.querySelector("#dash-year")?.addEventListener("change", (e) => { dashFilter.year = e.target.value; rerender(); });
  el.querySelector("#dash-clear")?.addEventListener("click", () => { dashFilter.dept = ""; dashFilter.year = ""; rerender(); });
  const shift = (d) => { const x = new Date(calState.y, calState.m + d, 1); calState.y = x.getFullYear(); calState.m = x.getMonth(); rerender(); };
  el.querySelector("#cal-prev")?.addEventListener("click", () => shift(-1));
  el.querySelector("#cal-next")?.addEventListener("click", () => shift(1));
  el.querySelector("#cal-today")?.addEventListener("click", () => { calState.y = new Date().getFullYear(); calState.m = new Date().getMonth(); rerender(); });
}
