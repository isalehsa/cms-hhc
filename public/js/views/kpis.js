// مؤشرات قياس أداء إدارة الالتزام — المؤشرات الثمانية الموزونة وفق دليل السياسات والإجراءات
// تُحتسب لحظياً من بيانات النظام، مع إمكانية إدخال قيمة فعلية يدوية للمؤشرات غير القابلة للاشتقاق
import { store, reload } from "../state.js";
import * as db from "../db.js";
import { $, esc, toast, modal, fld, val, progressBar } from "../ui.js";
import { canEdit } from "../auth.js";

const YEAR = new Date().getFullYear();

// pct آمن: بسط/مقام
const pct = (num, den) => (den ? Math.round((num / den) * 100) : null);

// تعريفات المؤشرات — auto(store) تُعيد رقماً محتسباً أو null (يدوي)
const KPIS = [
  {
    key: "encyclopedia",
    name: "معدل اكتمال موسوعة الالتزام",
    def: "مدى شمول الموسوعة لكافة الأنظمة واللوائح والتعاميم ذات العلاقة بنشاط الشركة",
    formula: "(المتطلبات الموثقة المعتمدة ÷ إجمالي المتطلبات) × 100",
    target: 100, weight: 15, unit: "%",
    auto: (s) => {
      const all = s.requirements.filter((r) => r.status !== "CANCELLED");
      const done = all.filter((r) => r.status === "ACTIVE" || r.status === "UPDATED");
      return pct(done.length, all.length);
    },
  },
  {
    key: "awareness",
    name: "معدل تنفيذ برامج التوعية بالالتزام",
    def: "مدى الالتزام بتنفيذ الأنشطة التدريبية والتوعوية المخطط لها في مجال الالتزام",
    formula: "(البرامج المنفذة ÷ إجمالي البرامج المخططة) × 100",
    target: 100, weight: 10, unit: "%",
    auto: (s) => {
      const prog = s.planItems.filter((p) => /تدريب|توعو|توعية/.test(p.title || "") && p.year === YEAR);
      if (!prog.length) return null;
      return Math.round(prog.reduce((a, p) => a + (p.progress || 0), 0) / prog.length);
    },
  },
  {
    key: "program",
    name: "معدل تنفيذ برنامج الالتزام",
    def: "مدى التقدم في تنفيذ خطة إدارة الالتزام السنوية",
    formula: "(أنشطة البرنامج المنفذة ÷ إجمالي الأنشطة المخططة) × 100",
    target: 90, weight: 15, unit: "%",
    auto: (s) => {
      const py = s.planItems.filter((p) => p.year === YEAR);
      if (!py.length) return null;
      return Math.round(py.reduce((a, p) => a + (p.progress || 0), 0) / py.length);
    },
  },
  {
    key: "cases",
    name: "معدل إغلاق البلاغات",
    def: "نسبة البلاغات التي تم التحقيق فيها ومعالجتها وإغلاقها",
    formula: "(البلاغات المغلقة ÷ إجمالي البلاغات الواردة) × 100",
    target: 100, weight: 15, unit: "%",
    auto: (s) => pct(s.cases.filter((c) => c.status === "CLOSED").length, s.cases.length),
  },
  {
    key: "recommendations",
    name: "معدل تنفيذ التوصيات",
    def: "مدى تطبيق الإدارات للتوصيات الصادرة عن إدارة الالتزام",
    formula: "(التوصيات المنفذة ÷ إجمالي التوصيات الصادرة) × 100",
    target: 90, weight: 15, unit: "%",
    auto: (s) => pct(s.findings.filter((f) => f.status === "CLOSED").length, s.findings.length),
  },
  {
    key: "policies",
    name: "نسبة السياسات والإجراءات المحدثة والمعتمدة",
    def: "مدى الالتزام بمراجعة واعتماد السياسات والإجراءات الداخلية بعد صدورها أو تحديثها",
    formula: "(السياسات المراجعة والمعتمدة ÷ إجمالي السياسات المحدثة) × 100",
    target: 100, weight: 10, unit: "%",
    auto: (s) => {
      const pol = s.requirements.filter((r) => r.type === "POLICY" && r.status !== "CANCELLED");
      if (!pol.length) return null;
      return pct(pol.filter((r) => r.status === "ACTIVE" || r.status === "UPDATED").length, pol.length);
    },
  },
  {
    key: "fines",
    name: "قيمة الغرامات التنظيمية",
    def: "مدى التعرض لغرامات أو عقوبات نتيجة مخالفات تنظيمية أو عدم الالتزام بمتطلبات الجهات الرقابية",
    formula: "إجمالي قيمة الغرامات خلال الفترة",
    target: 10000, weight: 10, unit: "ريال", lowerIsBetter: true,
    auto: () => null, // يُدخل يدوياً
  },
  {
    key: "visits",
    name: "نسبة تنفيذ الزيارات الميدانية",
    def: "مدى الالتزام بتنفيذ الزيارات الميدانية وفق الخطة المعتمدة",
    formula: "(الزيارات المنفذة ÷ إجمالي الزيارات المخططة) × 100",
    target: 100, weight: 10, unit: "%",
    auto: (s) => pct(s.visits.filter((v) => v.status !== "PLANNED").length, s.visits.length),
  },
];

// نسبة الإنجاز (0-100) لمؤشر بقيمة معطاة مقارنةً بمستهدفه
function achievement(kpi, value) {
  if (value === null || value === undefined) return null;
  if (kpi.lowerIsBetter) return value <= kpi.target ? 100 : Math.max(0, Math.round((kpi.target / value) * 100));
  return Math.min(100, Math.round((value / kpi.target) * 100));
}

const ROLE_OF = (a) => (a === null ? "neutral" : a >= 90 ? "good" : a >= 70 ? "warning" : a >= 50 ? "serious" : "critical");

// القيمة الفعلية = التجاوز اليدوي إن وُجد وإلا القيمة المحتسبة آلياً
function effectiveValue(kpi, overrides) {
  const ov = overrides?.[kpi.key];
  if (ov !== undefined && ov !== null && ov !== "") return Number(ov);
  return kpi.auto(store);
}

export async function renderKpis(el) {
  const editable = canEdit(store.user);
  let doc = null;
  try { doc = await db.getRow("settings", "kpis"); } catch { /* اختياري */ }
  const overrides = doc?.values || {};

  const rows = KPIS.map((k) => {
    const value = effectiveValue(k, overrides);
    const ach = achievement(k, value);
    const manual = overrides?.[k.key] !== undefined && overrides?.[k.key] !== null && overrides?.[k.key] !== "";
    return { k, value, ach, manual };
  });

  // النتيجة الموزونة الكلية: تُحتسب على المؤشرات ذات القيمة المتاحة، وتُعاد معايرة الأوزان
  const scored = rows.filter((r) => r.ach !== null);
  const wSum = scored.reduce((a, r) => a + r.k.weight, 0);
  const total = wSum ? Math.round(scored.reduce((a, r) => a + r.ach * r.k.weight, 0) / wSum) : 0;

  el.innerHTML = `
    <div class="page-head">
      <h1>📈 مؤشرات قياس الأداء</h1>
      <p class="muted">وفق دليل السياسات والإجراءات — تُحتسب لحظياً من بيانات النظام · ${YEAR}</p>
    </div>

    <section class="card kpi-total">
      <div class="row" style="align-items:center;gap:18px">
        <div class="kpi-score lvl-${ROLE_OF(total)}">${total}%</div>
        <div class="grow">
          <h2 style="margin:0">الأداء الموزون الكلي لإدارة الالتزام</h2>
          <p class="muted" style="margin:4px 0 0">محتسب على ${scored.length} من ${KPIS.length} مؤشراً (بوزن ${wSum}% من أصل 100%). المؤشرات بلا بيانات كافية تُدرج قيمتها يدوياً.</p>
          ${progressBar(total)}
        </div>
      </div>
    </section>

    <section class="card">
      <div style="overflow-x:auto">
        <table class="kpi-table">
          <thead><tr>
            <th>#</th><th>المؤشر</th><th>طريقة القياس</th><th>المستهدف</th><th>الوزن</th>
            <th>القيمة الفعلية</th><th>نسبة الإنجاز</th>
          </tr></thead>
          <tbody>
            ${rows.map((r, i) => {
              const unit = r.k.unit === "%" ? "%" : " ريال";
              const valTxt = r.value === null || r.value === undefined
                ? '<span class="muted">— يدوي —</span>'
                : `${r.value}${unit}${r.manual ? "" : ' <span class="chip chip-auto" data-tip="محتسب آلياً من بيانات النظام">🤖</span>'}`;
              return `<tr>
                <td>${i + 1}</td>
                <td><strong>${esc(r.k.name)}</strong><div class="muted clamp">${esc(r.k.def)}</div></td>
                <td class="muted">${esc(r.k.formula)}</td>
                <td>${r.k.target}${unit}</td>
                <td>${r.k.weight}%</td>
                <td>${valTxt}</td>
                <td style="min-width:130px">${r.ach === null ? '<span class="muted">—</span>' : `<span class="lvl lvl-${ROLE_OF(r.ach)}"><span class="dot"></span>${r.ach}%</span>`}</td>
              </tr>`;
            }).join("")}
          </tbody>
          <tfoot><tr><td colspan="4"></td><td><strong>100%</strong></td><td></td><td><strong>${total}%</strong></td></tr></tfoot>
        </table>
      </div>
      ${editable ? '<button class="secondary" id="kpi-edit" style="margin-top:12px">✎ إدخال القيم الفعلية اليدوية</button>' : ""}
      <p class="muted" style="margin-top:8px">القيم المميزة بـ 🤖 تُحدَّث تلقائياً. القيم اليدوية (كقيمة الغرامات وبرامج التوعية) تُدخَل هنا وتُخزَّن للفترة الحالية.</p>
    </section>`;

  $("#kpi-edit", el)?.addEventListener("click", () => openEditor(overrides, () => renderKpis(el)));
}

function openEditor(overrides, done) {
  const ov = modal(
    `
    <h2>إدخال القيم الفعلية للمؤشرات</h2>
    <p class="muted">اترك الحقل فارغاً لاعتماد القيمة المحتسبة آلياً. القيمة المُدخلة تتجاوز الحساب الآلي.</p>
    ${KPIS.map((k) => {
      const auto = k.auto(store);
      const hint = auto === null ? "لا يوجد حساب آلي — أدخل القيمة" : `المحتسب آلياً: ${auto}${k.unit === "%" ? "%" : " ريال"}`;
      return fld(
        `${k.name} (${k.unit === "%" ? "%" : "ريال"}) — <small class="muted">${esc(hint)}</small>`,
        `<input type="number" id="kv-${k.key}" value="${overrides?.[k.key] ?? ""}" placeholder="فارغ = آلي" />`
      );
    }).join("")}
    <div class="row" style="margin-top:14px">
      <button id="kv-save">حفظ</button>
      <button class="secondary" id="kv-cancel">إلغاء</button>
    </div>`,
    { wide: true }
  );
  $("#kv-cancel", ov).onclick = () => ov.remove();
  $("#kv-save", ov).onclick = async () => {
    const values = {};
    for (const k of KPIS) {
      const raw = val(`kv-${k.key}`, ov);
      if (raw !== "") values[k.key] = Number(raw);
    }
    try {
      await db.setRow("settings", "kpis", { values, period: `${YEAR}`, updatedAt: db.now() });
      await db.audit("UPDATE", "KPI", "kpis", "تحديث القيم الفعلية لمؤشرات الأداء");
      ov.remove();
      toast("حُفظت القيم");
      done();
    } catch (err) {
      toast(err.message, true);
    }
  };
}
