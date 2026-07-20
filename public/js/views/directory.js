// دليل التواصل مع التجمعات الصحية — جهات اتصال قيادات الحوكمة والالتزام
// إضافة/تعديل/حذف، استيراد وتصدير Excel، مراسلة واتساب فردية وجماعية، وبريد إلكتروني
import { store, reload } from "../state.js";
import * as db from "../db.js";
import {
  $, esc, toast, modal, confirmBox, fld, txt, area, sel, val, emptyMsg, keepFocus,
} from "../ui.js";
import { HEALTH_CLUSTERS } from "../meta.js";
import { DIRECTORY_SEED } from "../directory-seed.js";
import { canEdit } from "../auth.js";

const filters = { search: "", cluster: "" };
const selected = new Set();

// تطبيع رقم الجوال السعودي لصيغة واتساب الدولية (9665XXXXXXXX)
function waNumber(raw) {
  let n = String(raw || "").replace(/[^\d]/g, "");
  if (!n) return "";
  if (n.startsWith("00")) n = n.slice(2);
  if (n.startsWith("966")) return n;
  if (n.startsWith("0")) n = n.slice(1);
  if (n.startsWith("5") && n.length === 9) return "966" + n;
  if (n.length === 9) return "966" + n;
  return n;
}
const waLink = (raw, msg) => `https://wa.me/${waNumber(raw)}${msg ? `?text=${encodeURIComponent(msg)}` : ""}`;

export function renderDirectory(el, nav, refresh) {
  const editable = canEdit(store.user);
  const all = store.directory;
  const clusters = [...new Set([...HEALTH_CLUSTERS, ...all.map((c) => c.cluster).filter(Boolean)])];
  const rows = all.filter((c) => {
    if (filters.search && !`${c.name || ""} ${c.title || ""} ${c.cluster || ""} ${c.email || ""} ${c.mobile || ""}`.includes(filters.search)) return false;
    if (filters.cluster && c.cluster !== filters.cluster) return false;
    return true;
  });
  // نُبقي فقط المحدد الظاهر
  const visibleIds = new Set(rows.map((c) => c.id));
  [...selected].forEach((id) => { if (!visibleIds.has(id)) selected.delete(id); });

  el.innerHTML = `
    <div class="page-head">
      <h1>📇 دليل التواصل مع التجمعات</h1>
      <div class="row">
        ${editable ? `
          <button class="secondary" id="dir-import" title="استيراد جهات الاتصال من ملف Excel">⬆ استيراد Excel</button>
          <input type="file" id="dir-file" accept=".xlsx" class="hidden" />
          <button class="secondary" id="dir-export" title="تصدير الدليل إلى ملف Excel">⬇ تصدير Excel</button>
          ${!all.length ? '<button class="secondary" id="dir-seed" title="استيراد بيانات قيادات الحوكمة والالتزام في التجمعات">⬇ استيراد القيادات</button>' : ""}
          <button id="dir-add" title="إضافة جهة اتصال جديدة">＋ جهة اتصال</button>` : ""}
      </div>
    </div>
    <section class="card" id="bcast-card">
      <div class="row" style="justify-content:space-between;align-items:center">
        <h2 style="margin:0">📢 مراسلة جماعية (${selected.size} محدد)</h2>
        <div class="row">
          <button class="secondary small" id="sel-all" title="تحديد كل الظاهر">تحديد الكل</button>
          <button class="secondary small" id="sel-none" title="إلغاء التحديد">مسح التحديد</button>
        </div>
      </div>
      ${fld("نص الرسالة (اختياري — يُرفق تلقائياً بروابط واتساب)", area("bcast-msg", "", "اكتب رسالة موحّدة لإرسالها للمحددين…", 2))}
      <div class="row">
        <button class="small" id="bcast-wa" title="فتح محادثة واتساب لكل جهة محددة بالرسالة (قد يطلب المتصفح السماح بالنوافذ)">💬 واتساب للمحددين</button>
        <button class="secondary small" id="bcast-mail" title="فتح بريد جماعي (نسخة مخفية) لكل من لديه بريد ضمن المحددين">✉ بريد جماعي للمحددين</button>
        <span class="muted">للمراسلة الفردية استخدم أيقونات كل صف.</span>
      </div>
    </section>
    <section class="card">
      <div class="row filters">
        <input type="text" id="f-search" class="grow" placeholder="بحث بالاسم أو المسمى أو البريد…" value="${esc(filters.search)}" />
        ${sel("f-cluster", clusters.map((c) => ({ id: c, name: c })), filters.cluster, { empty: "كل التجمعات" })}
      </div>
      <div style="overflow-x:auto">
        <table>
          <thead><tr>
            <th style="width:28px"></th><th>التجمع</th><th>الاسم</th><th>المسمى</th><th>الجوال</th><th>البريد الإلكتروني</th><th>البريد الرسمي للإدارة</th><th>مراسلة</th>
          </tr></thead>
          <tbody>
            ${rows.map((c) => `<tr>
              <td><input type="checkbox" class="dir-chk" data-id="${c.id}" ${selected.has(c.id) ? "checked" : ""} /></td>
              <td class="muted">${esc(c.cluster || "—")}</td>
              <td class="rowlink" data-open="${c.id}"><strong>${esc(c.name || "—")}</strong>${c.comment ? `<div class="muted clamp">${esc(c.comment)}</div>` : ""}</td>
              <td>${esc(c.title || "—")}</td>
              <td dir="ltr" style="text-align:right">${esc(c.mobile || "—")}</td>
              <td dir="ltr" style="text-align:right">${c.email ? `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : "—"}</td>
              <td dir="ltr" style="text-align:right">${c.officialEmail ? `<a href="mailto:${esc(c.officialEmail)}">${esc(c.officialEmail)}</a>` : "—"}</td>
              <td class="row" style="flex-wrap:nowrap;gap:4px">
                ${c.mobile ? `<a class="icon-btn" href="${waLink(c.mobile, "")}" target="_blank" rel="noopener" data-tip="محادثة واتساب">💬</a>` : ""}
                ${c.email ? `<a class="icon-btn" href="mailto:${esc(c.email)}" data-tip="بريد إلكتروني">✉</a>` : ""}
                ${editable ? `<button class="icon-btn" data-edit="${c.id}" data-tip="تعديل">✎</button>` : ""}
              </td>
            </tr>`).join("") || `<tr><td colspan="8">${emptyMsg("لا توجد جهات اتصال — أضف يدوياً أو استورد من Excel")}</td></tr>`}
          </tbody>
        </table>
      </div>
      <p class="muted">عدد النتائج: ${rows.length} من ${all.length}</p>
    </section>`;

  const rerender = () => renderDirectory(el, nav, refresh);
  $("#f-search", el).addEventListener("input", (e) => { filters.search = e.target.value; keepFocus(rerender); });
  $("#f-cluster", el).onchange = (e) => { filters.cluster = e.target.value; rerender(); };
  $("#dir-add", el)?.addEventListener("click", () => openForm(null, rerender));
  $("#dir-export", el)?.addEventListener("click", () => exportExcel().catch((err) => toast(err.message, true)));
  $("#dir-import", el)?.addEventListener("click", () => $("#dir-file", el).click());
  $("#dir-file", el)?.addEventListener("change", (e) => importExcel(e.target.files?.[0], rerender));
  $("#dir-seed", el)?.addEventListener("click", async () => {
    if (!(await confirmBox(`استيراد ${DIRECTORY_SEED.length} جهة اتصال لقيادات التجمعات؟`))) return;
    try {
      await db.bulkAdd("directory", DIRECTORY_SEED.map((c) => ({ ...c, officialEmail: null, createdAt: db.now() })));
      await db.audit("CREATE", "Directory", null, `استيراد ${DIRECTORY_SEED.length} جهة اتصال افتراضية`);
      await reload("directory"); toast(`استُورد ${DIRECTORY_SEED.length} جهة اتصال`); rerender();
    } catch (err) { toast(err.message, true); }
  });
  el.querySelectorAll("[data-open]").forEach((td) => (td.onclick = () => openForm(all.find((x) => x.id === td.dataset.open), rerender)));
  el.querySelectorAll("[data-edit]").forEach((b) => (b.onclick = () => openForm(all.find((x) => x.id === b.dataset.edit), rerender)));
  el.querySelectorAll(".dir-chk").forEach((chk) => (chk.onchange = () => {
    chk.checked ? selected.add(chk.dataset.id) : selected.delete(chk.dataset.id);
    $("#bcast-card h2", el).textContent = `📢 مراسلة جماعية (${selected.size} محدد)`;
  }));
  $("#sel-all", el)?.addEventListener("click", () => { rows.forEach((c) => selected.add(c.id)); rerender(); });
  $("#sel-none", el)?.addEventListener("click", () => { selected.clear(); rerender(); });

  $("#bcast-wa", el)?.addEventListener("click", () => {
    const msg = val("bcast-msg", el);
    const targets = rows.filter((c) => selected.has(c.id) && c.mobile);
    if (!targets.length) return toast("حدّد جهات لديها أرقام جوال أولاً", true);
    if (targets.length > 5 && !confirm(`سيُفتح ${targets.length} تبويب واتساب — قد يطلب المتصفح السماح بالنوافذ. متابعة؟`)) return;
    targets.forEach((c, i) => setTimeout(() => window.open(waLink(c.mobile, msg), "_blank"), i * 400));
    toast(`فُتحت محادثات واتساب لـ ${targets.length} جهة`);
  });
  $("#bcast-mail", el)?.addEventListener("click", () => {
    const msg = val("bcast-msg", el);
    const emails = rows.filter((c) => selected.has(c.id) && c.email).map((c) => c.email);
    if (!emails.length) return toast("حدّد جهات لديها بريد إلكتروني أولاً", true);
    window.location.href = `mailto:?bcc=${encodeURIComponent(emails.join(","))}${msg ? `&body=${encodeURIComponent(msg)}` : ""}`;
  });
}

function openForm(c, done) {
  const isNew = !c;
  const clusters = [...new Set([...HEALTH_CLUSTERS, ...store.directory.map((x) => x.cluster).filter(Boolean)])];
  const ov = modal(`
    <h2>${isNew ? "إضافة جهة اتصال" : `تعديل ${esc(c.name || "")}`}</h2>
    <div class="form-grid">
      ${fld("التجمع الصحي *", `<input type="text" id="c-cluster" list="cl-list" value="${esc(c?.cluster || "")}" placeholder="اكتب أو اختر" />
        <datalist id="cl-list">${clusters.map((x) => `<option value="${esc(x)}">`).join("")}</datalist>`)}
      ${fld("الاسم *", txt("c-name", c?.name))}
      ${fld("المسمى الوظيفي", txt("c-title", c?.title, "مثال: مدير إدارة الالتزام"))}
      ${fld("رقم الجوال", `<input type="text" id="c-mobile" dir="ltr" value="${esc(c?.mobile || "")}" placeholder="05XXXXXXXX" />`)}
      ${fld("البريد الإلكتروني", `<input type="email" id="c-email" dir="ltr" value="${esc(c?.email || "")}" />`)}
      ${fld("البريد الرسمي للإدارة", `<input type="email" id="c-official" dir="ltr" value="${esc(c?.officialEmail || "")}" placeholder="compliance@cluster.sa" />`)}
    </div>
    ${fld("ملاحظات", area("c-comment", c?.comment, "", 2))}
    <div class="row" style="margin-top:14px">
      <button id="c-save">حفظ</button>
      ${!isNew ? '<button class="danger" id="c-del">حذف</button>' : ""}
      <button class="secondary" id="c-cancel">إلغاء</button>
    </div>`);
  $("#c-cancel", ov).onclick = () => ov.remove();
  $("#c-del", ov)?.addEventListener("click", async () => {
    ov.remove();
    if (!(await confirmBox(`حذف جهة الاتصال «${c.name}»؟`))) return;
    await db.removeRow("directory", c.id);
    await db.audit("DELETE", "Directory", c.id, `حذف جهة اتصال: ${c.name}`);
    await reload("directory"); toast("تم الحذف"); done();
  });
  $("#c-save", ov).onclick = async () => {
    const name = val("c-name", ov), cluster = val("c-cluster", ov);
    if (!name || !cluster) return toast("التجمع والاسم إلزاميان", true);
    const data = {
      cluster, name,
      title: val("c-title", ov) || null,
      mobile: val("c-mobile", ov) || null,
      email: val("c-email", ov) || null,
      officialEmail: val("c-official", ov) || null,
      comment: val("c-comment", ov) || null,
    };
    try {
      if (isNew) { await db.addRow("directory", { ...data, createdAt: db.now() }); await db.audit("CREATE", "Directory", null, `إضافة جهة اتصال: ${name}`); }
      else { await db.updateRow("directory", c.id, data); await db.audit("UPDATE", "Directory", c.id, `تعديل جهة اتصال: ${name}`); }
      await reload("directory"); ov.remove(); toast("تم الحفظ"); done();
    } catch (err) { toast(err.message, true); }
  };
}

// ---------- استيراد / تصدير Excel ----------
async function importExcel(file, done) {
  if (!file) return;
  if (typeof ExcelJS === "undefined") return toast("مكتبة Excel لم تُحمّل — أعد تحميل الصفحة", true);
  try {
    toast("جاري قراءة الملف…");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await file.arrayBuffer());
    const ws = wb.worksheets[0];
    const rows = [];
    let curCluster = "";
    // نمط الملف: عمود A التجمع (قد يُدمج على صفوف)، B الاسم، C المسمى، D الجوال، E البريد، F ملاحظات
    ws.eachRow((row, rn) => {
      if (rn <= 2) return; // ترويسة
      const cell = (i) => { const v = row.getCell(i).value; return v == null ? "" : String(typeof v === "object" && v.text ? v.text : v).trim(); };
      const clus = cell(1); if (clus) curCluster = clus;
      const name = cell(2);
      if (!name) return;
      rows.push({
        cluster: curCluster || null, name,
        title: cell(3) || null, mobile: cell(4) || null,
        email: cell(5) || null, officialEmail: null, comment: cell(6) || null,
        createdAt: db.now(),
      });
    });
    if (!rows.length) return toast("لم يُعثر على صفوف صالحة في الملف", true);
    if (!(await confirmBox(`سيُضاف ${rows.length} جهة اتصال من الملف. متابعة؟`))) return;
    await db.bulkAdd("directory", rows);
    await db.audit("CREATE", "Directory", null, `استيراد ${rows.length} جهة اتصال من Excel`);
    await reload("directory");
    toast(`استُورد ${rows.length} جهة اتصال`);
    done();
  } catch (err) { toast("تعذّر الاستيراد: " + err.message, true); }
}

async function exportExcel() {
  if (typeof ExcelJS === "undefined") throw new Error("مكتبة Excel لم تُحمّل — أعد تحميل الصفحة");
  toast("جاري تجهيز الملف…");
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("دليل التواصل", { views: [{ rightToLeft: true }] });
  ws.columns = [
    { header: "التجمع", key: "cluster", width: 24 },
    { header: "الاسم", key: "name", width: 28 },
    { header: "المسمى", key: "title", width: 30 },
    { header: "رقم الجوال", key: "mobile", width: 16 },
    { header: "البريد الإلكتروني", key: "email", width: 30 },
    { header: "البريد الرسمي للإدارة", key: "officialEmail", width: 30 },
    { header: "ملاحظات", key: "comment", width: 30 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8F0EC" } };
  for (const c of store.directory) ws.addRow(c);
  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const a = document.createElement("a");
  a.href = url; a.download = "دليل_التواصل_مع_التجمعات.xlsx";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
