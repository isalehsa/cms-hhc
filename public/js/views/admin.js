// إدارة النظام — المستخدمون والأدوار + سجل التدقيق (Audit Trail)
import { store, reload, deptName, deptOptions } from "../state.js";
import * as db from "../db.js";
import {
  $, esc, toast, modal, confirmBox, fld, txt, sel, val, fmtDate, emptyMsg,
} from "../ui.js";
import { ROLES, DEPT_TYPES, ORG_SECTORS, HEALTH_CLUSTERS, CLUSTER_WAVE_SELECT } from "../meta.js";
import { canApprove, createAuthUser } from "../auth.js";
import { currentDigest, sendDigestNow, digestMailto, digestRecipients, DEFAULT_DUE_SOON } from "../reminders.js";

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
      <p class="muted">زر «إضافة مستخدم» ينشئ حساب الدخول (بريد/كلمة مرور) ودوره مباشرةً — دون الحاجة للوحة Firebase.</p>
    </section>

    <section class="card">
      <div class="row" style="justify-content:space-between;align-items:flex-start">
        <div><h2>🏢 الإدارات والقطاعات (${store.departments.length})</h2>
          <p class="muted">الهيكل التنظيمي المستخدم في ربط المتطلبات والمخاطر والأنشطة بالإدارات.</p></div>
        <div class="row">
          <button class="secondary" id="seed-org" title="إنشاء قطاعات وإدارات شركة الصحة القابضة وإدارات التزام التجمعات الصحية العشرين دفعة واحدة">⚙ استيراد الهيكل الافتراضي</button>
          <button id="add-dept" title="إضافة إدارة أو قطاع جديد">＋ إضافة إدارة</button>
        </div>
      </div>
      <div style="overflow-x:auto">
        <table>
          <thead><tr><th>الإدارة / القطاع</th><th>القطاع التابع له</th><th>النوع</th><th>الحالة</th><th></th></tr></thead>
          <tbody>
            ${[...store.departments]
              .sort((a, b) => (a.sector || "").localeCompare(b.sector || "", "ar") || (a.name || "").localeCompare(b.name || "", "ar"))
              .map((d) => `<tr>
                <td><strong>${esc(d.name)}</strong></td>
                <td class="muted">${esc(d.sector || "—")}</td>
                <td>${esc(DEPT_TYPES[d.type] || "إدارة")}</td>
                <td>${d.active !== false ? '<span class="lvl lvl-good"><span class="dot"></span>نشطة</span>' : '<span class="lvl lvl-neutral"><span class="dot"></span>معطّلة</span>'}</td>
                <td><button class="secondary small" data-editdept="${d.id}" title="تعديل">تعديل</button></td>
              </tr>`)
              .join("") || `<tr><td colspan="5">${emptyMsg("لا توجد إدارات — استخدم «استيراد الهيكل الافتراضي» أو أضف يدوياً")}</td></tr>`}
          </tbody>
        </table>
      </div>
    </section>

    <section class="card" id="rem-card">
      <div class="row" style="justify-content:space-between;align-items:flex-start">
        <div><h2>🔔 التنبيهات الآلية والملخّص البريدي</h2>
          <p class="muted">تُولَّد تنبيهات الاستحقاقات المتأخرة والقريبة تلقائياً عند دخول المحررين. يمكن تفعيل ملخّص بريدي يومي عبر إضافة Firebase «Trigger Email».</p></div>
        <button class="secondary" id="rem-config" title="ضبط عتبات «يستحق قريباً» وتفعيل البريد">⚙ إعداد التنبيهات</button>
      </div>
      <div id="rem-summary" class="muted">جاري حساب الاستحقاقات…</div>
      <div class="row" style="margin-top:10px">
        <button class="secondary" id="rem-send" title="إرسال الملخّص البريدي فوراً إلى مديري الالتزام (يتطلب تفعيل إضافة البريد)">✉ إرسال ملخّص الآن</button>
        <a id="rem-mailto" class="btn-link" href="#" title="فتح بريدك بالملخّص جاهزاً — بديل عند عدم تفعيل الإضافة">↗ فتح الملخّص في بريدي</a>
      </div>
    </section>

    <section class="card">
      <div class="row" style="justify-content:space-between;align-items:flex-start">
        <div><h2>🔌 التكامل الخارجي والـ API</h2>
          <p class="muted">مفتاح واجهة REST للأنظمة المؤسسية، ورابط تغذية مستجدات الجهات الرقابية. تُستهلَك عبر Cloud Functions (راجع مجلّد functions).</p></div>
        <button class="secondary" id="int-config" title="ضبط مفتاح الـ API ورابط التغذية">⚙ إعداد التكامل</button>
      </div>
      <div id="int-summary" class="muted">جاري تحميل إعدادات التكامل…</div>
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
  $("#add-dept", el)?.addEventListener("click", () => openDeptForm(null, rerender));
  $("#seed-org", el)?.addEventListener("click", () => seedOrgStructure(rerender));
  el.querySelectorAll("[data-editdept]").forEach((b) =>
    b.addEventListener("click", () => openDeptForm(store.departments.find((d) => d.id === b.dataset.editdept), rerender))
  );

  // ملخّص الاستحقاقات وأزرار البريد
  const dg = currentDigest();
  const summ = $("#rem-summary", el);
  if (summ) summ.innerHTML = `الاستحقاقات الحالية: <span class="lvl lvl-critical"><span class="dot"></span>${dg.overdue.length} متأخر</span> · <span class="lvl lvl-warning"><span class="dot"></span>${dg.soon.length} قريب</span>`;
  const recips = digestRecipients();
  const mailto = $("#rem-mailto", el);
  if (mailto) mailto.href = digestMailto(recips.join(","));
  $("#rem-config", el)?.addEventListener("click", () => openReminderConfig(rerender));
  $("#rem-send", el)?.addEventListener("click", async () => {
    if (!recips.length) return toast("لا يوجد مديرو التزام بعناوين بريد مسجّلة", true);
    if (!(await confirmBox(`إرسال ملخّص التنبيهات إلى ${recips.length} مستلماً الآن؟ يتطلب تفعيل إضافة البريد في Firebase.`))) return;
    try {
      const n = await sendDigestNow();
      await db.audit("CREATE", "Reminder", null, `إرسال ملخّص بريدي يدوي إلى ${n} مستلماً`);
      toast(n ? `أُدرج ${n} ملخّص في طابور البريد` : "تعذّر الإدراج — تحقق من العناوين", !n);
    } catch (err) {
      toast(err.message, true);
    }
  });

  // إعدادات التكامل
  db.getConfig("integration", {}).then((cfg) => {
    const el2 = $("#int-summary", el);
    if (el2) el2.innerHTML = `مفتاح الـ API: ${cfg.apiKey ? '<span class="lvl lvl-good"><span class="dot"></span>مضبوط</span>' : '<span class="lvl lvl-neutral"><span class="dot"></span>غير مضبوط</span>'} · تغذية الجهات: ${cfg.feedUrl ? esc(cfg.feedUrl) : "—"}`;
  });
  $("#int-config", el)?.addEventListener("click", () => openIntegrationConfig(rerender));

  // سجل التدقيق يُحمَّل عند الطلب (قد يكون كبيراً)
  db.listCol("auditLog").then((logs) => {
    const rows = logs
      .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))
      .slice(0, 100)
      .map(
        (l) => `<tr>
          <td class="muted">${fmtDate(l.createdAt)} ${l.createdAt ? new Date(l.createdAt).toLocaleTimeString("ar-SA-u-ca-gregory-nu-latn", { hour: "2-digit", minute: "2-digit" }) : ""}</td>
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

// ---------- إدارة الإدارات والقطاعات ----------
function openDeptForm(d, done) {
  const isNew = !d;
  const sectors = [...new Set(store.departments.map((x) => x.sector).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ar"));
  const ov = modal(`
    <h2>${isNew ? "إضافة إدارة / قطاع" : `تعديل ${esc(d.name)}`}</h2>
    <div class="form-grid">
      ${fld("الاسم *", txt("d-name", d?.name))}
      ${fld("القطاع التابع له", `<input type="text" id="d-sector" list="sector-list" value="${esc(d?.sector || "")}" placeholder="اكتب أو اختر قطاعاً" />
        <datalist id="sector-list">${sectors.map((s) => `<option value="${esc(s)}">`).join("")}</datalist>`)}
      ${fld("النوع", sel("d-type", DEPT_TYPES, d?.type || "DEPARTMENT"))}
      ${fld("الحالة", sel("d-active", { yes: "نشطة", no: "معطّلة" }, d?.active === false ? "no" : "yes"))}
      ${fld("الموجة (للتجمعات الصحية)", sel("d-wave", CLUSTER_WAVE_SELECT, d?.wave || ""))}
    </div>
    <div class="row" style="margin-top:14px">
      <button id="d-save">حفظ</button>
      ${!isNew ? '<button class="danger" id="d-del" title="حذف الإدارة">حذف</button>' : ""}
      <button class="secondary" id="d-cancel">إلغاء</button>
    </div>`);
  $("#d-cancel", ov).onclick = () => ov.remove();
  $("#d-del", ov)?.addEventListener("click", async () => {
    ov.remove();
    const used = store.requirements.some((r) => r.ownerDeptId === d.id) || store.risks.some((r) => r.ownerDeptId === d.id);
    if (!(await confirmBox(`حذف «${d.name}»؟${used ? " تنبيه: هناك سجلات مرتبطة بها ستفقد الربط." : ""}`))) return;
    await db.removeRow("departments", d.id);
    await db.audit("DELETE", "Department", d.id, `حذف إدارة: ${d.name}`);
    await reload("departments");
    toast("تم الحذف");
    done();
  });
  $("#d-save", ov).onclick = async () => {
    const name = val("d-name", ov);
    if (!name) return toast("الاسم إلزامي", true);
    const data = {
      name,
      sector: val("d-sector", ov) || null,
      type: val("d-type", ov),
      active: val("d-active", ov) === "yes",
      wave: val("d-wave", ov) || null,
    };
    try {
      if (isNew) {
        await db.addRow("departments", { ...data, createdAt: db.now() });
        await db.audit("CREATE", "Department", null, `إضافة إدارة: ${name}`);
      } else {
        await db.updateRow("departments", d.id, data);
        await db.audit("UPDATE", "Department", d.id, `تعديل إدارة: ${name}`);
      }
      await reload("departments");
      ov.remove();
      toast("تم الحفظ");
      done();
    } catch (err) {
      toast(err.message, true);
    }
  };
}

// بذر الهيكل التنظيمي: القطاعات وإداراتها + إدارات التزام التجمعات الصحية — دون تكرار الموجود
async function seedOrgStructure(done) {
  const existing = new Set(store.departments.map((d) => (d.name || "").trim()));
  const rows = [];
  const add = (name, sector, type) => {
    if (existing.has(name.trim())) return;
    existing.add(name.trim());
    rows.push({ name, sector: sector || null, type, active: true, createdAt: db.now() });
  };
  for (const s of ORG_SECTORS) {
    if (s.type !== "OFFICE") add(s.name, null, "SECTOR"); // القطاع نفسه كوحدة
    for (const dep of s.depts) add(dep, s.name, s.type || "DEPARTMENT");
  }
  for (const cluster of HEALTH_CLUSTERS) add(`إدارة الالتزام — ${cluster}`, "التجمعات الصحية", "CLUSTER");

  if (!rows.length) return toast("الهيكل موجود بالكامل — لا شيء جديد للاستيراد");
  if (!(await confirmBox(`سيُضاف ${rows.length} وحدة تنظيمية (قطاعات، إدارات، وإدارات التزام التجمعات الصحية العشرين) دون المساس بالموجود. متابعة؟`))) return;
  try {
    toast("جاري استيراد الهيكل…");
    await db.bulkAdd("departments", rows);
    await db.audit("CREATE", "Department", null, `استيراد الهيكل التنظيمي الافتراضي (${rows.length} وحدة)`);
    await reload("departments");
    toast(`اكتمل الاستيراد — أُضيف ${rows.length} وحدة تنظيمية`);
    done();
  } catch (err) {
    toast(err.message, true);
  }
}

// ---------- إعداد التنبيهات الآلية والبريد ----------
const REM_KIND_LABELS = {
  requirement: "مراجعة المتطلبات",
  monitoring: "أنشطة المراقبة",
  risk: "معالجة المخاطر",
  finding: "خطط التصحيح",
  assessment: "الفحص الذاتي",
  correspondence: "الرد على المراسلات",
  training: "أنشطة التدريب",
  meeting: "الاجتماعات",
};

async function openReminderConfig(done) {
  const cfg = await db.getConfig("reminders", { emailEnabled: false, dueSoonDays: {} });
  const days = { ...DEFAULT_DUE_SOON, ...(cfg.dueSoonDays || {}) };
  const ov = modal(`
    <h2>⚙ إعداد التنبيهات الآلية</h2>
    ${fld("الملخّص البريدي اليومي", sel("rem-email", { on: "مُفعّل (يتطلب إضافة Trigger Email)", off: "معطّل" }, cfg.emailEnabled ? "on" : "off"))}
    <p class="muted">عند التفعيل يُدرَج ملخّص يومي واحد لكل مدير التزام في مجموعة <code>mail</code> لترسله الإضافة. بدون الإضافة استخدم زر «فتح الملخّص في بريدي».</p>
    <h3 style="margin:14px 0 4px">عتبة «يستحق قريباً» بالأيام</h3>
    <p class="muted">يُنبَّه على أي استحقاق متأخر دائماً، وعلى القريب ضمن هذه المدة قبل موعده.</p>
    <div class="form-grid">
      ${Object.entries(REM_KIND_LABELS).map(([k, label]) => fld(label, `<input type="number" id="rem-${k}" min="1" max="180" value="${esc(days[k])}" />`)).join("")}
    </div>
    <div class="row" style="margin-top:14px">
      <button id="rem-save">حفظ</button>
      <button class="secondary" id="rem-cancel">إلغاء</button>
    </div>`, { wide: true });
  $("#rem-cancel", ov).onclick = () => ov.remove();
  $("#rem-save", ov).onclick = async () => {
    const dueSoonDays = {};
    for (const k of Object.keys(REM_KIND_LABELS)) {
      const v = parseInt(val(`rem-${k}`, ov), 10);
      if (v > 0) dueSoonDays[k] = Math.min(180, v);
    }
    try {
      await db.setConfig("reminders", { emailEnabled: val("rem-email", ov) === "on", dueSoonDays });
      await db.audit("UPDATE", "Config", "reminders", "تعديل إعدادات التنبيهات الآلية");
      ov.remove();
      toast("حُفظت الإعدادات");
      done();
    } catch (err) {
      toast(err.message, true);
    }
  };
}

// ---------- إعداد التكامل الخارجي ----------
async function openIntegrationConfig(done) {
  const cfg = await db.getConfig("integration", { apiKey: "", feedUrl: "", feedHeaders: {} });
  const gen = () => "cms_" + Array.from(crypto.getRandomValues(new Uint8Array(24))).map((b) => b.toString(16).padStart(2, "0")).join("");
  const ov = modal(`
    <h2>🔌 إعداد التكامل الخارجي</h2>
    ${fld("مفتاح واجهة REST (x-api-key)", `<div class="row"><input type="text" id="int-key" dir="ltr" class="grow" value="${esc(cfg.apiKey || "")}" placeholder="مفتاح سرّي" /><button class="secondary small" id="int-gen" type="button">توليد</button></div>`)}
    ${fld("رابط تغذية الجهات الرقابية (JSON)", `<input type="text" id="int-feed" dir="ltr" value="${esc(cfg.feedUrl || "")}" placeholder="https://…" />`)}
    <p class="muted">تُستهلَك هذه الإعدادات من Cloud Functions: واجهة <code>/api</code> تتحقق من المفتاح، والوظيفة المجدولة تسحب التغذية يومياً. راجع <code>functions/README.md</code>.</p>
    <div class="row" style="margin-top:14px">
      <button id="int-save">حفظ</button>
      <button class="secondary" id="int-cancel">إلغاء</button>
    </div>`, { wide: true });
  $("#int-gen", ov).onclick = () => { $("#int-key", ov).value = gen(); };
  $("#int-cancel", ov).onclick = () => ov.remove();
  $("#int-save", ov).onclick = async () => {
    try {
      await db.setConfig("integration", { apiKey: val("int-key", ov), feedUrl: val("int-feed", ov) });
      await db.audit("UPDATE", "Config", "integration", "تعديل إعدادات التكامل الخارجي والـ API");
      ov.remove();
      toast("حُفظت إعدادات التكامل");
      done();
    } catch (err) {
      toast(err.message, true);
    }
  };
}

function openUserForm(u, done) {
  const isNew = !u;
  const ov = modal(`
    <h2>${isNew ? "إضافة مستخدم جديد" : `تعديل ${esc(u.name || u.email || "")}`}</h2>
    ${isNew ? `
      <div class="subtabs" style="margin-bottom:10px">
        <button class="subtab active" data-mode="create" title="إنشاء حساب دخول جديد بكلمة مرور ودوره دفعة واحدة">حساب جديد</button>
        <button class="subtab" data-mode="link" title="ربط دور بحساب موجود مسبقاً في Firebase عبر معرّف UID">ربط بحساب موجود (UID)</button>
      </div>` : ""}
    <div class="form-grid">
      ${fld("الاسم", txt("u-name", u?.name))}
      ${fld("البريد الإلكتروني *", `<input type="email" id="u-email" dir="ltr" value="${esc(u?.email || "")}" ${isNew ? "" : "disabled"} />`)}
      ${fld("الدور", sel("u-role", ROLES, String(u?.role || "AUDITOR").toUpperCase()))}
      ${fld("الإدارة", sel("u-dept", deptOptions(), u?.departmentId, { empty: "— بلا —" }))}
      ${fld("الحالة", sel("u-active", { yes: "نشط", no: "معطَّل" }, u?.active === false ? "no" : "yes"))}
    </div>
    ${isNew ? `
      <div id="mode-create">
        ${fld("كلمة المرور *", `<input type="text" id="u-pass" dir="ltr" placeholder="6 أحرف على الأقل" />`)}
        <p class="muted">يُنشأ حساب الدخول ودوره فوراً. سلّم المستخدم بريده وكلمة المرور ليدخل بها (يمكنه تغييرها لاحقاً من نسيت كلمة المرور).</p>
      </div>
      <div id="mode-link" class="hidden">
        ${fld("معرّف UID *", txt("u-uid"))}
        <p class="muted">للحسابات المُنشأة مسبقاً في Firebase — انسخ UID من Authentication والصقه هنا لربط دوره.</p>
      </div>` : ""}
    <div class="row" style="margin-top:14px">
      <button id="u-save">حفظ</button>
      ${!isNew ? '<button class="danger" id="u-del">إزالة الدور</button>' : ""}
      <button class="secondary" id="u-cancel">إلغاء</button>
    </div>`);

  let mode = "create";
  ov.querySelectorAll("[data-mode]").forEach((b) => {
    b.onclick = () => {
      mode = b.dataset.mode;
      ov.querySelectorAll("[data-mode]").forEach((x) => x.classList.toggle("active", x === b));
      $("#mode-create", ov).classList.toggle("hidden", mode !== "create");
      $("#mode-link", ov).classList.toggle("hidden", mode !== "link");
    };
  });

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
    const email = val("u-email", ov);
    const data = {
      name: val("u-name", ov) || null,
      email: email || null,
      role: val("u-role", ov),
      departmentId: val("u-dept", ov) || null,
      active: val("u-active", ov) === "yes",
    };
    const btn = $("#u-save", ov);
    try {
      if (isNew) {
        let id;
        if (mode === "create") {
          if (!email) return toast("البريد الإلكتروني إلزامي", true);
          const pass = val("u-pass", ov);
          if (pass.length < 6) return toast("كلمة المرور يجب أن تكون 6 أحرف على الأقل", true);
          btn.disabled = true;
          id = await createAuthUser(email, pass); // ينشئ حساب الدخول ويعيد UID
        } else {
          id = val("u-uid", ov);
          if (!id) return toast("معرّف UID إلزامي", true);
        }
        await db.setRow("users", id, { ...data, name: data.name || email, createdAt: db.now() });
        await db.audit("CREATE", "User", id, `إضافة مستخدم: ${data.name || email} (${ROLES[data.role]})`);
      } else {
        await db.updateRow("users", u.id, data);
        await db.audit("UPDATE", "User", u.id, `تعديل مستخدم: ${data.name || data.email}`);
      }
      await reload("users");
      ov.remove();
      toast(isNew && mode === "create" ? "أُنشئ الحساب والدور — سلّم المستخدم كلمة المرور" : "تم الحفظ");
      done();
    } catch (err) {
      if (btn) btn.disabled = false;
      toast(err.message, true);
    }
  };
}
