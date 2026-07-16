// مكونات واجهة مشتركة: تنبيهات، نوافذ، شارات، حقول، رسوم بسيطة
import { STATUS_COLORS, LEVEL_COLOR_ROLE, riskLevel } from "./meta.js";

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// تحويل الأرقام العربية/الفارسية إلى إنجليزية في كل النصوص المعروضة
const AR_NUM = { "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4", "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
  "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4", "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9", "٪": "%", "٫": "." };
export const enDigits = (s) => String(s ?? "").replace(/[٠-٩۰-۹٪٫]/g, (c) => AR_NUM[c] ?? c);

export function esc(s) {
  return enDigits(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

export function toast(msg, isError = false) {
  const el = $("#toast");
  el.textContent = msg;
  el.className = `toast${isError ? " error" : ""}`;
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.add("hidden"), 4500);
}

export function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d)) return "—";
  // تقويم ميلادي وأرقام إنجليزية مع أسماء الأشهر العربية
  return d.toLocaleDateString("ar-SA-u-ca-gregory-nu-latn", { year: "numeric", month: "short", day: "numeric" });
}

export function daysUntil(iso) {
  if (!iso) return null;
  return Math.ceil((new Date(iso) - Date.now()) / 86400000);
}

export const todayISO = () => new Date().toISOString().slice(0, 10);
export const isoFromInput = (v) => (v ? new Date(v + "T12:00:00Z").toISOString() : null);
export const inputFromISO = (iso) => (iso ? String(iso).slice(0, 10) : "");

// ---------- شارات ----------
// شارة حالة بلون دلالي + نص دائماً (اللون لا يحمل المعنى وحده)
export function levelBadge(levelKey, label) {
  const role = LEVEL_COLOR_ROLE[levelKey] || "neutral";
  return `<span class="lvl lvl-${role}"><span class="dot"></span>${esc(label)}</span>`;
}

export function statusBadgeFrom(map, key, roleMap = {}) {
  const label = map[key] || key || "—";
  const role = roleMap[key] || "neutral";
  return `<span class="lvl lvl-${role}"><span class="dot"></span>${esc(label)}</span>`;
}

export function chip(text) {
  return `<span class="chip">${esc(text)}</span>`;
}

// ---------- نوافذ منبثقة ----------
export function modal(html, { wide = false } = {}) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `<div class="modal card ${wide ? "modal-wide" : ""}">${html}</div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener("click", (e) => e.target === overlay && overlay.remove());
  overlay.close = () => overlay.remove();
  return overlay;
}

export function confirmBox(msg) {
  return new Promise((resolve) => {
    const ov = modal(`
      <h2>تأكيد</h2>
      <p>${esc(msg)}</p>
      <div class="row" style="margin-top:14px">
        <button id="cf-yes" class="danger">تأكيد</button>
        <button id="cf-no" class="secondary">إلغاء</button>
      </div>`);
    $("#cf-yes", ov).onclick = () => { ov.remove(); resolve(true); };
    $("#cf-no", ov).onclick = () => { ov.remove(); resolve(false); };
  });
}

// ---------- حقول النماذج ----------
export function fld(label, inner) {
  return `<div class="fld"><label>${esc(label)}</label>${inner}</div>`;
}

export function txt(id, value = "", ph = "") {
  return `<input type="text" id="${id}" value="${esc(value)}" placeholder="${esc(ph)}" />`;
}

export function num(id, value = "", min = 1, max = 5) {
  return `<input type="number" id="${id}" value="${esc(value)}" min="${min}" max="${max}" />`;
}

export function dateInp(id, iso = "") {
  return `<input type="date" id="${id}" value="${inputFromISO(iso)}" />`;
}

export function area(id, value = "", ph = "", rows = 4) {
  return `<textarea id="${id}" rows="${rows}" placeholder="${esc(ph)}">${esc(value)}</textarea>`;
}

// خيارات من كائن {KEY: label} أو مصفوفة نصوص أو [{id,name}]
export function sel(id, options, selected = "", { empty = null } = {}) {
  let opts = "";
  if (empty !== null) opts += `<option value="">${esc(empty)}</option>`;
  if (Array.isArray(options)) {
    for (const o of options) {
      if (typeof o === "object") {
        opts += `<option value="${esc(o.id)}" ${o.id === selected ? "selected" : ""}>${esc(o.name)}</option>`;
      } else {
        opts += `<option value="${esc(o)}" ${o === selected ? "selected" : ""}>${esc(o)}</option>`;
      }
    }
  } else {
    for (const [k, v] of Object.entries(options)) {
      opts += `<option value="${esc(k)}" ${k === selected ? "selected" : ""}>${esc(v)}</option>`;
    }
  }
  return `<select id="${id}">${opts}</select>`;
}

export const val = (id, root = document) => $("#" + id, root)?.value?.trim() ?? "";

// ---------- عناصر لوحة التحكم ----------
export function statTile(num, label, sub = "") {
  return `<div class="stat"><div class="num">${num}</div><div class="lbl">${esc(label)}</div>${sub ? `<div class="sub">${sub}</div>` : ""}</div>`;
}

// شريط توزيع أفقي: items = [{label, count, role}] — كل شريحة بعنوانها وعددها
export function distBar(items) {
  const total = items.reduce((s, i) => s + i.count, 0);
  if (!total) return '<p class="muted">لا توجد بيانات بعد</p>';
  const seg = items
    .filter((i) => i.count > 0)
    .map(
      (i) =>
        `<div class="seg" style="flex:${i.count};background:${STATUS_COLORS[i.role] || STATUS_COLORS.neutral}" title="${esc(i.label)}: ${i.count}"></div>`
    )
    .join("");
  const legend = items
    .map(
      (i) =>
        `<span class="lvl lvl-${i.role}"><span class="dot"></span>${esc(i.label)} <strong>${i.count}</strong></span>`
    )
    .join(" ");
  return `<div class="dist"><div class="dist-bar">${seg}</div><div class="dist-legend">${legend}</div></div>`;
}

// شريط تقدم بنسبة مئوية ظاهرة نصياً
export function progressBar(pct) {
  const p = Math.max(0, Math.min(100, Math.round(pct || 0)));
  return `<div class="prog"><div class="prog-bar"><div class="prog-fill" style="width:${p}%"></div></div><span class="prog-num">${p}%</span></div>`;
}

export function emptyMsg(msg) {
  return `<p class="muted" style="padding:14px">${esc(msg)}</p>`;
}

// تنسيق مبلغ بالريال بأرقام إنجليزية
export const fmtSAR = (n) => `${Math.round(Number(n) || 0).toLocaleString("en-US")} ريال`;

// مؤشر دائري لنسبة مئوية واحدة (عداد الالتزام) — الرقم ظاهر نصياً دوماً
export function donutStat(pct, label, sub = "") {
  if (pct === null || pct === undefined || isNaN(pct)) return statTile("—", label, sub);
  const p = Math.max(0, Math.min(100, Math.round(pct)));
  const r = 34;
  const c = 2 * Math.PI * r;
  return `<div class="stat stat-donut">
    <svg viewBox="0 0 84 84" class="donut" role="img" aria-label="${esc(label)}: ${p}%">
      <circle cx="42" cy="42" r="${r}" class="donut-track"></circle>
      <circle cx="42" cy="42" r="${r}" class="donut-fill" stroke-dasharray="${((p / 100) * c).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 42 42)"></circle>
      <text x="42" y="48" text-anchor="middle" class="donut-num">${p}%</text>
    </svg>
    <div><div class="lbl">${esc(label)}</div>${sub ? `<div class="sub muted">${esc(sub)}</div>` : ""}</div>
  </div>`;
}

// أعمدة أفقية بلون واحد مع التسمية والقيمة نصاً: items = [{label, count, tip?}]
export function hBars(items) {
  const max = Math.max(...items.map((i) => i.count), 1);
  return `<div class="hbars">${items
    .map(
      (i) => `<div class="hbar-row" ${i.tip ? `data-tip="${esc(i.tip)}"` : ""}>
        <span class="hbar-lbl">${esc(i.label)}</span>
        <span class="hbar-track"><span class="hbar-fill" style="width:${Math.max(2, Math.round((i.count / max) * 100))}%"></span></span>
        <span class="hbar-num">${i.count}</span>
      </div>`
    )
    .join("")}</div>`;
}

// خريطة حرارية 5×5 للمخاطر: صفوف الأثر (5→1) × أعمدة الاحتمالية (1→5)
// كل خلية تحمل العدد نصاً ولونها من لوحة الحالات بحسب درجة الخطر — قابلة للنقر عبر data-cell
export function riskHeatmap(risks, { residual = true, selected = "" } = {}) {
  const clamp = (v) => Math.max(1, Math.min(5, Number(v) || 3));
  const counts = {};
  for (const r of risks) {
    const lik = clamp(residual ? r.residualLikelihood ?? r.likelihood : r.likelihood);
    const imp = clamp(residual ? r.residualImpact ?? r.impact : r.impact);
    counts[`${lik},${imp}`] = (counts[`${lik},${imp}`] || 0) + 1;
  }
  let rows = "";
  for (let imp = 5; imp >= 1; imp--) {
    let cells = "";
    for (let lik = 1; lik <= 5; lik++) {
      const key = `${lik},${imp}`;
      const n = counts[key] || 0;
      const lvl = riskLevel(lik, imp);
      const role = LEVEL_COLOR_ROLE[lvl.key] || "neutral";
      cells += `<td class="hm-cell hm-${role} ${n ? "" : "hm-empty"} ${selected === key ? "hm-active" : ""}"
        data-cell="${key}" data-tip="الاحتمالية ${lik} × الأثر ${imp} = ${lvl.score} (${lvl.label}) — ${n} خطر">${n || ""}</td>`;
    }
    rows += `<tr><th class="hm-axis">${imp}</th>${cells}</tr>`;
  }
  return `<table class="heatmap" role="img" aria-label="خريطة حرارية للمخاطر">
    <tbody>${rows}
    <tr><th class="hm-axis hm-corner">الأثر ⟍ الاحتمالية</th>${[1, 2, 3, 4, 5].map((l) => `<th class="hm-axis">${l}</th>`).join("")}</tr>
    </tbody></table>`;
}

// شبكة تقويم شهري: يعيد شبكة الأيام فقط — عناوين التنقل يبنيها المستدعي
// events = [{date: "YYYY-MM-DD", icon, label, tip, view, overdue}]
const WEEKDAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
export const MONTH_NAMES = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];

export function monthCalendar(year, month, events) {
  const firstDow = new Date(year, month, 1).getDay();
  const days = new Date(year, month + 1, 0).getDate();
  const todayISOd = todayISO();
  const byDay = {};
  for (const e of events) (byDay[e.date] ||= []).push(e);

  let cells = "";
  for (let i = 0; i < firstDow; i++) cells += '<div class="cal-cell cal-out"></div>';
  for (let d = 1; d <= days; d++) {
    const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const evs = byDay[iso] || [];
    cells += `<div class="cal-cell ${iso === todayISOd ? "cal-today" : ""}">
      <span class="cal-day">${d}</span>
      ${evs.slice(0, 3).map((e) => `<span class="cal-ev ${e.overdue ? "cal-ev-late" : ""}" data-nav="${esc(e.view)}" data-tip="${esc(e.tip || e.label)}">${e.icon} ${esc(e.label)}</span>`).join("")}
      ${evs.length > 3 ? `<span class="cal-more muted" data-tip="${esc(evs.slice(3).map((e) => e.label).join(" · "))}">+${evs.length - 3} أخرى</span>` : ""}
    </div>`;
  }
  return `<div class="cal-grid cal-head">${WEEKDAYS.map((w) => `<div class="cal-wd">${w}</div>`).join("")}</div>
    <div class="cal-grid">${cells}</div>`;
}

export function spinnerHtml(msg = "جاري التحميل…") {
  return `<p class="muted" style="padding:20px"><span class="spinner"></span> ${esc(msg)}</p>`;
}

// ---------- تلميحات الأزرار ----------
// عند مرور المؤشر فوق أي زر تظهر بطاقة تشرح عمله: من data-tip أو title
// أو من قاموس التسميات الشائعة إن لم يُحدَّد شرح صريح
const TIP_FALLBACKS = {
  "حفظ": "حفظ البيانات المدخلة",
  "إلغاء": "إغلاق النافذة دون حفظ التغييرات",
  "إغلاق": "إغلاق هذه النافذة",
  "تعديل": "تعديل بيانات هذا السجل",
  "حذف": "حذف هذا السجل نهائياً",
  "تأكيد": "تنفيذ الإجراء المطلوب",
  "خروج": "تسجيل الخروج من النظام",
  "دخول": "تسجيل الدخول إلى النظام",
  "ربط": "ربط المادة بالمادة المقترحة",
  "فك الربط": "إزالة الربط بين المادتين",
  "✕": "حذف هذا العنصر",
  "✔": "إنهاء حالة المراجعة لهذه المادة",
  "🔖": "تعليم هذه المادة كبحاجة إلى مراجعة",
};

export function initTooltips() {
  if ($("#ui-tip")) return;
  const tip = document.createElement("div");
  tip.id = "ui-tip";
  tip.className = "ui-tip";
  tip.hidden = true;
  document.body.appendChild(tip);

  let anchor = null;
  const hide = () => { anchor = null; tip.hidden = true; };

  document.addEventListener("mouseover", (e) => {
    const b = e.target.closest?.("button, [data-tip]");
    if (!b) { if (anchor) hide(); return; }
    if (b === anchor) return;
    // نقل title إلى data-tip لتوحيد المظهر ومنع تلميح المتصفح الافتراضي
    if (b.hasAttribute("title")) { b.dataset.tip = b.getAttribute("title"); b.removeAttribute("title"); }
    const text = b.dataset.tip || TIP_FALLBACKS[b.textContent.trim()] || "";
    if (!text) { hide(); return; }
    anchor = b;
    tip.textContent = text;
    tip.hidden = false;
    const r = b.getBoundingClientRect();
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    let top = r.top - th - 10;
    if (top < 6) top = r.bottom + 10;
    const left = Math.max(8, Math.min(r.left + r.width / 2 - tw / 2, innerWidth - tw - 8));
    tip.style.top = `${top}px`;
    tip.style.left = `${left}px`;
  });
  document.addEventListener("mouseout", (e) => {
    if (anchor && !anchor.contains(e.relatedTarget)) hide();
  });
  document.addEventListener("click", hide, true);
  addEventListener("scroll", hide, true);
}
