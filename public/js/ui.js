// مكونات واجهة مشتركة: تنبيهات، نوافذ، شارات، حقول، رسوم بسيطة
import { STATUS_COLORS, LEVEL_COLOR_ROLE, riskLevel } from "./meta.js";

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// يحافظ على تركيز حقل الإدخال وموضع المؤشر عبر إعادة بناء الواجهة.
// تُعيد دوال العرض بناء الـ DOM عبر innerHTML، مما يُتلف الحقل النشط ويُفقده
// التركيز؛ فنلتقط معرّف الحقل وموضع المؤشر قبل العرض ونستعيدهما بعده.
export function keepFocus(render) {
  const a = document.activeElement;
  const id = a && a.id;
  const start = a && a.selectionStart;
  const end = a && a.selectionEnd;
  render();
  if (!id) return;
  const next = document.getElementById(id);
  if (!next) return;
  next.focus();
  if (start != null && next.setSelectionRange) {
    try { next.setSelectionRange(start, end); } catch { /* أنواع حقول لا تدعم التحديد */ }
  }
}

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

// شارة موجة التجمع — تقبل كائن الموجة {short, label, tone, color}
export function waveBadge(wave, { full = false } = {}) {
  if (!wave) return '<span class="muted" style="font-size:.72rem">غير مصنّف</span>';
  const c = wave.color || STATUS_COLORS[wave.tone] || STATUS_COLORS.neutral;
  return `<span class="lvl" style="background:${c}1f;border-color:${c}55;color:${c}"><span class="dot" style="background:${c}"></span>${esc(full ? wave.label : wave.short)}</span>`;
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

// لون النضج على تدرّج لوني مستمر من الأحمر (0٪) إلى الأخضر (100٪) — يعكس مستوى النضج
export function maturityColor(pct) {
  const p = Math.max(0, Math.min(100, Math.round(pct || 0)));
  return `hsl(${Math.round(p * 1.2)}, 58%, 44%)`; // 0=أحمر · 60=أصفر · 120=أخضر
}

// شريط تقدّم النضج بلون يعكس المستوى (أحمر للمنخفض ← أخضر للمرتفع)
export function maturityBar(pct) {
  const p = Math.max(0, Math.min(100, Math.round(pct || 0)));
  return `<div class="prog"><div class="prog-bar"><div class="prog-fill" style="width:${p}%;background:${maturityColor(p)}"></div></div><span class="prog-num" style="color:${maturityColor(p)};font-weight:600">${p}%</span></div>`;
}

// شارة مستوى النضج بلون متدرّج من الأحمر إلى الأخضر بحسب النسبة
export function maturityLevelBadge(pct, label) {
  const color = maturityColor(pct);
  return `<span class="lvl" style="background:${color};border-color:transparent;color:#fff"><span class="dot" style="background:rgba(255,255,255,.9)"></span>${esc(label)}</span>`;
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

// مخطط دائري (دونات) SVG ذاتي الاحتواء بألوان صريحة — يعمل داخل التطبيق وفي نافذة التقارير
// items = [{label, count, color}] · القيم والنِّسب تظهر نصاً في وسيلة الإيضاح (اللون لا يحمل المعنى وحده)
export function donutChart(items, { size = 150, thickness = 24, unit = "الإجمالي" } = {}) {
  const total = items.reduce((s, i) => s + (Number(i.count) || 0), 0);
  const r = (size - thickness) / 2, cx = size / 2, cy = size / 2, circ = 2 * Math.PI * r;
  let off = 0;
  const segs = (total ? items.filter((i) => i.count > 0) : []).map((i) => {
    const len = (i.count / total) * circ;
    const seg = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${i.color}" stroke-width="${thickness}" stroke-dasharray="${len.toFixed(2)} ${(circ - len).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}" transform="rotate(-90 ${cx} ${cy})"><title>${esc(i.label)}: ${i.count}</title></circle>`;
    off += len;
    return seg;
  }).join("");
  const legend = items.map((i) => {
    const pct = total ? Math.round((i.count / total) * 100) : 0;
    return `<div style="display:flex;align-items:center;gap:7px;font-size:.8rem;margin:3px 0">
      <span style="width:11px;height:11px;border-radius:3px;background:${i.color};flex-shrink:0"></span>
      <span style="flex:1">${esc(i.label)}</span><strong>${i.count}</strong>
      <span style="color:#8a8578;min-width:36px;text-align:left">${pct}%</span></div>`;
  }).join("");
  return `<div style="display:flex;align-items:center;gap:18px;flex-wrap:wrap">
    <svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" style="flex-shrink:0" role="img" aria-label="مخطط دائري: ${esc(unit)} ${total}">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="rgba(120,130,125,.15)" stroke-width="${thickness}"/>
      ${segs}
      <text x="${cx}" y="${cy - size * 0.02}" text-anchor="middle" style="font-size:${(size * 0.24).toFixed(0)}px;font-weight:800;fill:currentColor">${total}</text>
      <text x="${cx}" y="${cy + size * 0.15}" text-anchor="middle" style="font-size:${(size * 0.093).toFixed(0)}px;fill:#8a8578">${esc(unit)}</text>
    </svg>
    <div style="flex:1;min-width:150px">${legend}</div>
  </div>`;
}

// معرّف فريد لعناصر SVG (لتفادي تعارض معرّفات التدرّج عند تكرار المخططات)
let _uid = 0;
const uid = () => `u${(++_uid).toString(36)}`;

// عدّاد نصف دائري (Gauge) لنسبة واحدة — القوس ملوّن بتدرّج الأحمر→الأخضر حسب القيمة
export function gaugeChart(pct, { label = "", sub = "", size = 200 } = {}) {
  if (pct === null || pct === undefined || isNaN(pct)) return statTile("—", label, sub);
  const p = Math.max(0, Math.min(100, Math.round(pct)));
  const w = size, cy = size * 0.56, r = size * 0.4, sw = size * 0.12, cx = w / 2, h = cy + sw / 2 + 6;
  const pol = (deg) => { const a = (deg * Math.PI) / 180; return [cx + r * Math.cos(a), cy - r * Math.sin(a)]; };
  const arc = (a0, a1) => { const [x0, y0] = pol(a0), [x1, y1] = pol(a1); return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`; };
  const color = maturityColor(p);
  return `<div style="text-align:center">
    <svg viewBox="0 0 ${w} ${h}" width="100%" style="max-width:${w}px" role="img" aria-label="${esc(label)}: ${p}%">
      <path d="${arc(180, 0)}" fill="none" stroke="rgba(120,130,125,.18)" stroke-width="${sw}" stroke-linecap="round"/>
      <path d="${arc(180, 180 - p * 1.8)}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round"/>
      <text x="${cx}" y="${cy - size * 0.02}" text-anchor="middle" style="font-size:${(size * 0.24).toFixed(0)}px;font-weight:800;fill:${color}">${p}%</text>
      ${label ? `<text x="${cx}" y="${cy + size * 0.14}" text-anchor="middle" style="font-size:${(size * 0.078).toFixed(0)}px;fill:#5d6c66">${esc(label)}</text>` : ""}
    </svg>${sub ? `<div class="muted" style="font-size:.78rem;margin-top:-4px">${esc(sub)}</div>` : ""}</div>`;
}

// مخطط خطي/مساحي لاتجاه زمني — points = [{label, value}]، مع قيمة كل نقطة نصاً
export function trendChart(points, { unit = "", color = "#14705c", height = 170 } = {}) {
  if (!points.length) return '<p class="muted" style="padding:12px">لا توجد بيانات كافية للاتجاه</p>';
  const n = points.length, w = Math.max(300, n * 78), h = height;
  const padL = 10, padR = 10, padT = 22, padB = 28, plotW = w - padL - padR, plotH = h - padT - padB;
  const max = Math.max(...points.map((p) => Number(p.value) || 0), 1);
  const x = (i) => padL + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (v) => padT + plotH - ((Number(v) || 0) / max) * plotH;
  const line = points.map((p, i) => `${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const area = `${padL},${(padT + plotH).toFixed(1)} ${line} ${(padL + plotW).toFixed(1)},${(padT + plotH).toFixed(1)}`;
  const gid = uid();
  const dots = points.map((p, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(p.value).toFixed(1)}" r="4" fill="#fff" stroke="${color}" stroke-width="2"><title>${esc(p.label)}: ${p.value}${esc(unit)}</title></circle>
    <text x="${x(i).toFixed(1)}" y="${(y(p.value) - 9).toFixed(1)}" text-anchor="middle" style="font-size:11px;font-weight:700;fill:${color}">${esc(String(p.value))}</text>`).join("");
  const labels = points.map((p, i) => `<text x="${x(i).toFixed(1)}" y="${h - 9}" text-anchor="middle" style="font-size:10px;fill:#8a8578">${esc(p.label)}</text>`).join("");
  return `<div style="overflow-x:auto"><svg viewBox="0 0 ${w} ${h}" width="100%" ${w > 560 ? `style="min-width:${w}px"` : ""} preserveAspectRatio="xMidYMid meet" role="img">
    <defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity="0.3"/><stop offset="1" stop-color="${color}" stop-opacity="0.02"/></linearGradient></defs>
    <polygon points="${area}" fill="url(#${gid})"/>
    <polyline points="${line}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round"/>
    ${dots}${labels}
  </svg></div>`;
}

// أعمدة مجمّعة للمقارنة بين سلسلتين لكل فئة — cats=[..], a/b={name,color,values:[]}
export function groupedBarChart(cats, a, b) {
  if (!cats.length) return '<p class="muted" style="padding:12px">لا توجد بيانات للمقارنة</p>';
  const max = Math.max(...a.values, ...b.values, 1);
  const rows = cats.map((c, i) => {
    const av = Number(a.values[i]) || 0, bv = Number(b.values[i]) || 0;
    return `<div style="margin:8px 0">
      <div style="font-size:.8rem;margin-bottom:3px">${esc(c)}</div>
      <div style="display:flex;align-items:center;gap:6px;margin:2px 0"><span style="width:9px;height:9px;border-radius:2px;background:${a.color};flex-shrink:0"></span>
        <span style="flex:1;height:12px;background:rgba(120,130,125,.12);border-radius:6px;overflow:hidden"><span style="display:block;height:100%;width:${Math.max(2, Math.round(av / max * 100))}%;background:${a.color}"></span></span>
        <strong style="min-width:40px;text-align:left;font-size:.8rem">${av}</strong></div>
      <div style="display:flex;align-items:center;gap:6px;margin:2px 0"><span style="width:9px;height:9px;border-radius:2px;background:${b.color};flex-shrink:0"></span>
        <span style="flex:1;height:12px;background:rgba(120,130,125,.12);border-radius:6px;overflow:hidden"><span style="display:block;height:100%;width:${Math.max(2, Math.round(bv / max * 100))}%;background:${b.color}"></span></span>
        <strong style="min-width:40px;text-align:left;font-size:.8rem">${bv}</strong></div>
    </div>`;
  }).join("");
  return `<div><div class="row" style="gap:14px;margin-bottom:6px;font-size:.78rem">
    <span style="display:flex;align-items:center;gap:5px"><span style="width:11px;height:11px;border-radius:3px;background:${a.color}"></span>${esc(a.name)}</span>
    <span style="display:flex;align-items:center;gap:5px"><span style="width:11px;height:11px;border-radius:3px;background:${b.color}"></span>${esc(b.name)}</span>
  </div>${rows}</div>`;
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
