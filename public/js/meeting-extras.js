// إضافات على محاضر الاجتماعات: مزامنة التقويم (‏.ics / Google) والتوقيع الإلكتروني للمحضر
// تُستخدم من شاشة اجتماعات الالتزام (المبنية على نظام المحاضر والمهام) دون المساس بمنطقه.
import { buildICS, googleCalUrl, downloadICS } from "./calendar.js";
import * as db from "./db.js";
import { store, reload } from "./state.js";
import { $, esc, toast, modal, fld, txt, val, fmtDateTime, confirmBox } from "./ui.js";
import { canApprove } from "./auth.js";

// كائن اجتماع بصيغة يفهمها مولّد التقويم (من محضر يحمل date + time اختياري)
function calMeeting(m, title) {
  const date = (m.date || "").slice(0, 10);
  const startAt = date ? new Date(`${date}T${(m.time && /^\d{2}:\d{2}$/.test(m.time)) ? m.time : "09:00"}:00`).toISOString() : null;
  return {
    id: m.id, code: m.code, title: title || m.title || "اجتماع", startAt,
    durationMin: Number(m.durationMin) || 60, location: m.location || "", recurrence: "NONE",
    status: "SCHEDULED", departmentId: null, agenda: "", attendees: m.attendees || "",
  };
}

// ---------- مزامنة التقويم ----------
export function calendarButtonsHtml(m, title) {
  const cm = calMeeting(m, title);
  if (!cm.startAt) return "";
  return `<a class="btn-link" href="${esc(googleCalUrl(cm))}" target="_blank" rel="noopener" title="إضافة الاجتماع إلى Google Calendar">➕ Google Calendar</a>
    <button type="button" class="secondary" data-mx-ics title="تنزيل ملف .ics لإضافته إلى Outlook/Apple Calendar">⬇ تنزيل .ics</button>`;
}
export function bindCalendarButtons(root, m, title) {
  const cm = calMeeting(m, title);
  root.querySelector("[data-mx-ics]")?.addEventListener("click", () => {
    downloadICS(m.code || "meeting", buildICS(cm));
    toast("نُزّل ملف التقويم");
  });
}

// ---------- التوقيع الإلكتروني ----------
async function sha256Hex(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function signaturesHtml(m) {
  const sigs = m.signatures || [];
  return `<div class="card" style="background:rgba(20,112,92,0.05);margin-top:12px">
    <div class="row" style="justify-content:space-between;align-items:center">
      <h3 style="margin:0">✒ اعتماد وتوقيع المحضر</h3>
      ${sigs.length ? `<span class="lvl lvl-good"><span class="dot"></span>موقّع (${sigs.length})</span>` : '<span class="lvl lvl-neutral"><span class="dot"></span>غير موقّع</span>'}
    </div>
    ${sigs.length ? `<div class="sig-list" style="margin-top:8px">${sigs.map((s) => `<div class="sig-card">
      <img src="${esc(s.dataUrl)}" alt="توقيع ${esc(s.name)}" class="sig-img" />
      <div><strong>${esc(s.name)}</strong>${s.title ? `<br/><span class="muted">${esc(s.title)}</span>` : ""}<br/><span class="muted" style="font-size:0.74rem">${fmtDateTime(s.signedAt)}</span></div>
    </div>`).join("")}</div>` : '<p class="muted" style="margin-top:6px">لم يُوقَّع المحضر بعد.</p>'}
    ${m.approvedHash ? `<p class="muted" style="font-size:0.72rem;margin-top:6px;word-break:break-all">🔒 بصمة السلامة: <code>${esc(m.approvedHash.slice(0, 32))}…</code></p>` : ""}
    <div class="row" style="margin-top:8px">
      <button type="button" class="secondary" data-mx-sign>✒ ${sigs.length ? "إضافة توقيع" : "اعتماد وتوقيع"}</button>
      ${sigs.length && canApprove(store.user) ? '<button type="button" class="danger" data-mx-unsign>↺ إلغاء الاعتماد</button>' : ""}
    </div>
  </div>`;
}

function wirePad(canvas) {
  const ctx = canvas.getContext("2d");
  ctx.lineWidth = 2.2; ctx.lineCap = "round"; ctx.strokeStyle = "#14251f";
  let drawing = false, dirty = false, last = null;
  const pos = (e) => { const r = canvas.getBoundingClientRect(); const t = e.touches?.[0] || e; return { x: ((t.clientX - r.left) / r.width) * canvas.width, y: ((t.clientY - r.top) / r.height) * canvas.height }; };
  const start = (e) => { drawing = true; last = pos(e); e.preventDefault(); };
  const move = (e) => { if (!drawing) return; const p = pos(e); ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke(); last = p; dirty = true; e.preventDefault(); };
  const end = () => { drawing = false; };
  canvas.addEventListener("mousedown", start); canvas.addEventListener("mousemove", move); window.addEventListener("mouseup", end);
  canvas.addEventListener("touchstart", start, { passive: false }); canvas.addEventListener("touchmove", move, { passive: false }); canvas.addEventListener("touchend", end);
  // رسم صورة موقّع مرفوعة على اللوحة (احتواء داخل أبعادها) — يوحّد الحفظ ويحدّ الحجم
  const drawImage = (img) => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const r = Math.min(canvas.width / img.width, canvas.height / img.height);
    const w = img.width * r, h = img.height * r;
    ctx.drawImage(img, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
    dirty = true;
  };
  return { clear: () => { ctx.clearRect(0, 0, canvas.width, canvas.height); dirty = false; }, isEmpty: () => !dirty, dataUrl: () => canvas.toDataURL("image/png"), drawImage };
}

// يفتح لوحة توقيع ويحفظ التوقيع على وثيقة المحضر — done() لإعادة رسم النافذة
export function openSignPad(m, done) {
  const u = store.user;
  const ed = modal(`
    <h2>✒ اعتماد وتوقيع المحضر — ${esc(m.code || "")}</h2>
    <div class="form-grid">
      ${fld("اسم الموقّع *", txt("mx-name", u.name || ""))}
      ${fld("الصفة", txt("mx-title", "", "مثال: رئيس الاجتماع / مدير الالتزام"))}
    </div>
    ${fld("التوقيع (ارسم بالفأرة/باللمس أو ارفع صورة) *", `<div class="sig-pad-wrap"><canvas id="mx-pad" width="600" height="180" class="sig-pad"></canvas></div>
      <div class="row" style="margin-top:6px;gap:8px">
        <button type="button" class="secondary small" id="mx-clear">مسح</button>
        <label class="btn-link" style="cursor:pointer;font-size:.85rem">📤 رفع صورة توقيع<input type="file" id="mx-file" accept="image/*" hidden /></label>
      </div>`)}
    <label class="chk-line" style="margin-top:8px"><input type="checkbox" id="mx-affirm" /> أقرّ بصحة ما ورد في المحضر وأعتمده بتوقيعي الإلكتروني.</label>
    <p class="muted">الاعتماد يسجّل بصمة سلامة (SHA-256) وتاريخ التوقيع في سجل التدقيق.</p>
    <div class="row" style="margin-top:14px">
      <button id="mx-save">اعتماد وتوقيع</button>
      <button class="secondary" id="mx-cancel">إلغاء</button>
    </div>`, { wide: true });
  const pad = wirePad($("#mx-pad", ed));
  $("#mx-clear", ed).onclick = () => pad.clear();
  $("#mx-file", ed).onchange = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith("image/")) return toast("الرجاء اختيار ملف صورة", true);
    const rd = new FileReader();
    rd.onload = () => { const img = new Image(); img.onload = () => pad.drawImage(img); img.onerror = () => toast("تعذّرت قراءة الصورة", true); img.src = rd.result; };
    rd.readAsDataURL(f);
  };
  $("#mx-cancel", ed).onclick = () => ed.remove();
  $("#mx-save", ed).onclick = async () => {
    const name = val("mx-name", ed);
    if (!name) return toast("اسم الموقّع إلزامي", true);
    if (pad.isEmpty()) return toast("الرجاء رسم التوقيع", true);
    if (!$("#mx-affirm", ed).checked) return toast("يجب الإقرار قبل التوقيع", true);
    const signedAt = db.now();
    const signature = { name, title: val("mx-title", ed) || "", signerId: u.uid, signedAt, dataUrl: pad.dataUrl() };
    try {
      const signatures = [...(m.signatures || []), signature];
      const patch = { signatures };
      if (!m.approvedHash) { patch.approvedHash = await sha256Hex(`${m.code || m.id}|${signedAt}|${name}`); patch.approvedAt = signedAt; }
      await db.updateRow("meetings", m.id, patch);
      await db.audit("APPROVE", "Meeting", m.code, `اعتماد وتوقيع محضر الاجتماع ${m.code} — الموقّع: ${name}`);
      Object.assign(m, patch); // تحديث النسخة المحلية
      await reload("meetings");
      ed.remove();
      toast("اعتُمد المحضر ووُقّع");
      done?.();
    } catch (err) { toast(err.message, true); }
  };
}

export async function revokeSignatures(m, done) {
  if (!(await confirmBox("إلغاء اعتماد المحضر وحذف تواقيعه؟"))) return;
  try {
    await db.updateRow("meetings", m.id, { signatures: [], approvedHash: null, approvedAt: null });
    await db.audit("UPDATE", "Meeting", m.code, `إلغاء اعتماد محضر الاجتماع ${m.code}`);
    Object.assign(m, { signatures: [], approvedHash: null, approvedAt: null });
    await reload("meetings");
    toast("أُلغي الاعتماد");
    done?.();
  } catch (err) { toast(err.message, true); }
}

// كتلة التواقيع لصفحة الطباعة (تُستبدل بها خانات التوقيع الفارغة عند وجود تواقيع)
export function printSignBlocks(m) {
  const sigs = m.signatures || [];
  if (!sigs.length) return null;
  return `<div class="signs">${sigs.map((s) => `<div class="box">
    <img src="${esc(s.dataUrl)}" style="max-height:66px;display:block;margin:0 auto 4px" alt="توقيع" />
    <div class="line">${esc(s.name)}${s.title ? " — " + esc(s.title) : ""}<br><span style="font-size:.72rem;color:#8a988f">${fmtDateTime(s.signedAt)}</span></div>
  </div>`).join("")}</div>${m.approvedHash ? `<div class="foot" style="margin-top:8px">بصمة السلامة (SHA-256): ${esc(m.approvedHash)}</div>` : ""}`;
}
