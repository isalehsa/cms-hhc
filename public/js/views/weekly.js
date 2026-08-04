// الاجتماع الأسبوعي — محاضر الاجتماعات الأسبوعية لإدارة الالتزام
// كل محضر: تاريخ + بنود (محور/موضوع، التوصيات، موعد التسليم، المنفّذون، الحالة)
// الصفحة: تعبئة محضر هذا الأسبوع أعلى الصفحة + مؤشرات + قائمة المحاضر
import { store, reload } from "../state.js";
import * as db from "../db.js";
import {
  $, esc, toast, modal, confirmBox, fld, statTile, donutChart, trendChart, hBars,
  emptyMsg, fmtDate, todayISO, inputFromISO, statusBadgeFrom,
} from "../ui.js";
import { canEdit } from "../auth.js";

const WM_STATUS = { OPEN: "مفتوحة", DONE: "منجزة" };

// منتقي ملف
function pickFile(accept = "") {
  return new Promise((resolve) => {
    const inp = document.createElement("input");
    inp.type = "file"; if (accept) inp.accept = accept; inp.style.display = "none";
    inp.onchange = () => { const f = inp.files[0] || null; inp.remove(); resolve(f); };
    document.body.appendChild(inp); inp.click();
  });
}

// استيراد محاضر من ملف Excel بصيغة «محضر الاجتماع الأسبوعي … بتاريخ …»
// كل ورقة تحوي كتل محاضر؛ صف العنوان في العمود A، والبنود في B(المحور) D(التوصية) E(الموعد) F(المنفّذون)
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
      // عنوان المحضر مدمج رأسياً في العمود A؛ نلتقطه فقط عند خلية الدمج الرئيسية (لا يتكرّر على صفوف البنود)
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
  // إسقاط الفارغة، وإزالة التكرار حسب التاريخ (نُبقي الأكثر بنوداً)
  const byDate = {};
  for (const m of meetings.filter((m) => m.items.length && m.date)) {
    const k = m.date.slice(0, 10);
    if (!byDate[k] || m.items.length > byDate[k].items.length) byDate[k] = m;
  }
  return Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));
}
const WM_ROLE = { OPEN: "warning", DONE: "good" };
// بنود مؤجَّلة للاجتماع القادم (من نص موعد التسليم)
const CARRY_RE = /القادم|القادمة|الجاي|الجاية|next|الأسبوع القادم/i;

// بداية أسبوع التاريخ (الأحد) كمفتاح لتجميع الأسبوع
function weekStartISO(iso) {
  const d = new Date(iso || Date.now());
  if (isNaN(d)) return "";
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay()); // الرجوع إلى الأحد
  return d.toISOString().slice(0, 10);
}
const shortDate = (iso) => { const d = new Date(iso); return isNaN(d) ? "—" : `${d.getDate()}/${d.getMonth() + 1}`; };
// موعد التسليم قد يكون تاريخاً أو نصاً مستورَداً («الاجتماع القادم»…)
const isDateStr = (s) => !!s && /\d{3,4}/.test(s) && !isNaN(new Date(s).getTime());
const dueEditValue = (s) => (isDateStr(s) ? inputFromISO(s) : "");
const dueDisplay = (s) => (!s ? '<span class="muted">—</span>' : (isDateStr(s) ? esc(fmtDate(s)) : esc(s)));
const splitAssignees = (s) => String(s || "").split(/[\/،,\-–—]|&|\+| و /).map((x) => x.trim()).filter((x) => x && x !== "-");

// صف بند قابل للتحرير أو للعرض فقط
function itemRow(it = {}, editable) {
  const st = it.status === "DONE" ? "DONE" : "OPEN";
  if (!editable) {
    return `<tr>
      <td>${esc(it.topic || "—")}</td>
      <td>${it.recommendation ? esc(it.recommendation) : '<span class="muted">—</span>'}</td>
      <td>${dueDisplay(it.due)}</td>
      <td>${it.assignees ? esc(it.assignees) : '<span class="muted">—</span>'}</td>
      <td>${statusBadgeFrom(WM_STATUS, st, WM_ROLE)}</td>
    </tr>`;
  }
  return `<tr class="wm-row">
    <td><textarea class="wm-topic" rows="2" placeholder="المحور / الموضوع">${esc(it.topic || "")}</textarea></td>
    <td><textarea class="wm-rec" rows="2" placeholder="التوصية / الإجراء">${esc(it.recommendation || "")}</textarea></td>
    <td><input type="date" class="wm-due" data-orig="${esc(it.due || "")}" value="${dueEditValue(it.due)}" />${(it.due && !isDateStr(it.due)) ? `<div class="muted" style="font-size:.68rem;margin-top:2px">سابقاً: ${esc(it.due)}</div>` : ""}</td>
    <td><input type="text" class="wm-assignees" value="${esc(it.assignees || "")}" placeholder="المنفّذون" /></td>
    <td><select class="wm-status">${Object.entries(WM_STATUS).map(([k, v]) => `<option value="${k}" ${k === st ? "selected" : ""}>${v}</option>`).join("")}</select></td>
    <td><button type="button" class="danger small wm-del" title="حذف البند">✕</button></td>
  </tr>`;
}

const editorHead = (editable) => `<thead><tr>
  <th style="min-width:180px">المحور / الموضوع</th><th style="min-width:180px">التوصيات</th>
  <th style="min-width:120px">موعد التسليم</th><th style="min-width:120px">المنفّذون</th><th>الحالة</th>${editable ? "<th></th>" : ""}
</tr></thead>`;

// قراءة بنود المحرِّر من عنصر الحاوية
function readItems(root) {
  return [...root.querySelectorAll(".wm-row")].map((tr) => ({
    topic: tr.querySelector(".wm-topic").value.trim(),
    recommendation: tr.querySelector(".wm-rec").value.trim(),
    // القيمة المختارة من منتقي التاريخ، وإلا نُبقي النص المستورَد الأصلي إن وُجد
    due: tr.querySelector(".wm-due").value.trim() || (tr.querySelector(".wm-due").dataset.orig || ""),
    assignees: tr.querySelector(".wm-assignees").value.trim(),
    status: tr.querySelector(".wm-status").value === "DONE" ? "DONE" : "OPEN",
  })).filter((x) => x.topic || x.recommendation || x.assignees);
}

// حفظ محضر (إنشاء أو تحديث)
async function saveMeeting(existing, date, items) {
  if (existing) {
    await db.updateRow("meetings", existing.id, { date, items });
    await db.audit("UPDATE", "Meeting", existing.code, `تحديث محضر الاجتماع الأسبوعي (${items.length} محور)`);
    await reload("meetings");
    return existing.id;
  }
  const code = await db.nextCode("WM");
  const row = await db.setRow("meetings", db.newId("WM"), {
    code, title: "الاجتماع الأسبوعي", date, items,
    createdById: store.user.uid, createdAt: db.now(), updatedAt: db.now(),
  });
  await db.audit("CREATE", "Meeting", code, `إنشاء محضر الاجتماع الأسبوعي (${items.length} محور)`);
  await reload("meetings");
  return row.id;
}

export function renderWeekly(el, nav, refresh) {
  const editable = canEdit(store.user);
  const rerender = () => renderWeekly(el, nav, refresh);
  const meetings = store.meetings.slice().sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  // محضر هذا الأسبوع (إن وُجد) أو مسودة جديدة بتاريخ اليوم
  const thisWeekKey = weekStartISO(todayISO());
  const current = meetings.find((m) => weekStartISO(m.date) === thisWeekKey) || null;
  const currentItems = current?.items?.length ? current.items : [{}];

  // ---------- المؤشرات ----------
  const allItems = meetings.flatMap((m) => m.items || []);
  const done = allItems.filter((i) => i.status === "DONE").length;
  const open = allItems.length - done;
  const carried = allItems.filter((i) => i.status !== "DONE" && CARRY_RE.test(i.due || "")).length;
  const donePct = allItems.length ? Math.round((done / allItems.length) * 100) : 0;

  const byAssignee = {};
  for (const it of allItems) for (const a of splitAssignees(it.assignees)) byAssignee[a] = (byAssignee[a] || 0) + 1;
  const topAssignees = Object.entries(byAssignee).map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count).slice(0, 8);

  const trendPts = meetings.slice(0, 8).reverse()
    .map((m) => ({ label: shortDate(m.date), value: (m.items || []).length }));

  const indicators = `
    <section class="card">
      <h2>📊 مؤشرات الاجتماعات</h2>
      <div class="stats">
        ${statTile(meetings.length, "عدد المحاضر")}
        ${statTile(allItems.length, "إجمالي المحاور")}
        ${statTile(open, "مهام مفتوحة", `${carried} مؤجّلة للاجتماع القادم`)}
        ${statTile(`${donePct}%`, "نسبة الإنجاز", `${done} منجزة`)}
      </div>
      <div class="grid-2" style="margin-top:12px">
        <div><h3>حالة المهام</h3>${donutChart([
          { label: "منجزة", count: done, color: "#0ca30c" },
          { label: "مفتوحة", count: open, color: "#e6a100" },
        ], { unit: "مهمة" })}</div>
        <div><h3>عدد المحاور عبر الاجتماعات</h3>${trendChart(trendPts, { unit: " محور", color: "#14705c" })}</div>
      </div>
      <h3 style="margin-top:12px">المهام حسب المنفّذ</h3>
      ${topAssignees.length ? hBars(topAssignees) : '<p class="muted">لا توجد بيانات بعد</p>'}
    </section>`;

  // ---------- قائمة المحاضر ----------
  const list = `
    <section class="card">
      <h2>🗂 محاضر الاجتماعات (${meetings.length})</h2>
      <div style="overflow-x:auto"><table>
        <thead><tr><th>الرقم</th><th>التاريخ</th><th>المحاور</th><th>منجزة / مفتوحة</th><th>آخر تحديث</th></tr></thead>
        <tbody>
          ${meetings.map((m) => {
            const its = m.items || [], d = its.filter((i) => i.status === "DONE").length;
            return `<tr class="rowlink" data-open="${m.id}">
              <td><strong>${esc(m.code)}</strong></td>
              <td>${fmtDate(m.date)}</td>
              <td>${its.length}</td>
              <td>${d} / ${its.length - d}</td>
              <td>${fmtDate(m.updatedAt || m.createdAt)}</td>
            </tr>`;
          }).join("") || `<tr><td colspan="5">${emptyMsg("لا توجد محاضر بعد")}</td></tr>`}
        </tbody>
      </table></div>
    </section>`;

  // ---------- تعبئة هذا الأسبوع (أعلى الصفحة) ----------
  const weekFill = `
    <section class="card" style="border-top:3px solid #14705c">
      <div class="row" style="justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
        <h2 style="margin:0">📝 تعبئة اجتماع هذا الأسبوع</h2>
        <span class="muted">${current ? `محضر ${esc(current.code)} — قيد التحديث` : "محضر جديد"}</span>
      </div>
      ${editable ? `
        ${fld("تاريخ الاجتماع", `<input type="date" id="tw-date" value="${inputFromISO(current?.date || todayISO())}" style="max-width:200px" />`)}
        <div style="overflow-x:auto"><table id="tw-table">${editorHead(true)}<tbody id="tw-body">
          ${currentItems.map((it) => itemRow(it, true)).join("")}
        </tbody></table></div>
        <div class="row" style="margin-top:10px;gap:8px;flex-wrap:wrap">
          <button class="secondary" id="tw-add">＋ إضافة محور</button>
          <button id="tw-save">💾 حفظ محضر الأسبوع</button>
        </div>`
      : (current
        ? `<div style="overflow-x:auto"><table>${editorHead(false)}<tbody>${current.items.map((it) => itemRow(it, false)).join("")}</tbody></table></div>`
        : `<p class="muted">لم يُسجَّل محضر لهذا الأسبوع بعد</p>`)}
    </section>`;

  el.innerHTML = `
    <div class="page-head">
      <div><h1>🗓 الاجتماع الأسبوعي</h1><p class="muted">محاضر اجتماعات إدارة الالتزام الأسبوعية ومتابعة المهام</p></div>
      ${editable ? `<div class="row" style="gap:6px;flex-wrap:wrap">
        <button class="secondary" id="wm-import" title="استيراد محاضر من ملف Excel">⬆ استيراد من Excel</button>
        <button id="wm-new" title="إنشاء محضر بتاريخ مخصص">＋ محضر بتاريخ آخر</button>
      </div>` : ""}
    </div>
    ${weekFill}
    ${indicators}
    ${list}`;

  // ---------- الأحداث ----------
  const addRow = () => { $("#tw-body", el)?.insertAdjacentHTML("beforeend", itemRow({}, true)); bindDel(); };
  const bindDel = () => el.querySelectorAll(".wm-del").forEach((b) => (b.onclick = () => b.closest("tr").remove()));
  bindDel();
  $("#tw-add", el)?.addEventListener("click", addRow);
  $("#tw-save", el)?.addEventListener("click", async () => {
    const date = inputFromISOSafe($("#tw-date", el)?.value) || todayISO();
    const items = readItems($("#tw-table", el));
    if (!items.length) return toast("أضِف محوراً واحداً على الأقل", true);
    try {
      await saveMeeting(current, date, items);
      toast("حُفظ محضر الأسبوع");
      rerender();
    } catch (err) { toast(err.message, true); }
  });
  $("#wm-new", el)?.addEventListener("click", () => openMeetingModal(null, rerender));
  $("#wm-import", el)?.addEventListener("click", async () => {
    const file = await pickFile(".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    if (!file) return;
    toast("جارٍ قراءة الملف…");
    try {
      const parsed = await parseWeeklyExcel(file);
      if (!parsed.length) return toast("لم يُعثر على محاضر في الملف", true);
      const existing = new Set(store.meetings.map((m) => (m.date || "").slice(0, 10)));
      const toAdd = parsed.filter((m) => !existing.has(m.date.slice(0, 10)));
      if (!toAdd.length) return toast("جميع المحاضر مستوردة مسبقاً");
      const totalItems = toAdd.reduce((s, m) => s + m.items.length, 0);
      if (!(await confirmBox(`استيراد ${toAdd.length} محضراً (${totalItems} محوراً) من الملف؟`))) return;
      for (const m of toAdd) {
        const code = await db.nextCode("WM");
        await db.setRow("meetings", db.newId("WM"), {
          code, title: "الاجتماع الأسبوعي", date: m.date, items: m.items,
          createdById: store.user.uid, createdAt: db.now(), updatedAt: db.now(),
        });
      }
      await db.audit("CREATE", "Meeting", null, `استيراد ${toAdd.length} محضر اجتماع أسبوعي من Excel`);
      await reload("meetings");
      toast(`استُورد ${toAdd.length} محضراً (${totalItems} محوراً)`);
      rerender();
    } catch (err) { toast(err.message, true); }
  });
  el.querySelectorAll("[data-open]").forEach((tr) =>
    tr.addEventListener("click", () => openMeetingModal(store.meetings.find((x) => x.id === tr.dataset.open), rerender))
  );
}

// تحويل قيمة حقل التاريخ (yyyy-mm-dd) إلى ISO منتصف اليوم
function inputFromISOSafe(v) { return v ? new Date(v + "T12:00:00Z").toISOString() : ""; }

// نافذة تحرير/عرض محضر (سابق أو جديد بتاريخ مخصص)
function openMeetingModal(m, done) {
  const editable = canEdit(store.user);
  const items = m?.items?.length ? m.items : [{}];
  const ov = modal(`
    <div class="row" style="justify-content:space-between">
      <h2>${m ? `محضر ${esc(m.code)}` : "محضر جديد"}</h2>
      ${m ? `<span class="muted">${fmtDate(m.date)}</span>` : ""}
    </div>
    ${editable
      ? `${fld("تاريخ الاجتماع", `<input type="date" id="mm-date" value="${inputFromISO(m?.date || todayISO())}" style="max-width:200px" />`)}
         <div style="overflow-x:auto"><table id="mm-table">${editorHead(true)}<tbody id="mm-body">${items.map((it) => itemRow(it, true)).join("")}</tbody></table></div>
         <div class="row" style="margin-top:10px;gap:8px;flex-wrap:wrap">
           <button class="secondary" id="mm-add">＋ إضافة محور</button>
           <button id="mm-save">حفظ</button>
           ${m ? '<button class="danger" id="mm-del">حذف المحضر</button>' : ""}
           <button class="secondary" id="mm-close">إغلاق</button>
         </div>`
      : `<div style="overflow-x:auto"><table>${editorHead(false)}<tbody>${(m?.items || []).map((it) => itemRow(it, false)).join("")}</tbody></table></div>
         <div class="row" style="margin-top:12px"><button class="secondary" id="mm-close">إغلاق</button></div>`}`,
    { wide: true });

  $("#mm-close", ov).onclick = () => ov.remove();
  const bindDel = () => ov.querySelectorAll(".wm-del").forEach((b) => (b.onclick = () => b.closest("tr").remove()));
  bindDel();
  $("#mm-add", ov)?.addEventListener("click", () => { $("#mm-body", ov).insertAdjacentHTML("beforeend", itemRow({}, true)); bindDel(); });
  $("#mm-save", ov)?.addEventListener("click", async () => {
    const date = inputFromISOSafe($("#mm-date", ov)?.value) || todayISO();
    const its = readItems($("#mm-table", ov));
    if (!its.length) return toast("أضِف محوراً واحداً على الأقل", true);
    try { await saveMeeting(m, date, its); ov.remove(); toast("حُفظ"); done(); }
    catch (err) { toast(err.message, true); }
  });
  $("#mm-del", ov)?.addEventListener("click", async () => {
    ov.remove();
    if (!(await confirmBox(`حذف محضر ${m.code}؟`))) return;
    await db.removeRow("meetings", m.id);
    await db.audit("DELETE", "Meeting", m.code, `حذف محضر الاجتماع الأسبوعي ${m.code}`);
    await reload("meetings"); toast("تم الحذف"); done();
  });
}
