// لوحة التحكم التنفيذية — مؤشرات الالتزام العامة والتنبيهات
import { store, deptName } from "../state.js";
import {
  esc, statTile, distBar, progressBar, fmtDate, daysUntil, levelBadge,
  donutStat, riskHeatmap, hBars, monthCalendar, MONTH_NAMES, fmtSAR,
} from "../ui.js";
import { riskLevel, CRITICALITY, FND_SEVERITY, MON_RESULT, SA_STATUS, CONTROL_TYPES } from "../meta.js";

// شهر التقويم المعروض — يبقى بين عمليات إعادة الرسم
const calState = { y: new Date().getFullYear(), m: new Date().getMonth() };

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

// الأرباع الأربعة الأخيرة وعدد الملاحظات المنشأة في كل ربع (والمفتوح منها)
function findingsByQuarter() {
  const now = new Date();
  const out = [];
  for (let i = 3; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i * 3, 1);
    const q = Math.floor(d.getMonth() / 3);
    const start = new Date(d.getFullYear(), q * 3, 1).toISOString();
    const end = new Date(d.getFullYear(), q * 3 + 3, 1).toISOString();
    const inQ = store.findings.filter((f) => f.createdAt >= start && f.createdAt < end);
    out.push({
      label: `الربع ${q + 1} — ${d.getFullYear()}`,
      count: inQ.length,
      tip: `${inQ.length} ملاحظة أُنشئت، منها ${inQ.filter((f) => f.status !== "CLOSED").length} ما تزال مفتوحة`,
    });
  }
  return out;
}

export function renderDashboard(el, nav) {
  const s = store;

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

  el.innerHTML = `
    <div class="page-head"><h1>لوحة التحكم</h1><p class="muted">مؤشرات الالتزام العامة — ${new Date().toLocaleDateString("ar-SA-u-ca-gregory-nu-latn", { dateStyle: "long" })}</p></div>

    <div class="stats">
      ${donutStat(compScore, "نسبة الالتزام العامة", compScore === null ? "" : `من ${scoreParts.length} نتيجة مراقبة وفحص ذاتي`)}
      ${statTile(activeReqs.length, "المتطلبات النظامية", `${critReqs} ${esc("حرجة")}`)}
      ${statTile(s.risks.length, "مخاطر الالتزام", levelBadge("CRITICAL", `${riskCounts.CRITICAL + riskCounts.HIGH} عالية فأكثر`))}
      ${statTile(`${monTotal ? Math.round((monDone / monTotal) * 100) : 0}%`, "إنجاز برنامج المراقبة", `${monDone} من ${monTotal} نشاطاً`)}
      ${statTile(openFindings.length, "ملاحظات مفتوحة", levelBadge(highFindings ? "HIGH" : "LOW", `${highFindings} عالية الخطورة`))}
      ${statTile(`${Math.round(planAvg)}%`, `إنجاز خطة ${year}`, `${planYear.length} مبادرة`)}
      ${statTile(`${saTotal ? Math.round((saDone / saTotal) * 100) : 0}%`, "الفحص الذاتي المكتمل", `${saPending.length} بانتظار الإدارات`)}
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
        ${distBar([
          { label: "حرج", count: riskCounts.CRITICAL, role: "critical" },
          { label: "عالٍ", count: riskCounts.HIGH, role: "serious" },
          { label: "متوسط", count: riskCounts.MEDIUM, role: "warning" },
          { label: "منخفض", count: riskCounts.LOW, role: "good" },
        ])}
      </section>
      <section class="card">
        <h2>نتائج أنشطة المراقبة المنفذة</h2>
        ${distBar([
          { label: MON_RESULT.COMPLIANT, count: monResults.COMPLIANT, role: "good" },
          { label: MON_RESULT.PARTIAL, count: monResults.PARTIAL, role: "warning" },
          { label: MON_RESULT.NON_COMPLIANT, count: monResults.NON_COMPLIANT, role: "critical" },
        ])}
      </section>
    </div>

    <div class="grid-2">
      <section class="card">
        <h2>فعالية الضوابط المسجلة (${allControls.length})</h2>
        ${distBar([
          { label: "فعّال", count: allControls.filter((c) => c.effectiveness === "فعّال").length, role: "good" },
          { label: "فعّال جزئيًا", count: allControls.filter((c) => c.effectiveness === "فعّال جزئيًا").length, role: "warning" },
          { label: "غير فعّال", count: allControls.filter((c) => c.effectiveness === "غير فعّال").length, role: "critical" },
        ])}
        <h2 style="margin-top:18px">الضوابط حسب النوع</h2>
        ${allControls.length ? hBars(ctlTypes) : '<p class="muted">لا توجد ضوابط بعد</p>'}
      </section>
      <section class="card">
        <h2>الملاحظات المنشأة حسب الربع (آخر سنة)</h2>
        ${hBars(findingsByQuarter())}
      </section>
    </div>

    <div class="grid-2">
      <section class="card">
        <h2>أهمية المتطلبات النشطة</h2>
        ${distBar(
          Object.entries(CRITICALITY).map(([k, label]) => ({
            label,
            count: activeReqs.filter((r) => r.criticality === k).length,
            role: { CRITICAL: "critical", HIGH: "serious", MEDIUM: "warning", LOW: "good" }[k],
          }))
        )}
      </section>
      <section class="card">
        <h2>الملاحظات المفتوحة حسب الخطورة</h2>
        ${distBar(
          Object.entries(FND_SEVERITY).map(([k, label]) => ({
            label,
            count: openFindings.filter((f) => f.severity === k).length,
            role: { CRITICAL: "critical", HIGH: "serious", MEDIUM: "warning", LOW: "good" }[k],
          })).reverse()
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
