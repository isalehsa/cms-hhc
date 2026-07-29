// لوحة التحكم التنفيذية — مؤشرات الالتزام العامة والتنبيهات
import { store, deptName, deptOptions } from "../state.js";
import {
  esc, statTile, progressBar, fmtDate, daysUntil, levelBadge, sel,
  donutStat, donutChart, gaugeChart, trendChart, riskHeatmap, hBars, monthCalendar, MONTH_NAMES, fmtSAR,
} from "../ui.js";
import { riskLevel, CRITICALITY, FND_SEVERITY, MON_RESULT, SA_STATUS, CONTROL_TYPES, STATUS_COLORS } from "../meta.js";

const roleColor = (role) => STATUS_COLORS[role] || STATUS_COLORS.neutral;

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

// أحداث تقويم الالتزام من جميع الوحدات: مراجعات المتطلبات، نهايات المراقبة، استحقاقات المخاطر والملاحظات والفحوصات
function calendarEvents() {
  const evs = [];
  const today = new Date().toISOString().slice(0, 10);
  const add = (iso, icon, label, tip, view) => {
    if (!iso) return;
    const date = String(iso).slice(0, 10);
    evs.push({ date, icon, label, tip, view, overdue: date < today });
  };
  for (const r of store.requirements) if (r.status !== "CANCELLED") add(r.nextReviewDate, "📖", r.code, `مراجعة المتطلب: ${r.code} — ${r.title}`, "library");
  for (const m of store.monitoring) if (!["COMPLETED", "CLOSED"].includes(m.status)) add(m.endDate, "🔍", m.code, `نهاية نشاط المراقبة: ${m.code} — ${m.name}`, "monitoring");
  for (const r of store.risks) if (["OPEN", "IN_TREATMENT"].includes(r.status)) add(r.dueDate, "⚠", r.code, `استحقاق معالجة الخطر: ${r.code} — ${r.title}`, "risks");
  for (const f of store.findings) if (f.status !== "CLOSED") add(f.dueDate, "🛠", f.code, `استحقاق خطة التصحيح: ${f.code} — ${f.title}`, "findings");
  for (const a of store.assessments) if (["SENT", "SUBMITTED"].includes(a.status)) add(a.dueDate, "📋", "فحص", `استحقاق الفحص الذاتي: ${a.title}`, "assessments");
  for (const c of store.correspondence) if (c.status === "OPEN") add(c.dueDate, "📨", c.code, `استحقاق الرد على المراسلة: ${c.code} — ${c.subject}`, "correspondence");
  for (const t of store.trainings) if (["PLANNED", "IN_PROGRESS"].includes(t.status)) add(t.dueDate || t.date, "🎓", t.code, `نشاط تدريب/توعية: ${t.code} — ${t.title}`, "training");
  return evs;
}

// اتجاه الملاحظات المنشأة حسب الربع (آخر 6 أرباع) — يعيد نقاطاً للمخطط الخطي {label, value}
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

  // مؤشرات المتطلبات
  const activeReqs = s.requirements.filter((r) => r.status !== "CANCELLED");
  const critReqs = activeReqs.filter((r) => r.criticality === "CRITICAL").length;

  // المخاطر حسب المستوى (بعد الضوابط إن وُجد تقييم متبقٍ)
  const riskCounts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
  for (const r of s.risks) {
    const lvl = riskLevel(r.residualLikelihood ?? r.likelihood, r.residualImpact ?? r.impact);
    riskCounts[lvl.key]++;
  }

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

  // الخطة السنوية
  const year = new Date().getFullYear();
  const planYear = s.planItems.filter((p) => p.year === year);
  const planAvg = planYear.length
    ? planYear.reduce((sum, p) => sum + (p.progress || 0), 0) / planYear.length
    : 0;

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
  const compScore = scoreParts.length ? scoreParts.reduce((x, y) => x + y, 0) / scoreParts.length : null;

  // التقدير المالي للغرامات من سجل المخاطر
  const expectedFines = s.risks.filter((r) => ["OPEN", "IN_TREATMENT"].includes(r.status)).reduce((sum, r) => sum + (r.fineAmount || 0), 0);
  const avoidedFines = s.risks.filter((r) => ["TREATED", "CLOSED", "ACCEPTED"].includes(r.status)).reduce((sum, r) => sum + (r.fineAmount || 0), 0);

  // الضوابط المسجلة على المخاطر: التوزيع حسب النوع والفعالية
  const allControls = s.risks.flatMap((r) => r.controls || []);
  const ctlTypes = CONTROL_TYPES.map((t) => ({ label: t, count: allControls.filter((c) => c.type === t).length }));
  const untyped = allControls.filter((c) => !c.type).length;
  if (untyped) ctlTypes.push({ label: "غير مصنف", count: untyped });

  // التنبيهات: متطلبات تستحق مراجعة خلال 30 يوماً أو متأخرة، خطط تصحيح متأخرة، فحوصات متأخرة
  const alerts = [];
  for (const r of activeReqs) {
    const d = daysUntil(r.nextReviewDate);
    if (d !== null && d <= 30) {
      alerts.push({
        icon: "📖",
        text: `${r.code} — ${r.title}: ${d < 0 ? `تأخرت مراجعته ${-d} يوماً` : `مراجعته تستحق خلال ${d} يوماً`}`,
        view: "library",
        overdue: d < 0,
      });
    }
  }
  for (const f of openFindings) {
    const d = daysUntil(f.dueDate);
    if (d !== null && d <= 14) {
      alerts.push({
        icon: "🛠",
        text: `${f.code} — ${f.title}: ${d < 0 ? `خطة التصحيح متأخرة ${-d} يوماً` : `تستحق خلال ${d} يوماً`}`,
        view: "findings",
        overdue: d < 0,
      });
    }
  }
  for (const a of saPending) {
    const d = daysUntil(a.dueDate);
    if (d !== null && d <= 7) {
      alerts.push({
        icon: "📋",
        text: `${a.title} (${deptName(a.departmentId)}): ${d < 0 ? `متأخر ${-d} يوماً` : `يستحق خلال ${d} يوماً`}`,
        view: "assessments",
        overdue: d < 0,
      });
    }
  }
  for (const c of s.correspondence.filter((x) => x.status === "OPEN")) {
    const d = daysUntil(c.dueDate);
    if (d !== null && d <= 7) {
      alerts.push({
        icon: "📨",
        text: `${c.code} — ${c.subject}: ${d < 0 ? `الرد متأخر ${-d} يوماً` : `الرد مستحق خلال ${d} يوماً`}`,
        view: "correspondence",
        overdue: d < 0,
      });
    }
  }
  alerts.sort((a, b) => (b.overdue ? 1 : 0) - (a.overdue ? 1 : 0));

  const years = availableYears();
  const activeFilter = dashFilter.dept || dashFilter.year;
  el.innerHTML = `
    <div class="page-head">
      <div><h1>لوحة التحكم</h1><p class="muted">مؤشرات الالتزام العامة — ${new Date().toLocaleDateString("ar-SA-u-ca-gregory-nu-latn", { dateStyle: "long" })}</p></div>
      <div class="row" style="gap:8px;flex-wrap:wrap;align-items:center">
        ${sel("dash-dept", deptOptions(), dashFilter.dept, { empty: "كل الإدارات والتجمعات" })}
        ${sel("dash-year", years.map((y) => ({ id: y, name: y })), dashFilter.year, { empty: "كل السنوات" })}
        ${activeFilter ? '<button class="secondary small" id="dash-clear" title="إلغاء الفلاتر">✕ مسح</button>' : ""}
      </div>
    </div>
    ${activeFilter ? `<p class="muted" style="margin:-4px 0 10px">مُصفّى: ${dashFilter.dept ? esc(deptName(dashFilter.dept)) : "كل الإدارات"}${dashFilter.year ? " · سنة " + esc(dashFilter.year) : ""}</p>` : ""}

    <div class="grid-2" style="align-items:stretch">
      <section class="card" style="display:flex;flex-direction:column;justify-content:center">
        <h2 style="text-align:center">نسبة الالتزام العامة</h2>
        ${gaugeChart(compScore, { label: "", sub: compScore === null ? "لا توجد نتائج بعد" : `من ${scoreParts.length} نتيجة مراقبة وفحص ذاتي` })}
      </section>
      <section class="card">
        <div class="stats" style="margin:0">
          ${statTile(activeReqs.length, "المتطلبات النظامية", `${critReqs} ${esc("حرجة")}`)}
          ${statTile(s.risks.length, "مخاطر الالتزام", levelBadge("CRITICAL", `${riskCounts.CRITICAL + riskCounts.HIGH} عالية فأكثر`))}
          ${statTile(`${monTotal ? Math.round((monDone / monTotal) * 100) : 0}%`, "إنجاز المراقبة", `${monDone} من ${monTotal}`)}
          ${statTile(openFindings.length, "ملاحظات مفتوحة", levelBadge(highFindings ? "HIGH" : "LOW", `${highFindings} عالية الخطورة`))}
          ${statTile(`${Math.round(planAvg)}%`, `إنجاز خطة ${year}`, `${planYear.length} مبادرة`)}
          ${statTile(`${saTotal ? Math.round((saDone / saTotal) * 100) : 0}%`, "الفحص الذاتي المكتمل", `${saPending.length} بانتظار`)}
        </div>
      </section>
    </div>

    <div class="stats">
      ${statTile(fmtSAR(expectedFines), "الغرامات المتوقعة — مخاطر قائمة", levelBadge(expectedFines > 0 ? "HIGH" : "LOW", "قيمة مقدّرة من الأنظمة المحلَّلة"))}
      ${statTile(fmtSAR(avoidedFines), "الغرامات المتجنَّبة — مخاطر معالجة", levelBadge("LOW", "أثر جهود الالتزام"))}
    </div>

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
        <h2>📅 تقويم الالتزام — ${MONTH_NAMES[calState.m]} ${calState.y}</h2>
        <div class="row">
          <button class="secondary small" id="cal-prev" title="عرض الشهر السابق">›</button>
          <button class="secondary small" id="cal-today" title="العودة إلى الشهر الحالي">اليوم</button>
          <button class="secondary small" id="cal-next" title="عرض الشهر التالي">‹</button>
        </div>
      </div>
      <p class="muted">مراجعات المتطلبات 📖 · نهايات المراقبة 🔍 · استحقاقات المخاطر ⚠ · خطط التصحيح 🛠 · الفحص الذاتي 📋 — الأحمر متأخر</p>
      ${monthCalendar(calState.y, calState.m, calendarEvents())}
    </section>

    <div class="grid-2">
      <section class="card">
        <h2>المخاطر حسب المستوى (بعد الضوابط)</h2>
        ${donutChart([
          { label: "حرج", count: riskCounts.CRITICAL, color: roleColor("critical") },
          { label: "عالٍ", count: riskCounts.HIGH, color: roleColor("serious") },
          { label: "متوسط", count: riskCounts.MEDIUM, color: roleColor("warning") },
          { label: "منخفض", count: riskCounts.LOW, color: roleColor("good") },
        ], { unit: "خطر" })}
      </section>
      <section class="card">
        <h2>نتائج أنشطة المراقبة المنفذة</h2>
        ${donutChart([
          { label: MON_RESULT.COMPLIANT, count: monResults.COMPLIANT, color: roleColor("good") },
          { label: MON_RESULT.PARTIAL, count: monResults.PARTIAL, color: roleColor("warning") },
          { label: MON_RESULT.NON_COMPLIANT, count: monResults.NON_COMPLIANT, color: roleColor("critical") },
        ], { unit: "نشاط" })}
      </section>
    </div>

    <div class="grid-2">
      <section class="card">
        <h2>فعالية الضوابط المسجلة (${allControls.length})</h2>
        ${donutChart([
          { label: "فعّال", count: allControls.filter((c) => c.effectiveness === "فعّال").length, color: roleColor("good") },
          { label: "فعّال جزئيًا", count: allControls.filter((c) => c.effectiveness === "فعّال جزئيًا").length, color: roleColor("warning") },
          { label: "غير فعّال", count: allControls.filter((c) => c.effectiveness === "غير فعّال").length, color: roleColor("critical") },
        ], { unit: "ضابط" })}
        <h2 style="margin-top:18px">الضوابط حسب النوع</h2>
        ${allControls.length ? hBars(ctlTypes) : '<p class="muted">لا توجد ضوابط بعد</p>'}
      </section>
      <section class="card">
        <h2>📈 اتجاه الملاحظات المنشأة (آخر 6 أرباع)</h2>
        ${trendChart(findingsByQuarter(s.findings, 6), { unit: " ملاحظة", color: "#ec835a" })}
        <h2 style="margin-top:18px">📊 اتجاه متوسط نضج التجمعات</h2>
        ${maturityTrendPoints(s.maturity).length > 1
          ? trendChart(maturityTrendPoints(s.maturity), { unit: "%", color: "#14705c" })
          : '<p class="muted">يظهر الاتجاه عند توفّر تقييمات نضج لفترتين أو أكثر</p>'}
      </section>
    </div>

    <div class="grid-2">
      <section class="card">
        <h2>أهمية المتطلبات النشطة</h2>
        ${donutChart(
          Object.entries(CRITICALITY).map(([k, label]) => ({
            label,
            count: activeReqs.filter((r) => r.criticality === k).length,
            color: roleColor({ CRITICAL: "critical", HIGH: "serious", MEDIUM: "warning", LOW: "good" }[k]),
          })), { unit: "متطلب" }
        )}
      </section>
      <section class="card">
        <h2>الملاحظات المفتوحة حسب الخطورة</h2>
        ${donutChart(
          Object.entries(FND_SEVERITY).map(([k, label]) => ({
            label,
            count: openFindings.filter((f) => f.severity === k).length,
            color: roleColor({ CRITICAL: "critical", HIGH: "serious", MEDIUM: "warning", LOW: "good" }[k]),
          })).reverse(), { unit: "ملاحظة" }
        )}
      </section>
    </div>

    <section class="card">
      <h2>⚠️ تنبيهات تتطلب انتباهك (${alerts.length})</h2>
      ${
        alerts.length
          ? `<ul class="alert-list">${alerts
              .slice(0, 12)
              .map(
                (a) =>
                  `<li class="${a.overdue ? "overdue" : ""}" data-goto="${a.view}"><span>${a.icon}</span> ${esc(a.text)}</li>`
              )
              .join("")}</ul>`
          : '<p class="muted">لا توجد تنبيهات حالياً — كل شيء تحت السيطرة ✅</p>'
      }
    </section>

    <section class="card">
      <h2>الفحوصات الذاتية قيد المتابعة</h2>
      ${
        saPending.length
          ? `<div style="overflow-x:auto"><table><thead><tr><th>الفحص</th><th>الإدارة</th><th>الاستحقاق</th><th>الحالة</th></tr></thead><tbody>
            ${saPending
              .map(
                (a) => `<tr data-goto="assessments" style="cursor:pointer">
                  <td>${esc(a.title)}</td><td>${esc(deptName(a.departmentId))}</td>
                  <td>${fmtDate(a.dueDate)}</td><td>${esc(SA_STATUS[a.status] || a.status)}</td></tr>`
              )
              .join("")}
          </tbody></table></div>`
          : '<p class="muted">لا توجد فحوصات معلقة.</p>'
      }
    </section>`;

  el.querySelectorAll("[data-goto]").forEach((n) => {
    n.addEventListener("click", () => nav(n.dataset.goto));
  });
  el.querySelectorAll(".heatmap [data-cell]").forEach((td) =>
    td.addEventListener("click", () => nav("risks"))
  );
  el.querySelectorAll(".cal-ev[data-nav]").forEach((ev) =>
    ev.addEventListener("click", () => nav(ev.dataset.nav))
  );
  const rerender = () => renderDashboard(el, nav);
  // فلاتر اللوحة
  el.querySelector("#dash-dept")?.addEventListener("change", (e) => { dashFilter.dept = e.target.value; rerender(); });
  el.querySelector("#dash-year")?.addEventListener("change", (e) => { dashFilter.year = e.target.value; rerender(); });
  el.querySelector("#dash-clear")?.addEventListener("click", () => { dashFilter.dept = ""; dashFilter.year = ""; rerender(); });
  const shift = (d) => {
    const x = new Date(calState.y, calState.m + d, 1);
    calState.y = x.getFullYear();
    calState.m = x.getMonth();
    rerender();
  };
  el.querySelector("#cal-prev")?.addEventListener("click", () => shift(-1));
  el.querySelector("#cal-next")?.addEventListener("click", () => shift(1));
  el.querySelector("#cal-today")?.addEventListener("click", () => {
    calState.y = new Date().getFullYear();
    calState.m = new Date().getMonth();
    rerender();
  });
}
