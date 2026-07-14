// إدارة النظام — المستخدمون والأدوار + سجل التدقيق (Audit Trail)
import { store, reload, deptName, deptOptions } from "../state.js";
import * as db from "../db.js";
import {
  $, esc, toast, modal, confirmBox, fld, txt, sel, val, fmtDate, emptyMsg,
} from "../ui.js";
import { ROLES } from "../meta.js";
import { canApprove } from "../auth.js";

export function renderAdmin(el, nav, refresh) {
  const manager = canApprove(store.user);
  if (!manager) {
    el.innerHTML = `<div class="page-head"><h1>⚙ الإدارة</h1></div><section class="card"><p class="muted">هذه الصفحة متاحة لمدير النظام ومدير الالتزام فقط.</p></section>`;
    return;
  }

  el.innerHTML = `
    <div class="page-head">
      <h1>⚙ إدارة النظام</h1>
      <button id="add-user">＋ إضافة مستخدم</button>
    </div>
    <section class="card">
      <h2>المستخدمون (${store.users.length})</h2>
      <div style="overflow-x:auto">
        <table>
          <thead><tr><th>الاسم</th><th>البريد</th><th>الدور</th><th>الإدارة</th><th>الحالة</th><th></th></tr></thead>
          <tbody>
            ${store.users
              .map(
                (u) => `<tr>
                  <td><strong>${esc(u.name || "—")}</strong></td>
                  <td dir="ltr" style="text-align:right">${esc(u.email || "—")}</td>
                  <td>${esc(ROLES[String(u.role || "").toUpperCase()] || u.role || "—")}</td>
                  <td>${esc(deptName(u.departmentId))}</td>
                  <td>${u.active !== false ? '<span class="lvl lvl-good"><span class="dot"></span>نشط</span>' : '<span class="lvl lvl-neutral"><span class="dot"></span>معطَّل</span>'}</td>
                  <td><button class="secondary small" data-edit="${u.id}">تعديل</button></td>
                </tr>`
              )
              .join("") || `<tr><td colspan="6">${emptyMsg("لا يوجد مستخدمون")}</td></tr>`}
          </tbody>
        </table>
      </div>
      <p class="muted">إنشاء حساب دخول جديد (بريد/كلمة مرور) يتم من لوحة Firebase ← Authentication، ثم يُضاف هنا دوره بمعرّف UID.</p>
    </section>

    <section class="card">
      <h2>📜 سجل التدقيق (آخر 100 حركة)</h2>
      <div style="overflow-x:auto">
        <table>
          <thead><tr><th>التاريخ</th><th>المستخدم</th><th>الحركة</th><th>النوع</th><th>التفاصيل</th></tr></thead>
          <tbody id="audit-body"><tr><td colspan="5" class="muted">جاري التحميل…</td></tr></tbody>
        </table>
      </div>
    </section>`;

  const rerender = () => renderAdmin(el, nav, refresh);
  $("#add-user", el).onclick = () => openUserForm(null, rerender);
  el.querySelectorAll("[data-edit]").forEach((b) =>
    b.addEventListener("click", () => openUserForm(store.users.find((u) => u.id === b.dataset.edit), rerender))
  );

  // سجل التدقيق يُحمَّل عند الطلب (قد يكون كبيراً)
  db.listCol("auditLog").then((logs) => {
    const rows = logs
      .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))
      .slice(0, 100)
      .map(
        (l) => `<tr>
          <td class="muted">${fmtDate(l.createdAt)} ${l.createdAt ? new Date(l.createdAt).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" }) : ""}</td>
          <td>${esc(l.userName || "—")}</td>
          <td>${esc({ CREATE: "إنشاء", UPDATE: "تعديل", DELETE: "حذف", APPROVE: "اعتماد", SUBMIT: "إرسال", REVIEW: "مراجعة" }[l.action] || l.action)}</td>
          <td>${esc(l.entityType || "")}${l.entityId ? ` (${esc(l.entityId)})` : ""}</td>
          <td>${esc(l.details || "")}</td>
        </tr>`
      )
      .join("");
    const body = $("#audit-body", el);
    if (body) body.innerHTML = rows || `<tr><td colspan="5">${emptyMsg("لا توجد حركات")}</td></tr>`;
  }).catch(() => {});
}

function openUserForm(u, done) {
  const isNew = !u;
  const ov = modal(`
    <h2>${isNew ? "إضافة مستخدم (ربط دور بحساب موجود)" : `تعديل ${esc(u.name || u.email || "")}`}</h2>
    ${isNew ? `<p class="muted">أنشئ الحساب أولاً من Firebase ← Authentication ← Add user، ثم انسخ UID هنا.</p>${fld("معرّف UID *", txt("u-uid"))}` : ""}
    <div class="form-grid">
      ${fld("الاسم", txt("u-name", u?.name))}
      ${fld("البريد الإلكتروني", txt("u-email", u?.email))}
      ${fld("الدور", sel("u-role", ROLES, String(u?.role || "AUDITOR").toUpperCase()))}
      ${fld("الإدارة", sel("u-dept", deptOptions(), u?.departmentId, { empty: "— بلا —" }))}
      ${fld("الحالة", sel("u-active", { yes: "نشط", no: "معطَّل" }, u?.active === false ? "no" : "yes"))}
    </div>
    <div class="row" style="margin-top:14px">
      <button id="u-save">حفظ</button>
      ${!isNew ? '<button class="danger" id="u-del">إزالة الدور</button>' : ""}
      <button class="secondary" id="u-cancel">إلغاء</button>
    </div>`);
  $("#u-cancel", ov).onclick = () => ov.remove();
  $("#u-del", ov)?.addEventListener("click", async () => {
    ov.remove();
    if (!(await confirmBox("إزالة وثيقة دور هذا المستخدم؟ سيُعامل كمراجع (قراءة فقط) عند دخوله."))) return;
    await db.removeRow("users", u.id);
    await db.audit("DELETE", "User", u.id, `إزالة دور المستخدم ${u.name || u.email}`);
    await reload("users");
    toast("أُزيل الدور");
    done();
  });
  $("#u-save", ov).onclick = async () => {
    const id = isNew ? val("u-uid", ov) : u.id;
    if (!id) return toast("معرّف UID إلزامي", true);
    const data = {
      name: val("u-name", ov) || null,
      email: val("u-email", ov) || null,
      role: val("u-role", ov),
      departmentId: val("u-dept", ov) || null,
      active: val("u-active", ov) === "yes",
    };
    try {
      if (isNew) {
        await db.setRow("users", id, { ...data, createdAt: db.now() });
        await db.audit("CREATE", "User", id, `إضافة مستخدم: ${data.name || data.email} (${ROLES[data.role]})`);
      } else {
        await db.updateRow("users", id, data);
        await db.audit("UPDATE", "User", id, `تعديل مستخدم: ${data.name || data.email}`);
      }
      await reload("users");
      ov.remove();
      toast("تم الحفظ");
      done();
    } catch (err) {
      toast(err.message, true);
    }
  };
}
