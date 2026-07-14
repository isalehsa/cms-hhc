// مكونات واجهة مشتركة: تنبيهات، نوافذ، شارات، حقول، رسوم بسيطة
import { STATUS_COLORS, LEVEL_COLOR_ROLE } from "./meta.js";

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
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
  return d.toLocaleDateString("ar-SA", { year: "numeric", month: "short", day: "numeric" });
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
  return `<div class="prog"><div class="prog-bar"><div class="prog-fill" style="width:${p}%"></div></div><span class="prog-num">${p}٪</span></div>`;
}

export function emptyMsg(msg) {
  return `<p class="muted" style="padding:14px">${esc(msg)}</p>`;
}

export function spinnerHtml(msg = "جاري التحميل…") {
  return `<p class="muted" style="padding:20px"><span class="spinner"></span> ${esc(msg)}</p>`;
}
