// محضر الاجتماع + التوقيع الإلكتروني البسيط لاعتماد المحاضر المطبوعة
// - تحرير مسودة المحضر (محرر)
// - اعتماد وتوقيع: توقيع مرسوم + اسم + صفة + بصمة سلامة (SHA-256) وقفل النص
// - طباعة المحضر الموقّع، والتحقق من عدم العبث، وإلغاء الاعتماد (معتمِد)
import { store, reload, userName, deptName } from "../state.js";
import * as db from "../db.js";
import { $, esc, toast, modal, confirmBox, fld, txt, area, val, fmtDateTime } from "../ui.js";
import { MINUTES_STATUS, MEETING_TYPES } from "../meta.js";
import { canEdit, canApprove } from "../auth.js";

export const minutesBadgeRole = { NONE: "neutral", DRAFT: "warning", APPROVED: "good" };

// ---------- بصمة السلامة ----------
async function sha256Hex(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
const canonical = (m, text) => `${m.code || m.id}|${text}|${m.startAt || ""}`;

// ---------- القسم داخل نافذة تفاصيل الاجتماع ----------
export function renderMinutes(container, m, ov, done) {
  if (!container) return;
  const editable = canEdit(store.user);
  const approver = canApprove(store.user);
  const min = m.minutes || null;
  const status = min?.status || "NONE";
  const sigs = min?.signatures || [];

  container.innerHTML = `
    <div class="card" style="background:rgba(20,112,92,0.05);margin:12px 0">
      <div class="row" style="justify-content:space-between;align-items:flex-start">
        <h3 style="margin:0">📝 محضر الاجتماع</h3>
        <span class="lvl lvl-${minutesBadgeRole[status]}"><span class="dot"></span>${esc(MINUTES_STATUS[status])}</span>
      </div>
      ${min?.text ? `<p class="pre-line" style="margin-top:8px">${esc(min.text)}</p>` : '<p class="muted" style="margin-top:8px">لا يوجد محضر بعد.</p>'}
      ${min?.updatedAt ? `<p class="muted" style="font-size:0.8rem">آخر تحديث: ${fmtDateTime(min.updatedAt)}${min.authorId ? ` — ${esc(userName(min.authorId))}` : ""}</p>` : ""}

      ${sigs.length ? `
        <h4 style="margin:12px 0 6px">التواقيع (${sigs.length})</h4>
        <div class="sig-list">
          ${sigs.map((s) => `<div class="sig-card">
            <img src="${esc(s.dataUrl)}" alt="توقيع ${esc(s.name)}" class="sig-img" />
            <div><strong>${esc(s.name)}</strong>${s.title ? `<br/><span class="muted">${esc(s.title)}</span>` : ""}<br/><span class="muted" style="font-size:0.76rem">${fmtDateTime(s.signedAt)}</span></div>
          </div>`).join("")}
        </div>` : ""}

      ${status === "APPROVED" && min.approvedHash ? `
        <p class="muted" style="font-size:0.76rem;margin-top:8px;word-break:break-all">
          🔒 بصمة السلامة (SHA-256): <code id="min-hash">${esc(min.approvedHash.slice(0, 32))}…</code>
          <button class="secondary small" id="min-verify" title="التحقق من تطابق نص المحضر مع البصمة المعتمدة">تحقق</button>
        </p>` : ""}

      <div class="row" style="margin-top:10px">
        ${editable && status !== "APPROVED" && min?.text ? '<button id="min-approve" title="اعتماد المحضر وتوقيعه إلكترونياً وقفله">✒ اعتماد وتوقيع المحضر</button>' : ""}
        ${editable && status !== "APPROVED" ? '<button class="secondary" id="min-edit" title="تحرير مسودة المحضر">✎ تحرير المحضر</button>' : ""}
        ${status === "APPROVED" ? '<button class="secondary" id="min-print" title="فتح نسخة قابلة للطباعة من المحضر الموقّع">🖨 طباعة المحضر الموقّع</button>' : ""}
        ${editable && status === "APPROVED" ? '<button class="secondary" id="min-addsig" title="إضافة توقيع عضو آخر">✒ إضافة توقيع</button>' : ""}
        ${approver && status === "APPROVED" ? '<button class="danger" id="min-revoke" title="إلغاء اعتماد المحضر وإعادته مسودة">↺ إلغاء الاعتماد</button>' : ""}
      </div>
    </div>`;

  const redo = () => renderMinutes($("#minutes-section", ov), m, ov, done);
  $("#min-edit", container)?.addEventListener("click", () => openMinutesEditor(m, ov, done));
  $("#min-approve", container)?.addEventListener("click", () => openSignModal(m, ov, done, "approve"));
  $("#min-addsig", container)?.addEventListener("click", () => openSignModal(m, ov, done, "add"));
  $("#min-print", container)?.addEventListener("click", () => printMinutes(m));
  $("#min-verify", container)?.addEventListener("click", async () => {
    const ok = (await sha256Hex(canonical(m, m.minutes.text))) === m.minutes.approvedHash;
    toast(ok ? "✔ المحضر مطابق لبصمته المعتمدة — لم يُعبث به" : "⚠ عدم تطابق! تغيّر نص المحضر بعد الاعتماد", !ok);
  });
  $("#min-revoke", container)?.addEventListener("click", async () => {
    if (!(await confirmBox("إلغاء اعتماد المحضر وحذف تواقيعه وإعادته مسودة؟"))) return;
    const minutes = { ...m.minutes, status: "DRAFT", signatures: [], approvedHash: null, approvedAt: null, approvedById: null };
    await db.updateRow("cmeetings", m.id, { minutes });
    await db.audit("UPDATE", "Meeting", m.code, `إلغاء اعتماد محضر الاجتماع ${m.code}`);
    await reload("cmeetings");
    m.minutes = minutes;
    toast("أُعيد المحضر مسودة");
    redo();
    done();
  });
}

function openMinutesEditor(m, parentOv, done) {
  const min = m.minutes || {};
  const ed = modal(`
    <h2>✎ محضر الاجتماع — ${esc(m.code || m.title)}</h2>
    ${fld("نص المحضر", area("min-text", min.text, "القرارات والتوصيات وبنود المتابعة…", 12))}
    <p class="muted">بعد كتابة المحضر يمكن اعتماده وتوقيعه إلكترونياً؛ الاعتماد يقفل النص ويسجّل بصمة سلامة.</p>
    <div class="row" style="margin-top:14px">
      <button id="min-save">حفظ المسودة</button>
      <button class="secondary" id="min-cancel">إلغاء</button>
    </div>`, { wide: true });
  $("#min-cancel", ed).onclick = () => ed.remove();
  $("#min-save", ed).onclick = async () => {
    const text = val("min-text", ed);
    if (!text) return toast("نص المحضر فارغ", true);
    const minutes = { ...min, text, status: "DRAFT", authorId: store.user.uid, updatedAt: db.now() };
    try {
      await db.updateRow("cmeetings", m.id, { minutes });
      await db.audit("UPDATE", "Meeting", m.code, `تحديث مسودة محضر الاجتماع ${m.code}`);
      await reload("cmeetings");
      m.minutes = minutes;
      ed.remove();
      toast("حُفظت المسودة");
      renderMinutes($("#minutes-section", parentOv), m, parentOv, done);
    } catch (err) {
      toast(err.message, true);
    }
  };
}

// ---------- لوحة التوقيع المرسوم ----------
function wireSignaturePad(canvas) {
  const ctx = canvas.getContext("2d");
  ctx.lineWidth = 2.2;
  ctx.lineCap = "round";
  ctx.strokeStyle = "#14251f";
  let drawing = false, dirty = false, last = null;
  const pos = (e) => {
    const r = canvas.getBoundingClientRect();
    const t = e.touches?.[0] || e;
    return { x: ((t.clientX - r.left) / r.width) * canvas.width, y: ((t.clientY - r.top) / r.height) * canvas.height };
  };
  const start = (e) => { drawing = true; last = pos(e); e.preventDefault(); };
  const move = (e) => {
    if (!drawing) return;
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last = p; dirty = true; e.preventDefault();
  };
  const end = () => { drawing = false; };
  canvas.addEventListener("mousedown", start);
  canvas.addEventListener("mousemove", move);
  window.addEventListener("mouseup", end);
  canvas.addEventListener("touchstart", start, { passive: false });
  canvas.addEventListener("touchmove", move, { passive: false });
  canvas.addEventListener("touchend", end);
  return {
    clear: () => { ctx.clearRect(0, 0, canvas.width, canvas.height); dirty = false; },
    isEmpty: () => !dirty,
    dataUrl: () => canvas.toDataURL("image/png"),
  };
}

function openSignModal(m, parentOv, done, mode) {
  const u = store.user;
  const ed = modal(`
    <h2>✒ ${mode === "approve" ? "اعتماد وتوقيع المحضر" : "إضافة توقيع"} — ${esc(m.code || m.title)}</h2>
    <div class="form-grid">
      ${fld("اسم الموقّع *", txt("sg-name", u.name || ""))}
      ${fld("الصفة", txt("sg-title", "", "مثال: رئيس اللجنة / مدير الالتزام"))}
    </div>
    ${fld("التوقيع (ارسم بالفأرة أو باللمس) *", `<div class="sig-pad-wrap"><canvas id="sg-pad" width="600" height="180" class="sig-pad"></canvas></div>
      <button type="button" class="secondary small" id="sg-clear" style="margin-top:6px">مسح التوقيع</button>`)}
    <label class="chk-line" style="margin-top:8px"><input type="checkbox" id="sg-affirm" /> أقرّ بصحة ما ورد في المحضر وأعتمده بتوقيعي الإلكتروني.</label>
    <p class="muted">${mode === "approve" ? "الاعتماد يقفل نص المحضر ويسجّل بصمة سلامة (SHA-256) وتاريخ التوقيع في سجل التدقيق." : "يُضاف توقيعك إلى المحضر المعتمد."}</p>
    <div class="row" style="margin-top:14px">
      <button id="sg-save">${mode === "approve" ? "اعتماد وتوقيع" : "توقيع"}</button>
      <button class="secondary" id="sg-cancel">إلغاء</button>
    </div>`, { wide: true });

  const pad = wireSignaturePad($("#sg-pad", ed));
  $("#sg-clear", ed).onclick = () => pad.clear();
  $("#sg-cancel", ed).onclick = () => ed.remove();
  $("#sg-save", ed).onclick = async () => {
    const name = val("sg-name", ed);
    if (!name) return toast("اسم الموقّع إلزامي", true);
    if (pad.isEmpty()) return toast("الرجاء رسم التوقيع", true);
    if (!$("#sg-affirm", ed).checked) return toast("يجب الإقرار قبل التوقيع", true);
    const signedAt = db.now();
    const signature = {
      name,
      title: val("sg-title", ed) || "",
      signerId: u.uid,
      signedAt,
      dataUrl: pad.dataUrl(),
      hash: await sha256Hex(`${canonical(m, m.minutes.text)}|${name}|${signedAt}`),
    };
    try {
      const base = m.minutes || {};
      const minutes = { ...base, signatures: [...(base.signatures || []), signature] };
      if (mode === "approve") {
        minutes.status = "APPROVED";
        minutes.approvedAt = signedAt;
        minutes.approvedById = u.uid;
        minutes.approvedHash = await sha256Hex(canonical(m, base.text));
      }
      await db.updateRow("cmeetings", m.id, { minutes });
      await db.audit("APPROVE", "Meeting", m.code, `${mode === "approve" ? "اعتماد وتوقيع" : "توقيع"} محضر الاجتماع ${m.code} — الموقّع: ${name}`);
      await reload("cmeetings");
      m.minutes = minutes;
      ed.remove();
      toast(mode === "approve" ? "اعتُمد المحضر ووُقّع" : "أُضيف التوقيع");
      renderMinutes($("#minutes-section", parentOv), m, parentOv, done);
    } catch (err) {
      toast(err.message, true);
    }
  };
}

// ---------- طباعة المحضر الموقّع ----------
function printMinutes(m) {
  const min = m.minutes || {};
  const sigs = min.signatures || [];
  const sigCards = sigs.map((s) => `
    <div class="sig">
      <img src="${s.dataUrl}" alt="توقيع" />
      <div class="nm">${esc(s.name)}</div>
      ${s.title ? `<div class="tl">${esc(s.title)}</div>` : ""}
      <div class="dt">${fmtDateTime(s.signedAt)}</div>
    </div>`).join("");
  const html = `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8" />
    <title>محضر ${esc(m.code || "")} — ${esc(m.title)}</title>
    <style>
      body { font-family: "Segoe UI", Tahoma, sans-serif; color: #14251f; padding: 32px; line-height: 1.7; }
      h1 { color: #0d5243; border-bottom: 3px solid #14705c; padding-bottom: 8px; }
      .meta { color: #5d6c66; margin: 4px 0; font-size: 0.92rem; }
      .body { white-space: pre-line; margin: 20px 0; padding: 16px; background: #f5f8f7; border-radius: 8px; }
      .sigs { display: flex; flex-wrap: wrap; gap: 24px; margin-top: 28px; }
      .sig { text-align: center; border-top: 1px solid #ccc; padding-top: 8px; min-width: 180px; }
      .sig img { max-height: 70px; display: block; margin: 0 auto 4px; }
      .sig .nm { font-weight: 700; }
      .sig .tl, .sig .dt { color: #5d6c66; font-size: 0.82rem; }
      .hash { margin-top: 24px; font-size: 0.72rem; color: #5d6c66; word-break: break-all; }
      .badge { display: inline-block; background: #0ca30c; color: #fff; padding: 2px 10px; border-radius: 12px; font-size: 0.8rem; }
      @media print { button { display: none; } }
    </style></head><body>
    <h1>محضر اجتماع — ${esc(m.title)}</h1>
    <div class="meta">الرقم: ${esc(m.code || "—")} · النوع: ${esc(MEETING_TYPES[m.type] || m.type)} · ${esc(m.departmentId ? deptName(m.departmentId) : "على مستوى المنشأة")}</div>
    <div class="meta">الموعد: ${fmtDateTime(m.startAt)} · المكان: ${esc(m.location || "—")}</div>
    ${m.attendees ? `<div class="meta">الحضور: ${esc(m.attendees)}</div>` : ""}
    <div class="meta"><span class="badge">✔ معتمد وموقّع إلكترونياً</span> · تاريخ الاعتماد: ${fmtDateTime(min.approvedAt)}</div>
    <div class="body">${esc(min.text || "")}</div>
    <div class="sigs">${sigCards}</div>
    <div class="hash">بصمة السلامة (SHA-256): ${esc(min.approvedHash || "")}</div>
    <script>window.onload = function(){ window.print(); };<\/script>
    </body></html>`;
  const w = window.open("", "_blank");
  if (!w) return toast("مانع النوافذ المنبثقة يمنع الطباعة — اسمح بالنوافذ لهذا الموقع", true);
  w.document.write(html);
  w.document.close();
}
