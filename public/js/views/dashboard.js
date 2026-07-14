// لوحة التحكم التنفيذية — مؤشرات الالتزام العامة والتنبيهات
import { store, deptName } from "../state.js";
import { esc, statTile, distBar, progressBar, fmtDate, daysUntil, levelBadge } from "../ui.js";
import { riskLevel, CRITICALITY, FND_SEVERITY, MON_RESULT, SA_STATUS } from "../meta.js";

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

  // البلاغات والزيارات الميدانية
  const openCases = s.cases.filter((c) => c.status !== "CLOSED");
  const caseClosureRate = s.cases.length ? Math.round(((s.cases.length - openCases.length) / s.cases.length) * 100) : 0;
  const visitsExec = s.visits.length ? Math.round((s.visits.filter((v) => v.status !== "PLANNED").length / s.visits.length) * 100) : 0;

  // الخطة السنوية
  const year = new Date().getFullYear();
  const planYear = s.planItems.filter((p) => p.year === year);
  const planAvg = planYear.length
    ? planYear.reduce((sum, p) => sum + (p.progress || 0), 0) / planYear.length
    : 0;

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
  // بلاغات عالية الأهمية ما زالت قيد التحقيق
  for (const c of openCases) {
    if (["HIGH", "CRITICAL"].includes(c.initialAssessment)) {
      alerts.push({ icon: "📣", text: `${c.code} — ${c.summary}: بلاغ عالي الأهمية قيد التحقيق`, view: "cases", overdue: false });
    }
  }
  // ملاحظات زيارات ميدانية تأخر تنفيذ إجراءاتها
  for (const v of s.visits) {
    for (const o of v.observations || []) {
      if (o.implStatus === "DONE") continue;
      const d = daysUntil(o.implDate);
      if (d !== null && d < 0) {
        alerts.push({ icon: "🏢", text: `${o.code} (${v.site}): تأخر تنفيذ الإجراء التصحيحي ${-d} يوماً`, view: "visits", overdue: true });
      }
    }
  }
  alerts.sort((a, b) => (b.overdue ? 1 : 0) - (a.overdue ? 1 : 0));

  el.innerHTML = `
    <div class="page-head"><h1>لوحة التحكم</h1><p class="muted">مؤشرات الالتزام العامة — ${new Date().toLocaleDateString("ar-SA-u-ca-gregory-nu-latn", { dateStyle: "long" })}</p></div>

    <div class="stats">
      ${statTile(activeReqs.length, "المتطلبات النظامية", `${critReqs} ${esc("حرجة")}`)}
      ${statTile(s.risks.length, "مخاطر الالتزام", levelBadge("CRITICAL", `${riskCounts.CRITICAL + riskCounts.HIGH} عالية فأكثر`))}
      ${statTile(`${monTotal ? Math.round((monDone / monTotal) * 100) : 0}%`, "إنجاز برنامج المراقبة", `${monDone} من ${monTotal} نشاطاً`)}
      ${statTile(openFindings.length, "ملاحظات مفتوحة", levelBadge(highFindings ? "HIGH" : "LOW", `${highFindings} عالية الخطورة`))}
      ${statTile(`${Math.round(planAvg)}%`, `إنجاز خطة ${year}`, `${planYear.length} مبادرة`)}
      ${statTile(openCases.length, "بلاغات قيد التحقيق", `معدل الإغلاق ${caseClosureRate}%`)}
      ${statTile(`${visitsExec}%`, "تنفيذ الزيارات الميدانية", `${s.visits.length} زيارة مخططة`)}
      ${statTile(`${saTotal ? Math.round((saDone / saTotal) * 100) : 0}%`, "الفحص الذاتي المكتمل", `${saPending.length} بانتظار الإدارات`)}
    </div>

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
}
