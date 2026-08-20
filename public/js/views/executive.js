// اللوحة التنفيذية — سلاسل زمنية لمؤشرات الأداء مع مستهدفات وعتبات ومؤشر انحراف (RAG)
// اللقطات تُلتقط يومياً في metricSnapshots؛ المستهدفات تُهيّأ وتُحفظ في appConfig/kpiTargets.
import { store } from "../state.js";
import * as db from "../db.js";
import { $, esc, toast, modal, fld, val, spinnerHtml, fmtDate, kpiSpark, statusBadgeFrom } from "../ui.js";
import { KPIS, currentValues, ragRole, deviation, captureSnapshot, loadSnapshots, loadTargets, saveTargets } from "../metrics.js";
import { canEdit } from "../auth.js";

const RAG_LABELS = { good: "ضمن المستهدف", warning: "قريب من المستهدف", critical: "دون المستهدف", neutral: "لا بيانات" };
const RANGES = { 30: "٣٠ يوماً", 90: "٩٠ يوماً", 180: "١٨٠ يوماً" };
const state = { days: 90 };

const fmtVal = (v, unit) => (v === null || v === undefined ? "—" : `${v}${unit || ""}`);

// آخر قيمتين غير فارغتين في السلسلة لحساب اتجاه التغيّر
function lastTwo(points) {
  const vals = points.filter((p) => p.value !== null && p.value !== undefined);
  return { last: vals.at(-1)?.value ?? null, prev: vals.at(-2)?.value ?? null };
}

export async function renderExecutive(el, nav, refresh) {
  const editable = canEdit(store.user);
  el.innerHTML = spinnerHtml("جاري تجهيز السلاسل الزمنية…");

  if (editable) await captureSnapshot().catch(() => {}); // لقطة اليوم قبل العرض (idempotent)
  const [snaps, cfg] = await Promise.all([loadSnapshots(state.days), loadTargets()]);
  const live = currentValues();

  const cards = KPIS.map((kpi) => {
    const points = snaps.map((s) => ({ date: s.date, value: s.values?.[kpi.key] ?? null }));
    const kcfg = cfg[kpi.key] || {};
    const target = kcfg.target ?? kpi.target;
    // القيمة الحالية: آخر لقطة إن وُجدت وإلا الحساب اللحظي
    const { last, prev } = lastTwo(points);
    const cur = last ?? live[kpi.key] ?? null;
    const role = ragRole(kpi, cur, kcfg);
    const dev = deviation(kpi, cur, kcfg);
    const devSign = dev === null ? "" : dev > 0 ? "+" : "";
    // اتجاه التغيّر عن اللقطة السابقة (بحسب كون الأعلى أفضل)
    let trend = "";
    if (last !== null && prev !== null && last !== prev) {
      const up = last > prev;
      const goodDir = kpi.higherBetter ? up : !up;
      trend = `<span class="trend ${goodDir ? "trend-up" : "trend-down"}" title="مقارنة بآخر لقطة">${up ? "▲" : "▼"} ${Math.abs(last - prev)}${kpi.unit}</span>`;
    }
    return `<section class="card kpi-card">
      <div class="row" style="justify-content:space-between;align-items:flex-start">
        <h2 style="margin:0;font-size:1rem">${esc(kpi.label)}</h2>
        ${statusBadgeFrom(RAG_LABELS, role, { good: "good", warning: "warning", critical: "critical", neutral: "neutral" })}
      </div>
      <div class="kpi-value">${fmtVal(cur, kpi.unit)} ${trend}</div>
      <div class="muted kpi-meta">المستهدف: ${fmtVal(target, kpi.unit)}${dev === null ? "" : ` · الانحراف: <b style="color:var(--st-${role === "neutral" ? "neutral" : role})">${devSign}${dev}${kpi.unit}</b>`}</div>
      ${kpiSpark(points, { role, target })}
    </section>`;
  }).join("");

  el.innerHTML = `
    <div class="page-head">
      <h1>📈 اللوحة التنفيذية</h1>
      <div class="row">
        <select id="ex-range" title="نطاق السلسلة الزمنية">${Object.entries(RANGES).map(([d, lbl]) => `<option value="${d}" ${Number(d) === state.days ? "selected" : ""}>${lbl}</option>`).join("")}</select>
        ${editable ? '<button class="secondary" id="ex-config" title="ضبط المستهدفات والعتبات لكل مؤشر">⚙ المستهدفات</button>' : ""}
      </div>
    </div>
    <p class="muted">مؤشرات الأداء مقابل مستهدفاتها — أخضر ضمن المستهدف، أصفر قريب منه، أحمر دونه. الخط المتقطّع يمثّل المستهدف. تُلتقط لقطة يومياً لبناء الاتجاه.</p>
    ${snaps.length < 2 ? '<section class="card"><p class="muted">📊 يبدأ الاتجاه الزمني بالظهور بعد تراكم لقطتين يوميتين أو أكثر — القيم الحالية معروضة الآن، وتُلتقط لقطة تلقائياً كل يوم عند دخول المحررين.</p></section>' : ""}
    <div class="kpi-grid">${cards}</div>
    <p class="muted">آخر لقطة: ${snaps.length ? fmtDate(snaps.at(-1).date) : "—"} · عدد اللقطات في النطاق: ${snaps.length}</p>`;

  const rerender = () => renderExecutive(el, nav, refresh);
  $("#ex-range", el).onchange = (e) => { state.days = Number(e.target.value); rerender(); };
  $("#ex-config", el)?.addEventListener("click", () => openTargetsConfig(cfg, rerender));
}

async function openTargetsConfig(cfg, done) {
  const ov = modal(`
    <h2>⚙ مستهدفات وعتبات المؤشرات</h2>
    <p class="muted">لكل مؤشر: المستهدف (اللون الأخضر عنده أو أفضل) والعتبة (حدّ اللون الأصفر). المؤشرات التي «الأقل أفضل» يكون المستهدف حدّاً أعلى.</p>
    <div style="overflow-x:auto">
      <table><thead><tr><th>المؤشر</th><th>الاتجاه</th><th>المستهدف</th><th>عتبة التحذير</th></tr></thead><tbody>
        ${KPIS.map((k) => {
          const c = cfg[k.key] || {};
          return `<tr>
            <td><strong>${esc(k.label)}</strong></td>
            <td class="muted">${k.higherBetter ? "الأعلى أفضل" : "الأقل أفضل"}</td>
            <td><input type="number" id="t-${k.key}" value="${esc(c.target ?? k.target)}" style="width:90px" /></td>
            <td><input type="number" id="a-${k.key}" value="${esc(c.amber ?? k.amber)}" style="width:90px" /></td>
          </tr>`;
        }).join("")}
      </tbody></table>
    </div>
    <div class="row" style="margin-top:14px">
      <button id="t-save">حفظ</button>
      <button class="secondary" id="t-cancel">إلغاء</button>
    </div>`, { wide: true });
  $("#t-cancel", ov).onclick = () => ov.remove();
  $("#t-save", ov).onclick = async () => {
    const data = {};
    for (const k of KPIS) {
      const t = parseFloat(val(`t-${k.key}`, ov));
      const a = parseFloat(val(`a-${k.key}`, ov));
      data[k.key] = { target: isNaN(t) ? k.target : t, amber: isNaN(a) ? k.amber : a };
    }
    try {
      await saveTargets(data);
      await db.audit("UPDATE", "Config", "kpiTargets", "تعديل مستهدفات وعتبات مؤشرات اللوحة التنفيذية");
      ov.remove();
      toast("حُفظت المستهدفات");
      done();
    } catch (err) {
      toast(err.message, true);
    }
  };
}
