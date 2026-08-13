// وحدة الاجتماعات — الاجتماع الأسبوعي لإدارة الالتزام + اجتماعات الإدارة مع الأقسام
// كل بند اجتماع = «مهمة» في مجموعة tasks (مصدر واحد للحقيقة): لها مسؤول وحالة،
// تظهر للمسؤول في «مهامي»، وتُرحَّل تلقائياً للاجتماع القادم حتى تُغلق فتنعكس الحالة على كل الاجتماعات.
import { store, reload, userName } from "../state.js";
import * as db from "../db.js";
import {
  $, esc, toast, modal, confirmBox, fld, statTile, donutChart, trendChart, hBars,
  emptyMsg, fmtDate, todayISO, inputFromISO, statusBadgeFrom,
} from "../ui.js";
import { canEdit } from "../auth.js";

const WM_STATUS = { OPEN: "مفتوحة", DONE: "منجزة" };
const WM_ROLE = { OPEN: "warning", DONE: "good" };
const MEETING_TYPES = { WEEKLY: "الاجتماع الأسبوعي", DEPT: "اجتماع مع قسم" };
const mtype = (m) => m.type || "WEEKLY";
const ttype = (t) => t.meetingType || "WEEKLY";

// ---------- منتقي ملف ----------
function pickFile(accept = "") {
  return new Promise((resolve) => {
    const inp = document.createElement("input");
    inp.type = "file"; if (accept) inp.accept = accept; inp.style.display = "none";
    inp.onchange = () => { const f = inp.files[0] || null; inp.remove(); resolve(f); };
    document.body.appendChild(inp); inp.click();
  });
}

// استيراد محاضر من ملف Excel بصيغة «محضر الاجتماع الأسبوعي … بتاريخ …»
async function parseWeeklyExcel(file) {
  if (typeof ExcelJS === "undefined") throw new Error("مكتبة Excel لم تُحمَّل — أعد تحميل الصفحة");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer()).catch(() => { throw new Error("تعذّرت قراءة الملف — تأكد أنه بصيغة Excel (.xlsx)"); });
  const ct = (v) => {
    if (v == null) return "";
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    if (typeof v === "object") { if (v.text != null) return String(v.text); if (v.result != null) return String(v.result); if (Array.isArray(v.richText)) return v.richText.map((x) => x.text).join(""); return ""; }
    return String(v).trim();
  };
  const parseDate = (a) => {
    const m = a.match(/بتاريخ\s*(\d{4})\s*\/\s*(\d{1,2})\s*\/\s*(\d{1,2})/);
    if (!m) return null;
    return new Date(Date.UTC(+m[1], +m[2] - 1, Math.max(1, +m[3]), 12)).toISOString();
  };
  const LABEL = /محاور الاجتماع|مواضيع تم/;
  const isDone = (due, rec) => [due, rec].some((x) => ["done", "تم", "تم التسليم"].includes(x.trim().toLowerCase()));
  const meetings = [];
  for (const ws of wb.worksheets) {
    let cur = null;
    ws.eachRow((row) => {
      const c1 = row.getCell(1);
      const master = c1.master || c1;
      const a = ct(c1.value);
      if (master.address === c1.address && a.includes("محضر الاجتماع")) {
        cur = { date: parseDate(a), items: [] }; meetings.push(cur); return;
      }
      if (!cur) return;
      const topic = ct(row.getCell(2).value), rec = ct(row.getCell(4).value), due = ct(row.getCell(5).value), asg = ct(row.getCell(6).value);
      if (LABEL.test(topic)) return;
      if (!(topic || rec || asg)) return;
      cur.items.push({ topic, recommendation: rec, due, assignees: asg, status: isDone(due, rec) ? "DONE" : "OPEN" });
    });
  }
  const byDate = {};
  for (const m of meetings.filter((m) => m.items.length && m.date)) {
    const k = m.date.slice(0, 10);
    if (!byDate[k] || m.items.length > byDate[k].items.length) byDate[k] = m;
  }
  return Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));
}

// ---------- أدوات التاريخ والمسؤول ----------
function weekStartISO(iso) {
  const d = new Date(iso || Date.now());
  if (isNaN(d)) return "";
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d.toISOString().slice(0, 10);
}
const shortDate = (iso) => { const d = new Date(iso); return isNaN(d) ? "—" : `${d.getDate()}/${d.getMonth() + 1}`; };
const isDateStr = (s) => !!s && /\d{3,4}/.test(s) && !isNaN(new Date(s).getTime());
const dueEditValue = (s) => (isDateStr(s) ? inputFromISO(s) : "");
const dueDisplay = (s) => (!s ? '<span class="muted">—</span>' : (isDateStr(s) ? esc(fmtDate(s)) : esc(s)));
function inputFromISOSafe(v) { return v ? new Date(v + "T12:00:00Z").toISOString() : ""; }

const activeUsers = () => store.users.filter((u) => u.active !== false);
const assigneeOptions = (selected) =>
  `<option value="">— بلا مسؤول —</option>` +
  activeUsers().map((u) => `<option value="${esc(u.id)}" ${u.id === selected ? "selected" : ""}>${esc(u.name || u.email)}</option>`).join("");
const assigneeLabel = (t) => (t.assigneeId ? userName(t.assigneeId) : (t.assignees ? t.assignees : "—"));

const meetingById = (id) => store.meetings.find((m) => m.id === id);
const tasksOf = (meetingId) => store.tasks.filter((t) => t.meetingId === meetingId);

// ---------- صفوف المهام في محرِّر المحضر ----------
function taskRow(t = {}, editable) {
  const st = t.status === "DONE" ? "DONE" : "OPEN";
  if (!editable) {
    return `<tr>
      <td>${esc(t.topic || "—")}</td>
      <td>${t.recommendation ? esc(t.recommendation) : '<span class="muted">—</span>'}</td>
      <td>${dueDisplay(t.due)}</td>
      <td>${esc(assigneeLabel(t))}</td>
      <td>${statusBadgeFrom(WM_STATUS, st, WM_ROLE)}</td>
    </tr>`;
  }
  return `<tr class="wm-row" data-id="${esc(t.id || "")}">
    <td><textarea class="wm-topic" rows="2" placeholder="المحور / الموضوع">${esc(t.topic || "")}</textarea></td>
    <td><textarea class="wm-rec" rows="2" placeholder="التوصية / الإجراء">${esc(t.recommendation || "")}</textarea></td>
    <td><input type="date" class="wm-due" data-orig="${esc(t.due || "")}" value="${dueEditValue(t.due)}" />${(t.due && !isDateStr(t.due)) ? `<div class="muted" style="font-size:.68rem;margin-top:2px">سابقاً: ${esc(t.due)}</div>` : ""}</td>
    <td><select class="wm-assignee">${assigneeOptions(t.assigneeId || "")}</select>${(!t.assigneeId && t.assignees) ? `<div class="muted" style="font-size:.68rem;margin-top:2px">مستورد: ${esc(t.assignees)}</div>` : ""}</td>
    <td><select class="wm-status">${Object.entries(WM_STATUS).map(([k, v]) => `<option value="${k}" ${k === st ? "selected" : ""}>${v}</option>`).join("")}</select></td>
    <td><button type="button" class="danger small wm-del" title="حذف البند">✕</button></td>
  </tr>`;
}
const editorHead = (editable) => `<thead><tr>
  <th style="min-width:170px">المحور / الموضوع</th><th style="min-width:170px">التوصيات</th>
  <th style="min-width:120px">موعد التسليم</th><th style="min-width:150px">المسؤول</th><th>الحالة</th>${editable ? "<th></th>" : ""}
</tr></thead>`;

function readTaskRows(root) {
  return [...root.querySelectorAll(".wm-row")].map((tr) => ({
    id: tr.dataset.id || "",
    topic: tr.querySelector(".wm-topic").value.trim(),
    recommendation: tr.querySelector(".wm-rec").value.trim(),
    due: tr.querySelector(".wm-due").value.trim() || (tr.querySelector(".wm-due").dataset.orig || ""),
    assigneeId: tr.querySelector(".wm-assignee").value || "",
    status: tr.querySelector(".wm-status").value === "DONE" ? "DONE" : "OPEN",
  })).filter((x) => x.topic || x.recommendation || x.assigneeId);
}

// ---------- المهام المرحَّلة (مفتوحة من اجتماعات سابقة) ----------
function carriedTable(tasks, canClose) {
  return `<div style="overflow-x:auto"><table>
    <thead><tr><th>المحور</th><th>التوصية</th><th>موعد التسليم</th><th>المسؤول</th><th>من محضر</th><th>الحالة</th>${canClose ? "<th></th>" : ""}</tr></thead>
    <tbody>${tasks.map((t) => {
      const om = meetingById(t.meetingId);
      return `<tr>
        <td>${esc(t.topic || "—")}</td>
        <td>${t.recommendation ? esc(t.recommendation) : '<span class="muted">—</span>'}</td>
        <td>${dueDisplay(t.due)}</td>
        <td>${esc(assigneeLabel(t))}</td>
        <td>${om ? `${esc(om.code)} · ${fmtDate(om.date)}` : '<span class="muted">—</span>'}</td>
        <td>${statusBadgeFrom(WM_STATUS, "OPEN", WM_ROLE)}</td>
        ${canClose ? `<td><button class="secondary small task-done" data-id="${esc(t.id)}" title="تعليم المهمة كمنجزة">✔ أُنجزت</button></td>` : ""}
      </tr>`;
    }).join("")}</tbody></table></div>`;
}

// تغيير حالة مهمة (إغلاق/إعادة فتح) — يعكس الحالة على كل الاجتماعات لأنها سجل واحد
async function setTaskStatus(id, status) {
  const patch = status === "DONE"
    ? { status: "DONE", closedAt: db.now(), closedById: store.user.uid, updatedAt: db.now() }
    : { status: "OPEN", closedAt: null, closedById: null, updatedAt: db.now() };
  await db.updateRow("tasks", id, patch);
  await reload("tasks");
}

// ---------- حفظ محضر + مزامنة مهامه ----------
async function saveMeeting(existing, meta, rows) {
  let meetingId, code;
  if (existing) {
    meetingId = existing.id; code = existing.code;
    await db.updateRow("meetings", meetingId, { ...meta, updatedAt: db.now() });
  } else {
    code = await db.nextCode("WM");
    const row = await db.setRow("meetings", db.newId("WM"), {
      code, title: MEETING_TYPES[meta.type] || "اجتماع", ...meta, migrated: true,
      createdById: store.user.uid, createdAt: db.now(), updatedAt: db.now(),
    });
    meetingId = row.id;
  }
  const existingTasks = tasksOf(meetingId);
  const keepIds = new Set(rows.filter((r) => r.id).map((r) => r.id));
  for (const t of existingTasks) if (!keepIds.has(t.id)) await db.removeRow("tasks", t.id);
  const notifyList = [];
  for (const r of rows) {
    const base = {
      meetingId, meetingType: meta.type, topic: r.topic, recommendation: r.recommendation,
      due: r.due, assigneeId: r.assigneeId || null, status: r.status, updatedAt: db.now(),
      closedAt: r.status === "DONE" ? db.now() : null, closedById: r.status === "DONE" ? store.user.uid : null,
    };
    if (r.id) {
      const prev = existingTasks.find((t) => t.id === r.id);
      await db.updateRow("tasks", r.id, base);
      if (r.assigneeId && r.status !== "DONE" && prev?.assigneeId !== r.assigneeId) notifyList.push({ uid: r.assigneeId, topic: r.topic, code });
    } else {
      const tcode = await db.nextCode("TSK");
      await db.setRow("tasks", db.newId("TSK"), { code: tcode, assignees: "", createdById: store.user.uid, createdAt: db.now(), ...base });
      if (r.assigneeId && r.status !== "DONE") notifyList.push({ uid: r.assigneeId, topic: r.topic, code });
    }
  }
  await db.audit(existing ? "UPDATE" : "CREATE", "Meeting", code, `${existing ? "تحديث" : "إنشاء"} ${MEETING_TYPES[meta.type] || "محضر"} (${rows.length} بند)`);
  for (const n of notifyList)
    await db.notify({ title: "مهمة جديدة مُسندة إليك", message: `${n.topic || "بند اجتماع"} — محضر ${n.code}`, type: "TASK", link: "mytasks", userId: n.uid });
  await reload("meetings", "tasks");
  return meetingId;
}

// ترحيل المحاضر القديمة (بنود مضمّنة) إلى مجموعة المهام — مرة واحدة
let migrationChecked = false;
async function migrateLegacy() {
  const legacy = store.meetings.filter((m) => !m.migrated && Array.isArray(m.items) && m.items.length);
  for (const m of legacy) {
    for (const it of m.items) {
      const tcode = await db.nextCode("TSK");
      await db.setRow("tasks", db.newId("TSK"), {
        code: tcode, meetingId: m.id, meetingType: mtype(m),
        topic: it.topic || "", recommendation: it.recommendation || "", due: it.due || "",
        assigneeId: null, assignees: it.assignees || "", status: it.status === "DONE" ? "DONE" : "OPEN",
        closedAt: it.status === "DONE" ? (m.updatedAt || m.createdAt || db.now()) : null, closedById: null,
        createdById: m.createdById || store.user.uid, createdAt: m.createdAt || db.now(), updatedAt: db.now(),
      });
    }
    await db.setFields("meetings", m.id, { migrated: true, type: mtype(m) });
  }
  if (legacy.length) { await db.audit("UPDATE", "Meeting", null, `ترحيل ${legacy.length} محضر إلى نظام المهام`); await reload("meetings", "tasks"); }
  return legacy.length;
}

// ---------- الصفحة الرئيسية للاجتماعات (حسب النوع) ----------
export function renderWeekly(el, nav, refresh) { return renderMeetings(el, nav, refresh, "WEEKLY"); }
export function renderDeptMeetings(el, nav, refresh) { return renderMeetings(el, nav, refresh, "DEPT"); }

function renderMeetings(el, nav, refresh, type) {
  const editable = canEdit(store.user);
  const rerender = () => renderMeetings(el, nav, refresh, type);

  if (editable && !migrationChecked && store.meetings.some((m) => !m.migrated && Array.isArray(m.items) && m.items.length)) {
    migrationChecked = true;
    migrateLegacy().then((n) => { if (n) rerender(); }).catch((e) => console.warn("migrate meetings failed", e));
  }

  const meetings = store.meetings.filter((m) => mtype(m) === type).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const typeTasks = store.tasks.filter((t) => ttype(t) === type);
  const latest = meetings[0] || null;

  // ---------- المؤشرات ----------
  const done = typeTasks.filter((t) => t.status === "DONE").length;
  const open = typeTasks.length - done;
  const donePct = typeTasks.length ? Math.round((done / typeTasks.length) * 100) : 0;
  const carriedTasks = typeTasks
    .filter((t) => t.status !== "DONE" && t.meetingId !== latest?.id)
    .sort((a, b) => (meetingById(a.meetingId)?.date || "").localeCompare(meetingById(b.meetingId)?.date || ""));

  const byAssignee = {};
  for (const t of typeTasks) { const label = t.assigneeId ? userName(t.assigneeId) : (t.assignees || null); if (label && label !== "—") byAssignee[label] = (byAssignee[label] || 0) + 1; }
  const topAssignees = Object.entries(byAssignee).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count).slice(0, 8);
  const trendPts = meetings.slice(0, 8).reverse().map((m) => ({ label: shortDate(m.date), value: tasksOf(m.id).length }));

  const meta = type === "WEEKLY"
    ? { icon: "🗓", title: "الاجتماع الأسبوعي", desc: "محاضر اجتماعات إدارة الالتزام الأسبوعية ومتابعة المهام" }
    : { icon: "🤝", title: "اجتماعات الأقسام", desc: "محاضر اجتماعات الإدارة مع الأقسام والجهات الأخرى ومتابعة مهامها" };

  const indicators = `
    <section class="card">
      <h2>📊 مؤشرات ${type === "WEEKLY" ? "الاجتماعات الأسبوعية" : "اجتماعات الأقسام"}</h2>
      <div class="stats">
        ${statTile(meetings.length, "عدد المحاضر")}
        ${statTile(typeTasks.length, "إجمالي المهام")}
        ${statTile(open, "مهام مفتوحة", `${carriedTasks.length} مُرحّلة من محاضر سابقة`)}
        ${statTile(`${donePct}%`, "نسبة الإنجاز", `${done} منجزة`)}
      </div>
      <div class="grid-2" style="margin-top:12px">
        <div><h3>حالة المهام</h3>${donutChart([
          { label: "منجزة", count: done, color: "#0ca30c" },
          { label: "مفتوحة", count: open, color: "#e6a100" },
        ], { unit: "مهمة" })}</div>
        <div><h3>عدد المهام عبر المحاضر</h3>${trendChart(trendPts, { unit: " مهمة", color: "#14705c" })}</div>
      </div>
      <h3 style="margin-top:12px">المهام حسب المسؤول</h3>
      ${topAssignees.length ? hBars(topAssignees) : '<p class="muted">لا توجد بيانات بعد</p>'}
    </section>`;

  // ---------- المهام المرحَّلة ----------
  const carriedCard = carriedTasks.length ? `
    <section class="card" style="border-top:3px solid #e6a100">
      <h2 style="margin-top:0">↪️ مهام مُرحّلة للمتابعة (${carriedTasks.length})</h2>
      <p class="muted" style="margin-top:-4px">مهام مفتوحة من محاضر سابقة تنتقل تلقائياً حتى تُغلق — عند إنجازها تنعكس الحالة على جميع الاجتماعات.</p>
      ${carriedTable(carriedTasks, editable)}
    </section>` : "";

  // ---------- تعبئة اجتماع هذا الأسبوع (للأسبوعي فقط) ----------
  let topCard = "";
  let current = null;
  if (type === "WEEKLY") {
    const thisWeekKey = weekStartISO(todayISO());
    current = meetings.find((m) => weekStartISO(m.date) === thisWeekKey) || null;
    const currentTasks = current ? tasksOf(current.id) : [];
    const rows = currentTasks.length ? currentTasks : [{}];
    topCard = `
      <section class="card" style="border-top:3px solid #14705c">
        <div class="row" style="justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
          <h2 style="margin:0">📝 تعبئة اجتماع هذا الأسبوع</h2>
          <span class="muted">${current ? `محضر ${esc(current.code)} — قيد التحديث` : "محضر جديد"}</span>
        </div>
        ${editable ? `
          ${fld("تاريخ الاجتماع", `<input type="date" id="tw-date" value="${inputFromISO(current?.date || todayISO())}" style="max-width:200px" />`)}
          <div style="overflow-x:auto"><table id="tw-table">${editorHead(true)}<tbody id="tw-body">
            ${rows.map((it) => taskRow(it, true)).join("")}
          </tbody></table></div>
          <div class="row" style="margin-top:10px;gap:8px;flex-wrap:wrap">
            <button class="secondary" id="tw-add">＋ إضافة بند</button>
            <button id="tw-save">💾 حفظ محضر الأسبوع</button>
          </div>`
        : (current
          ? `<div style="overflow-x:auto"><table>${editorHead(false)}<tbody>${tasksOf(current.id).map((it) => taskRow(it, false)).join("")}</tbody></table></div>`
          : `<p class="muted">لم يُسجَّل محضر لهذا الأسبوع بعد</p>`)}
      </section>`;
  }

  // ---------- قائمة المحاضر ----------
  const list = `
    <section class="card">
      <h2>🗂 محاضر ${type === "WEEKLY" ? "الاجتماعات الأسبوعية" : "اجتماعات الأقسام"} (${meetings.length})</h2>
      <div style="overflow-x:auto"><table>
        <thead><tr><th>الرقم</th><th>التاريخ</th>${type === "DEPT" ? "<th>القسم / الجهة</th>" : ""}<th>المهام</th><th>منجزة / مفتوحة</th><th>آخر تحديث</th></tr></thead>
        <tbody>
          ${meetings.map((m) => {
            const its = tasksOf(m.id), d = its.filter((i) => i.status === "DONE").length;
            return `<tr class="rowlink" data-open="${m.id}">
              <td><strong>${esc(m.code)}</strong></td>
              <td>${fmtDate(m.date)}</td>
              ${type === "DEPT" ? `<td>${m.party ? esc(m.party) : '<span class="muted">—</span>'}</td>` : ""}
              <td>${its.length}</td>
              <td>${d} / ${its.length - d}</td>
              <td>${fmtDate(m.updatedAt || m.createdAt)}</td>
            </tr>`;
          }).join("") || `<tr><td colspan="${type === "DEPT" ? 6 : 5}">${emptyMsg("لا توجد محاضر بعد")}</td></tr>`}
        </tbody>
      </table></div>
    </section>`;

  el.innerHTML = `
    <div class="page-head">
      <div><h1>${meta.icon} ${meta.title}</h1><p class="muted">${meta.desc}</p></div>
      ${editable ? `<div class="row" style="gap:6px;flex-wrap:wrap">
        ${type === "WEEKLY" ? `<button class="secondary" id="wm-import" title="استيراد محاضر من ملف Excel">⬆ استيراد من Excel</button>` : ""}
        <button id="wm-new" title="إنشاء محضر جديد">＋ محضر جديد</button>
      </div>` : ""}
    </div>
    ${topCard}
    ${carriedCard}
    ${indicators}
    ${list}`;

  // ---------- الأحداث ----------
  const bindDel = () => el.querySelectorAll(".wm-del").forEach((b) => (b.onclick = () => b.closest("tr").remove()));
  bindDel();
  $("#tw-add", el)?.addEventListener("click", () => { $("#tw-body", el)?.insertAdjacentHTML("beforeend", taskRow({}, true)); bindDel(); });
  $("#tw-save", el)?.addEventListener("click", async () => {
    const date = inputFromISOSafe($("#tw-date", el)?.value) || todayISO();
    const rows = readTaskRows($("#tw-table", el));
    if (!rows.length) return toast("أضِف بنداً واحداً على الأقل", true);
    try { await saveMeeting(current, { type: "WEEKLY", date }, rows); toast("حُفظ محضر الأسبوع"); rerender(); }
    catch (err) { toast(err.message, true); }
  });
  $("#wm-new", el)?.addEventListener("click", () => openMeetingModal(null, type, rerender));
  el.querySelectorAll(".task-done").forEach((b) => (b.onclick = async () => {
    try { await setTaskStatus(b.dataset.id, "DONE"); toast("تم تعليم المهمة كمنجزة"); rerender(); }
    catch (err) { toast(err.message, true); }
  }));
  el.querySelectorAll("[data-open]").forEach((tr) =>
    tr.addEventListener("click", () => openMeetingModal(meetingById(tr.dataset.open), type, rerender))
  );

  $("#wm-import", el)?.addEventListener("click", async () => {
    const file = await pickFile(".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    if (!file) return;
    toast("جارٍ قراءة الملف…");
    try {
      const parsed = await parseWeeklyExcel(file);
      if (!parsed.length) return toast("لم يُعثر على محاضر في الملف", true);
      const existing = new Set(store.meetings.filter((m) => mtype(m) === "WEEKLY").map((m) => (m.date || "").slice(0, 10)));
      const toAdd = parsed.filter((m) => !existing.has(m.date.slice(0, 10)));
      if (!toAdd.length) return toast("جميع المحاضر مستوردة مسبقاً");
      const totalItems = toAdd.reduce((s, m) => s + m.items.length, 0);
      if (!(await confirmBox(`استيراد ${toAdd.length} محضراً (${totalItems} بنداً) من الملف؟`))) return;
      for (const m of toAdd) {
        const code = await db.nextCode("WM");
        const row = await db.setRow("meetings", db.newId("WM"), {
          code, title: MEETING_TYPES.WEEKLY, type: "WEEKLY", date: m.date, migrated: true,
          createdById: store.user.uid, createdAt: db.now(), updatedAt: db.now(),
        });
        for (const it of m.items) {
          const tcode = await db.nextCode("TSK");
          await db.setRow("tasks", db.newId("TSK"), {
            code: tcode, meetingId: row.id, meetingType: "WEEKLY",
            topic: it.topic || "", recommendation: it.recommendation || "", due: it.due || "",
            assigneeId: null, assignees: it.assignees || "", status: it.status === "DONE" ? "DONE" : "OPEN",
            closedAt: null, closedById: null, createdById: store.user.uid, createdAt: db.now(), updatedAt: db.now(),
          });
        }
      }
      await db.audit("CREATE", "Meeting", null, `استيراد ${toAdd.length} محضر اجتماع أسبوعي من Excel`);
      await reload("meetings", "tasks");
      toast(`استُورد ${toAdd.length} محضراً (${totalItems} بنداً)`);
      rerender();
    } catch (err) { toast(err.message, true); }
  });
}

// ---------- نافذة تحرير/عرض محضر ----------
function openMeetingModal(m, type, done) {
  const editable = canEdit(store.user);
  const mType = m ? mtype(m) : type;
  const own = m ? tasksOf(m.id) : [];
  const rows = own.length ? own : [{}];
  const carried = m
    ? store.tasks.filter((t) => ttype(t) === mType && t.status !== "DONE" && t.meetingId !== m.id && (meetingById(t.meetingId)?.date || "") < (m.date || "￿"))
        .sort((a, b) => (meetingById(a.meetingId)?.date || "").localeCompare(meetingById(b.meetingId)?.date || ""))
    : [];

  const partyField = mType === "DEPT"
    ? fld("القسم / الجهة", `<input type="text" id="mm-party" list="mm-depts" value="${esc(m?.party || "")}" placeholder="اسم القسم أو الجهة" style="max-width:320px" />
        <datalist id="mm-depts">${store.departments.map((d) => `<option value="${esc(d.name)}"></option>`).join("")}</datalist>`)
    : "";

  const ov = modal(`
    <div class="row" style="justify-content:space-between">
      <h2>${m ? `محضر ${esc(m.code)}` : (mType === "DEPT" ? "محضر اجتماع مع قسم" : "محضر أسبوعي جديد")}</h2>
      ${m ? `<span class="muted">${fmtDate(m.date)}</span>` : ""}
    </div>
    ${editable
      ? `${fld("تاريخ الاجتماع", `<input type="date" id="mm-date" value="${inputFromISO(m?.date || todayISO())}" style="max-width:200px" />`)}
         ${partyField}
         <h3 style="margin:6px 0">بنود المحضر ومهامه</h3>
         <div style="overflow-x:auto"><table id="mm-table">${editorHead(true)}<tbody id="mm-body">${rows.map((it) => taskRow(it, true)).join("")}</tbody></table></div>
         <div class="row" style="margin-top:10px;gap:8px;flex-wrap:wrap">
           <button class="secondary" id="mm-add">＋ إضافة بند</button>
           <button id="mm-save">حفظ</button>
           ${m ? '<button class="danger" id="mm-del">حذف المحضر</button>' : ""}
           <button class="secondary" id="mm-close">إغلاق</button>
         </div>`
      : `${mType === "DEPT" && m?.party ? `<p class="muted">القسم / الجهة: ${esc(m.party)}</p>` : ""}
         <div style="overflow-x:auto"><table>${editorHead(false)}<tbody>${(m ? tasksOf(m.id) : []).map((it) => taskRow(it, false)).join("")}</tbody></table></div>
         <div class="row" style="margin-top:12px"><button class="secondary" id="mm-close">إغلاق</button></div>`}
    ${carried.length ? `<h3 style="margin:14px 0 6px">↪️ مهام مُرحّلة مفتوحة (${carried.length})</h3>
      <p class="muted" style="margin-top:-4px">من محاضر سابقة — تُتابَع حتى تُغلق.</p>${carriedTable(carried, editable)}` : ""}`,
    { wide: true });

  $("#mm-close", ov).onclick = () => ov.remove();
  const bindDel = () => ov.querySelectorAll(".wm-del").forEach((b) => (b.onclick = () => b.closest("tr").remove()));
  bindDel();
  $("#mm-add", ov)?.addEventListener("click", () => { $("#mm-body", ov).insertAdjacentHTML("beforeend", taskRow({}, true)); bindDel(); });
  ov.querySelectorAll(".task-done").forEach((b) => (b.onclick = async () => {
    try { await setTaskStatus(b.dataset.id, "DONE"); toast("تم تعليم المهمة كمنجزة"); ov.remove(); done(); }
    catch (err) { toast(err.message, true); }
  }));
  $("#mm-save", ov)?.addEventListener("click", async () => {
    const date = inputFromISOSafe($("#mm-date", ov)?.value) || todayISO();
    const rowsData = readTaskRows($("#mm-table", ov));
    if (!rowsData.length) return toast("أضِف بنداً واحداً على الأقل", true);
    const metaObj = { type: mType, date };
    if (mType === "DEPT") metaObj.party = ($("#mm-party", ov)?.value || "").trim();
    try { await saveMeeting(m, metaObj, rowsData); ov.remove(); toast("حُفظ"); done(); }
    catch (err) { toast(err.message, true); }
  });
  $("#mm-del", ov)?.addEventListener("click", async () => {
    ov.remove();
    if (!(await confirmBox(`حذف محضر ${m.code} وكل مهامه؟`))) return;
    for (const t of tasksOf(m.id)) await db.removeRow("tasks", t.id);
    await db.removeRow("meetings", m.id);
    await db.audit("DELETE", "Meeting", m.code, `حذف محضر ${m.code}`);
    await reload("meetings", "tasks"); toast("تم الحذف"); done();
  });
}

// ---------- مهامي: المهام المُسندة للمستخدم عبر كل الاجتماعات ----------
export function renderMyTasks(el, nav, refresh) {
  const me = store.user;
  const editable = canEdit(me);
  const rerender = () => renderMyTasks(el, nav, refresh);
  const mine = store.tasks.filter((t) => t.assigneeId === me.uid).sort((a, b) => (a.due || "￿").localeCompare(b.due || "￿"));
  const open = mine.filter((t) => t.status !== "DONE");
  const doneTasks = mine.filter((t) => t.status === "DONE");
  const donePct = mine.length ? Math.round((doneTasks.length / mine.length) * 100) : 0;

  const taskTable = (tasks, showClose, closedCol) => `<div style="overflow-x:auto"><table>
    <thead><tr><th>المحور / الموضوع</th><th>التوصية</th><th>موعد التسليم</th><th>الاجتماع</th><th>الحالة</th>${(showClose || closedCol) ? "<th></th>" : ""}</tr></thead>
    <tbody>${tasks.map((t) => {
      const om = meetingById(t.meetingId);
      const src = om ? `${esc(om.code)} · ${MEETING_TYPES[ttype(t)] || ""} · ${fmtDate(om.date)}` : "—";
      return `<tr>
        <td>${esc(t.topic || "—")}</td>
        <td>${t.recommendation ? esc(t.recommendation) : '<span class="muted">—</span>'}</td>
        <td>${dueDisplay(t.due)}</td>
        <td>${src}</td>
        <td>${statusBadgeFrom(WM_STATUS, t.status === "DONE" ? "DONE" : "OPEN", WM_ROLE)}</td>
        ${showClose ? `<td><button class="secondary small mt-done" data-id="${esc(t.id)}" title="تعليم كمنجزة">✔ أُنجزت</button></td>` : ""}
        ${closedCol ? `<td><button class="secondary small mt-reopen" data-id="${esc(t.id)}" title="إعادة فتح">↺ إعادة فتح</button></td>` : ""}
      </tr>`;
    }).join("") || `<tr><td colspan="6">${emptyMsg("لا توجد مهام")}</td></tr>`}</tbody></table></div>`;

  el.innerHTML = `
    <div class="page-head">
      <div><h1>✅ مهامي</h1><p class="muted">المهام المُسندة إليك في محاضر الاجتماعات — تُغلق تلقائياً في جميع الاجتماعات عند إنجازها</p></div>
    </div>
    <section class="card">
      <div class="stats">
        ${statTile(mine.length, "إجمالي مهامي")}
        ${statTile(open.length, "مفتوحة")}
        ${statTile(doneTasks.length, "منجزة")}
        ${statTile(`${donePct}%`, "نسبة الإنجاز")}
      </div>
    </section>
    <section class="card">
      <h2>🔴 مهام مفتوحة (${open.length})</h2>
      ${taskTable(open, true, false)}
    </section>
    ${doneTasks.length ? `<section class="card">
      <h2>🟢 مهام منجزة (${doneTasks.length})</h2>
      ${taskTable(doneTasks, false, editable)}
    </section>` : ""}`;

  el.querySelectorAll(".mt-done").forEach((b) => (b.onclick = async () => {
    try { await setTaskStatus(b.dataset.id, "DONE"); toast("تم تعليم المهمة كمنجزة"); rerender(); }
    catch (err) { toast("تعذّر التحديث — قد لا تملك صلاحية إغلاق هذه المهمة", true); }
  }));
  el.querySelectorAll(".mt-reopen").forEach((b) => (b.onclick = async () => {
    try { await setTaskStatus(b.dataset.id, "OPEN"); toast("أُعيد فتح المهمة"); rerender(); }
    catch (err) { toast(err.message, true); }
  }));
}
