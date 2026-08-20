// خريطة المخاطر الحرارية — تدمج مستوى الخطر المتبقي (بعد الضوابط) مع نتائج المراقبة الفعلية
// المنطق: نتائج المراقبة دليل ميداني على تحقّق الخطر — عدم الالتزام يرفع احتمالية الخطر،
// والالتزام الكامل يخفضها. تُعرض الخريطة بوضعين (متبقٍ / بعد المراقبة) مع تفصيل حسب الإدارة.
import { store, deptName, riskLabel } from "../state.js";
import {
  $, esc, riskHeatmap, statTile, statusBadgeFrom, levelBadge, emptyMsg, progressBar, hBars,
} from "../ui.js";
import { riskLevel, MON_RESULT } from "../meta.js";

const RES_ROLE = { COMPLIANT: "good", PARTIAL: "warning", NON_COMPLIANT: "critical" };
const RESULT_ORDER = { NON_COMPLIANT: 3, PARTIAL: 2, COMPLIANT: 1 };
const state = { mode: "adjusted", selected: "" };

const clamp = (v) => Math.max(1, Math.min(5, Number(v) || 3));

// المراقبة المرتبطة بخطر: عبر الربط المباشر (riskId) أو عبر متطلبه (requirementId)
function riskMonitoring(risk) {
  const rel = store.monitoring.filter(
    (m) => m.riskId === risk.id || (risk.requirementId && m.requirementId === risk.requirementId)
  );
  const withRes = rel.filter((m) => m.result);
  let worst = null;
  for (const m of withRes) if (!worst || RESULT_ORDER[m.result] > RESULT_ORDER[worst]) worst = m.result;
  return { count: rel.length, withResult: withRes.length, worst };
}

// موضع الخطر بعد دمج نتائج المراقبة
function positionOf(risk, mode) {
  let lik = clamp(risk.residualLikelihood ?? risk.likelihood);
  const imp = clamp(risk.residualImpact ?? risk.impact);
  if (mode === "adjusted") {
    const mon = riskMonitoring(risk);
    if (mon.worst === "NON_COMPLIANT") lik = Math.min(5, lik + 1);
    else if (mon.worst === "COMPLIANT") lik = Math.max(1, lik - 1);
  }
  return { lik, imp };
}

// تحويل المخاطر إلى صيغة تقرؤها خريطة ui (residualLikelihood/Impact) حسب الوضع الحالي
const mapped = (risks, mode) => risks.map((r) => { const p = positionOf(r, mode); return { residualLikelihood: p.lik, residualImpact: p.imp }; });

export function renderRiskMap(el, nav) {
  const risks = store.risks;
  const monitored = risks.filter((r) => riskMonitoring(r).count > 0);
  const materializing = risks.filter((r) => riskMonitoring(r).worst === "NON_COMPLIANT");
  const validated = risks.filter((r) => { const m = riskMonitoring(r); return m.worst === "COMPLIANT"; });

  // مخاطر الخلية المحددة وفق الوضع الحالي
  const inCell = state.selected
    ? risks.filter((r) => { const p = positionOf(r, state.mode); return `${p.lik},${p.imp}` === state.selected; })
    : [];

  // تفصيل حسب الإدارة: عدد المخاطر، العالية فأكثر، ونسبة الالتزام في مراقبتها
  const deptIds = [...new Set(risks.map((r) => r.ownerDeptId).filter(Boolean))];
  const deptRows = deptIds.map((id) => {
    const rs = risks.filter((r) => r.ownerDeptId === id);
    const high = rs.filter((r) => { const p = positionOf(r, state.mode); return ["CRITICAL", "HIGH"].includes(riskLevel(p.lik, p.imp).key); }).length;
    const mons = store.monitoring.filter((m) => m.targetDeptId === id && m.result);
    const compliant = mons.filter((m) => m.result === "COMPLIANT").length;
    const pct = mons.length ? Math.round((compliant / mons.length) * 100) : null;
    return { id, total: rs.length, high, pct, mons: mons.length };
  }).sort((a, b) => b.high - a.high || b.total - a.total);

  el.innerHTML = `
    <div class="page-head">
      <h1>🗺 خريطة المخاطر الحرارية</h1>
      <div class="subtabs">
        <button class="subtab ${state.mode === "residual" ? "active" : ""}" data-mode="residual" title="المخاطر بعد الضوابط فقط">المخاطر المتبقية</button>
        <button class="subtab ${state.mode === "adjusted" ? "active" : ""}" data-mode="adjusted" title="المخاطر المتبقية مدموجة مع نتائج المراقبة الفعلية">بعد نتائج المراقبة</button>
      </div>
    </div>
    <p class="muted">تدمج الخريطة الخطر المتبقي مع أدلة المراقبة: نشاط مراقبة نتيجته «غير ملتزم» يرفع احتمالية الخطر درجة، و«ملتزم» يخفضها درجة. انقر أي خلية لعرض مخاطرها.</p>

    <div class="stats">
      ${statTile(risks.length, "إجمالي المخاطر")}
      ${statTile(`${risks.length ? Math.round((monitored.length / risks.length) * 100) : 0}%`, "مغطّاة بالمراقبة", `${monitored.length} من ${risks.length}`)}
      ${statTile(materializing.length, "مخاطر متحقّقة", levelBadge(materializing.length ? "CRITICAL" : "LOW", "مراقبتها أظهرت عدم التزام"))}
      ${statTile(validated.length, "مخاطر مضبوطة", levelBadge("LOW", "مراقبتها أظهرت التزاماً كاملاً"))}
    </div>

    <div class="grid-2">
      <section class="card">
        <h2>الخريطة الحرارية — ${state.mode === "adjusted" ? "بعد نتائج المراقبة" : "المخاطر المتبقية"}</h2>
        ${riskHeatmap(mapped(risks, state.mode), { residual: true, selected: state.selected })}
        <p class="muted">المحور الأفقي: الاحتمالية · العمودي: الأثر</p>
      </section>
      <section class="card">
        <h2>${state.selected ? `مخاطر الخلية المحددة (${inCell.length})` : "المخاطر المتحقّقة (مراقبة غير ملتزمة)"}</h2>
        ${renderRiskList(state.selected ? inCell : materializing)}
      </section>
    </div>

    <section class="card">
      <h2>توزّع المخاطر العالية فأكثر حسب الإدارة</h2>
      ${deptRows.length ? hBars(deptRows.filter((d) => d.high > 0).map((d) => ({ label: deptName(d.id), count: d.high, tip: `${d.high} خطر عالٍ فأكثر من ${d.total}` }))) : emptyMsg("لا توجد بيانات")}
    </section>

    <section class="card">
      <h2>لوحة الإدارات: المخاطر مقابل الالتزام في المراقبة</h2>
      <div style="overflow-x:auto">
        <table>
          <thead><tr><th>الإدارة</th><th>إجمالي المخاطر</th><th>عالية فأكثر</th><th>أنشطة مراقبة بنتيجة</th><th>نسبة الالتزام</th></tr></thead>
          <tbody>
            ${deptRows.map((d) => `<tr>
              <td><strong>${esc(deptName(d.id))}</strong></td>
              <td>${d.total}</td>
              <td>${d.high ? levelBadge("HIGH", String(d.high)) : "0"}</td>
              <td class="muted">${d.mons}</td>
              <td style="min-width:130px">${d.pct === null ? '<span class="muted">لا توجد</span>' : progressBar(d.pct)}</td>
            </tr>`).join("") || `<tr><td colspan="5">${emptyMsg("لا توجد مخاطر مرتبطة بإدارات")}</td></tr>`}
          </tbody>
        </table>
      </div>
    </section>`;

  el.querySelectorAll("[data-mode]").forEach((b) =>
    b.addEventListener("click", () => { state.mode = b.dataset.mode; renderRiskMap(el, nav); })
  );
  el.querySelectorAll(".heatmap [data-cell]").forEach((td) =>
    td.addEventListener("click", () => { state.selected = state.selected === td.dataset.cell ? "" : td.dataset.cell; renderRiskMap(el, nav); })
  );
  el.querySelectorAll("[data-risk]").forEach((n) =>
    n.addEventListener("click", () => nav("risks"))
  );
}

function renderRiskList(risks) {
  if (!risks.length) return emptyMsg(state.selected ? "لا توجد مخاطر في هذه الخلية" : "لا توجد مخاطر متحقّقة — نتائج المراقبة ضمن الالتزام ✅");
  return `<div class="link-list">${risks.slice(0, 25).map((r) => {
    const p = positionOf(r, state.mode);
    const lvl = riskLevel(p.lik, p.imp);
    const mon = riskMonitoring(r);
    return `<div class="link-item" data-risk="${r.id}" style="display:flex;justify-content:space-between;gap:8px;align-items:center">
      <span><strong>${esc(r.code)}</strong> ${esc((r.title || "").slice(0, 60))}</span>
      <span class="row" style="gap:6px">
        ${levelBadge(lvl.key, lvl.label)}
        ${mon.worst ? statusBadgeFrom(MON_RESULT, mon.worst, RES_ROLE) : '<span class="muted" style="font-size:0.76rem">بلا مراقبة</span>'}
      </span>
    </div>`;
  }).join("")}${risks.length > 25 ? `<p class="muted">و${risks.length - 25} خطراً آخر…</p>` : ""}</div>`;
}
