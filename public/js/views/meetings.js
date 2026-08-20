// الاجتماعات — الاجتماعات الأسبوعية واجتماعات الإدارات واللجان، مع مزامنة التقويم (‏.ics / Google)
// ومحاضر موقّعة إلكترونياً (انظر قسم المحضر). الاستحقاقات تظهر في تقويم لوحة التحكم والتنبيهات.
import { store, reload, deptName, deptOptions } from "../state.js";
import * as db from "../db.js";
import {
  $, esc, toast, modal, confirmBox, fld, txt, area, sel, val,
  fmtDate, fmtDateTime, dateTimeInp, isoFromDateTime, daysUntil,
  statusBadgeFrom, emptyMsg, keepFocus,
} from "../ui.js";
import { MEETING_TYPES, MEETING_STATUS, MEETING_RECURRENCE, MINUTES_STATUS } from "../meta.js";
import { buildICS, googleCalUrl, downloadICS } from "../calendar.js";
import { canEdit } from "../auth.js";
import { renderMinutes, minutesBadgeRole } from "./meeting-minutes.js";

const ST_ROLE = { SCHEDULED: "warning", HELD: "good", CANCELLED: "neutral" };
const TYPE_ICON = { WEEKLY: "🔁", DEPARTMENT: "🏢", COMMITTEE: "👥", REVIEW: "🔍", OTHER: "🗓" };
const filters = { search: "", type: "", status: "", dept: "" };

const isUpcoming = (m) => m.status === "SCHEDULED" && m.startAt && daysUntil(m.startAt) >= 0;

export function renderMeetings(el, nav, refresh) {
  const editable = canEdit(store.user);
  const all = store.meetings;
  const rows = all.filter((m) => {
    if (filters.search && !`${m.code} ${m.title} ${m.location || ""}`.includes(filters.search)) return false;
    if (filters.type && m.type !== filters.type) return false;
    if (filters.status && m.status !== filters.status) return false;
    if (filters.dept && m.departmentId !== filters.dept) return false;
    return true;
  }).sort((a, b) => (b.startAt || "").localeCompare(a.startAt || ""));

  const upcoming = all.filter(isUpcoming);
  const held = all.filter((m) => m.status === "HELD");
  const approved = all.filter((m) => m.minutes?.status === "APPROVED");
  const weekAhead = upcoming.filter((m) => daysUntil(m.startAt) <= 7);

  el.innerHTML = `
    <div class="page-head">
      <h1>🗓 الاجتماعات</h1>
      <div class="row">
        ${upcoming.length ? '<button class="secondary" id="sync-all" title="تنزيل ملف تقويم بكل الاجتماعات القادمة لإضافتها إلى تقويمك">⬇ مزامنة كل الاجتماعات (.ics)</button>' : ""}
        ${editable ? '<button id="add-mtg" title="جدولة اجتماع جديد">＋ اجتماع جديد</button>' : ""}
      </div>
    </div>
    <div class="stats">
      <div class="stat"><div class="num">${all.length}</div><div class="lbl">إجمالي الاجتماعات</div></div>
      <div class="stat"><div class="num">${upcoming.length}</div><div class="lbl">قادمة</div><div class="sub">${weekAhead.length} خلال أسبوع</div></div>
      <div class="stat"><div class="num">${held.length}</div><div class="lbl">انعقدت</div></div>
      <div class="stat"><div class="num">${approved.length}</div><div class="lbl">محاضر معتمدة وموقّعة</div></div>
    </div>
    <section class="card">
      <div class="row filters">
        <input type="text" id="f-search" class="grow" placeholder="بحث بالرمز أو العنوان أو المكان…" value="${esc(filters.search)}" />
        ${sel("f-type", MEETING_TYPES, filters.type, { empty: "كل الأنواع" })}
        ${sel("f-status", MEETING_STATUS, filters.status, { empty: "كل الحالات" })}
        ${sel("f-dept", deptOptions(), filters.dept, { empty: "كل الإدارات" })}
      </div>
      <div style="overflow-x:auto">
        <table>
          <thead><tr>
            <th>الرقم</th><th>النوع</th><th>العنوان</th><th>الإدارة</th><th>الموعد</th>
            <th>التكرار</th><th>المحضر</th><th>الحالة</th>
          </tr></thead>
          <tbody>
            ${rows.map((m) => `<tr class="rowlink" data-open="${m.id}">
              <td><strong>${esc(m.code || "—")}</strong></td>
              <td>${TYPE_ICON[m.type] || "🗓"} ${esc(MEETING_TYPES[m.type] || m.type)}</td>
              <td><strong>${esc(m.title)}</strong></td>
              <td>${esc(m.departmentId ? deptName(m.departmentId) : "—")}</td>
              <td>${fmtDateTime(m.startAt)}</td>
              <td class="muted">${esc(MEETING_RECURRENCE[m.recurrence] || "بلا تكرار")}</td>
              <td>${m.minutes?.status ? statusBadgeFrom(MINUTES_STATUS, m.minutes.status, minutesBadgeRole) : '<span class="muted">—</span>'}</td>
              <td>${statusBadgeFrom(MEETING_STATUS, m.status, ST_ROLE)}</td>
            </tr>`).join("") || `<tr><td colspan="8">${emptyMsg("لا توجد اجتماعات مطابقة")}</td></tr>`}
          </tbody>
        </table>
      </div>
      <p class="muted">عدد النتائج: ${rows.length} من ${all.length}</p>
    </section>`;

  const rerender = () => renderMeetings(el, nav, refresh);
  $("#f-search", el).addEventListener("input", (e) => { filters.search = e.target.value; keepFocus(rerender); });
  $("#f-type", el).onchange = (e) => { filters.type = e.target.value; rerender(); };
  $("#f-status", el).onchange = (e) => { filters.status = e.target.value; rerender(); };
  $("#f-dept", el).onchange = (e) => { filters.dept = e.target.value; rerender(); };
  $("#add-mtg", el)?.addEventListener("click", () => openForm(null, rerender));
  $("#sync-all", el)?.addEventListener("click", () => {
    downloadICS("compliance-meetings", buildICS(upcoming));
    toast(`نُزّل ملف تقويم بـ ${upcoming.length} اجتماعاً`);
  });
  el.querySelectorAll("[data-open]").forEach((tr) =>
    tr.addEventListener("click", () => openDetail(tr.dataset.open, nav, rerender))
  );
}

function openForm(m, done) {
  const isNew = !m;
  const ov = modal(`
    <h2>${isNew ? "جدولة اجتماع جديد" : `تعديل ${esc(m.code || m.title)}`}</h2>
    <div class="form-grid">
      ${fld("عنوان الاجتماع *", txt("m-title", m?.title, "مثال: اجتماع لجنة الالتزام الأسبوعي"))}
      ${fld("النوع", sel("m-type", MEETING_TYPES, m?.type || "WEEKLY"))}
      ${fld("الإدارة / اللجنة", sel("m-dept", deptOptions(), m?.departmentId, { empty: "— على مستوى المنشأة —" }))}
      ${fld("الموعد والوقت *", dateTimeInp("m-start", m?.startAt))}
      ${fld("المدة (دقائق)", `<input type="number" id="m-dur" min="15" max="480" step="15" value="${esc(m?.durationMin ?? 60)}" />`)}
      ${fld("المكان / رابط الاجتماع", txt("m-loc", m?.location, "قاعة الاجتماعات أو رابط Teams/Zoom"))}
      ${fld("التكرار", sel("m-rec", MEETING_RECURRENCE, m?.recurrence || "NONE"))}
      ${fld("الحالة", sel("m-status", MEETING_STATUS, m?.status || "SCHEDULED"))}
    </div>
    ${fld("الحضور (أسماء مفصولة بفواصل)", area("m-att", m?.attendees, "", 2))}
    ${fld("جدول الأعمال", area("m-agenda", m?.agenda, "بنود الاجتماع…", 4))}
    <div class="row" style="margin-top:14px">
      <button id="m-save">حفظ</button>
      <button class="secondary" id="m-cancel">إلغاء</button>
    </div>`, { wide: true });
  $("#m-cancel", ov).onclick = () => ov.remove();
  $("#m-save", ov).onclick = async () => {
    const title = val("m-title", ov);
    const startInput = $("#m-start", ov).value;
    if (!title) return toast("عنوان الاجتماع إلزامي", true);
    if (!startInput) return toast("موعد الاجتماع إلزامي", true);
    const data = {
      title,
      type: val("m-type", ov),
      departmentId: val("m-dept", ov) || null,
      startAt: isoFromDateTime(startInput),
      durationMin: Number(val("m-dur", ov)) || 60,
      location: val("m-loc", ov) || null,
      recurrence: val("m-rec", ov),
      status: val("m-status", ov),
      attendees: val("m-att", ov),
      agenda: val("m-agenda", ov),
    };
    try {
      if (isNew) {
        const code = await db.nextCode("MTG");
        await db.setRow("meetings", code, { ...data, code, minutes: null, createdById: store.user.uid, createdAt: db.now(), updatedAt: db.now() });
        await db.audit("CREATE", "Meeting", code, `جدولة اجتماع: ${code} — ${title}`);
        if (data.status === "SCHEDULED") {
          await db.notify({
            title: "اجتماع مجدول",
            message: `${code} — ${MEETING_TYPES[data.type]}: ${title} (${fmtDateTime(data.startAt)})`,
            type: "MEETING_NEW",
            link: "meetings",
            roleTarget: "COMPLIANCE_MANAGER",
          });
        }
      } else {
        await db.updateRow("meetings", m.id, data);
        await db.audit("UPDATE", "Meeting", m.code, `تعديل الاجتماع ${m.code}`);
      }
      await reload("meetings", "notifications");
      ov.remove();
      toast("تم الحفظ");
      done();
    } catch (err) {
      toast(err.message, true);
    }
  };
}

export function openDetail(id, nav, done) {
  const m = store.meetings.find((x) => x.id === id);
  if (!m) return;
  const editable = canEdit(store.user);

  const ov = modal(`
    <div class="row" style="justify-content:space-between">
      <h2>${TYPE_ICON[m.type] || "🗓"} ${esc(m.code || "")} — ${esc(m.title)}</h2>
      <span>${statusBadgeFrom(MEETING_STATUS, m.status, ST_ROLE)}</span>
    </div>
    <div class="detail-grid">
      <div><span class="muted">النوع</span><br/>${esc(MEETING_TYPES[m.type] || m.type)}</div>
      <div><span class="muted">الإدارة / اللجنة</span><br/>${esc(m.departmentId ? deptName(m.departmentId) : "على مستوى المنشأة")}</div>
      <div><span class="muted">الموعد</span><br/>${fmtDateTime(m.startAt)}</div>
      <div><span class="muted">المدة</span><br/>${esc(m.durationMin || 60)} دقيقة</div>
      <div><span class="muted">التكرار</span><br/>${esc(MEETING_RECURRENCE[m.recurrence] || "بلا تكرار")}</div>
      <div><span class="muted">المكان</span><br/>${esc(m.location || "—")}</div>
    </div>
    ${m.attendees ? `<p class="pre-line"><strong>الحضور:</strong> ${esc(m.attendees)}</p>` : ""}
    ${m.agenda ? `<p class="pre-line"><strong>جدول الأعمال:</strong>\n${esc(m.agenda)}</p>` : ""}

    <div class="card" style="background:rgba(20,112,92,0.05);margin:12px 0">
      <h3 style="margin:0 0 8px">📆 مزامنة التقويم</h3>
      <div class="row">
        <a class="btn-link" id="m-gcal" href="${esc(googleCalUrl(m))}" target="_blank" rel="noopener" title="إضافة الاجتماع إلى Google Calendar">➕ Google Calendar</a>
        <button class="secondary" id="m-ics" title="تنزيل ملف .ics لإضافته إلى Outlook أو Apple Calendar">⬇ تنزيل .ics</button>
      </div>
      <p class="muted" style="margin-top:6px">أضف الاجتماع${m.recurrence && m.recurrence !== "NONE" ? " المتكرر" : ""} إلى تقويمك الشخصي أو تقويم الإدارة.</p>
    </div>

    <div id="minutes-section"></div>

    <div class="row" style="margin-top:14px">
      ${editable ? `
        <button id="m-edit" title="تعديل بيانات الاجتماع">تعديل</button>
        ${m.status === "SCHEDULED" ? '<button class="secondary" id="m-held" title="تعليم الاجتماع كمنعقد">✔ انعقد</button>' : ""}
        ${m.status !== "CANCELLED" ? '<button class="secondary" id="m-cancel-mtg" title="إلغاء الاجتماع">✕ إلغاء الاجتماع</button>' : ""}
        <button class="danger" id="m-del" title="حذف الاجتماع نهائياً">حذف</button>` : ""}
      <button class="secondary" id="m-close" title="إغلاق النافذة">إغلاق</button>
    </div>`, { wide: true });

  $("#m-close", ov).onclick = () => ov.remove();
  $("#m-ics", ov).onclick = () => { downloadICS(m.code || "meeting", buildICS(m)); toast("نُزّل ملف التقويم"); };
  $("#m-edit", ov)?.addEventListener("click", () => { ov.remove(); openForm(m, done); });
  $("#m-held", ov)?.addEventListener("click", async () => {
    await db.updateRow("meetings", m.id, { status: "HELD" });
    await db.audit("UPDATE", "Meeting", m.code, `تعليم الاجتماع ${m.code} كمنعقد`);
    await reload("meetings");
    ov.remove();
    toast("عُلّم كمنعقد");
    done();
  });
  $("#m-cancel-mtg", ov)?.addEventListener("click", async () => {
    if (!(await confirmBox(`إلغاء الاجتماع ${m.code}؟`))) return;
    await db.updateRow("meetings", m.id, { status: "CANCELLED" });
    await db.audit("UPDATE", "Meeting", m.code, `إلغاء الاجتماع ${m.code}`);
    await reload("meetings");
    ov.remove();
    toast("أُلغي الاجتماع");
    done();
  });
  $("#m-del", ov)?.addEventListener("click", async () => {
    ov.remove();
    if (!(await confirmBox(`حذف الاجتماع ${m.code} نهائياً؟`))) return;
    await db.removeRow("meetings", m.id);
    await db.audit("DELETE", "Meeting", m.code, `حذف الاجتماع ${m.code} — ${m.title}`);
    await reload("meetings");
    toast("تم الحذف");
    done();
  });

  // قسم المحضر والتوقيع الإلكتروني (يُبنى في وحدة مستقلة)
  renderMinutes($("#minutes-section", ov), m, ov, done);
}
