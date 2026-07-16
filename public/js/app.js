// نظام إدارة الالتزام (CMS) — الهيكل الرئيسي: تسجيل الدخول، القائمة الجانبية، التوجيه، التنبيهات
import { configReady } from "./firebase-config.js";
import * as db from "./db.js";
import * as authApi from "./auth.js";
import { canEdit, canApprove } from "./auth.js";
import { store, loadAll, reload } from "./state.js";
import { $, esc, toast, modal, fld, txt, val, spinnerHtml, fmtDate, initTooltips } from "./ui.js";
import { runAutoSync } from "./sync.js";
import { ROLES } from "./meta.js";
import { renderDashboard } from "./views/dashboard.js";
import { renderLibrary } from "./views/library.js";
import { renderRisks } from "./views/risks.js";
import { renderMonitoring } from "./views/monitoring.js";
import { renderPlan } from "./views/plan.js";
import { renderAssessments } from "./views/assessments.js";
import { renderFindings } from "./views/findings.js";
import { renderCorrespondence } from "./views/correspondence.js";
import { renderReports } from "./views/reports.js";
import { settings, aiEnabled } from "./views/regulations.js";
import { renderAdmin } from "./views/admin.js";
import { DEFAULT_MODEL } from "./analyzer.js";

const VIEWS = {
  dashboard: { icon: "🏠", label: "لوحة التحكم", render: renderDashboard },
  library: { icon: "📖", label: "مكتبة الالتزام", render: renderLibrary },
  risks: { icon: "⚠️", label: "سجل المخاطر", render: renderRisks },
  monitoring: { icon: "🔍", label: "برنامج المراقبة", render: renderMonitoring },
  plan: { icon: "📅", label: "الخطة السنوية", render: renderPlan },
  assessments: { icon: "📋", label: "الفحص الذاتي", render: renderAssessments },
  findings: { icon: "🛠", label: "الملاحظات والتصحيح", render: renderFindings },
  correspondence: { icon: "📨", label: "سجل المراسلات", render: renderCorrespondence },
  // التحليل الذكي مدمج داخل مكتبة الالتزام كتبويب فرعي — المسار يبقى للروابط القديمة
  regulations: {
    icon: "🤖", label: "التحليل الذكي", hidden: true,
    render: (el, navFn, refresh, params = {}) => renderLibrary(el, navFn, refresh, { ...params, tab: "analysis" }),
  },
  reports: { icon: "📊", label: "التقارير", render: renderReports },
  admin: { icon: "⚙️", label: "الإدارة", render: renderAdmin },
};

let currentView = "dashboard";
const main = $("#app");

function nav(view, params = {}) {
  currentView = VIEWS[view] ? view : "dashboard";
  location.hash = currentView;
  renderShellNav();
  const r = VIEWS[currentView].render;
  Promise.resolve(r(main, nav, refreshAll, params)).catch((e) => toast(e.message, true));
}

async function refreshAll() {
  await loadAll(true);
  nav(currentView);
}

// ---------- الهيكل ----------
function renderShell() {
  const u = store.user;
  $("#sidebar").innerHTML = `
    <div class="brand">
      <span class="logo">⚖️</span>
      <div><h1>إدارة الالتزام</h1><p class="subtitle">CMS · ISO 37301</p></div>
    </div>
    <nav id="side-nav">
      ${Object.entries(VIEWS)
        .filter(([k, v]) => !v.hidden && (k !== "admin" || canApprove(u)))
        .map(([k, v]) => `<button class="nav-item" data-view="${k}"><span>${v.icon}</span> ${v.label}</button>`)
        .join("")}
    </nav>
    <div class="side-foot">
      <div class="user-chip" title="${esc(u.email)}">👤 ${esc(u.name)}<br/><small>${esc(ROLES[u.role] || u.role)}</small></div>
      <div class="row">
        <button class="secondary small" id="btn-notif" title="عرض التنبيهات الواردة">🔔<span id="notif-count" class="notif-count hidden"></span></button>
        ${canEdit(u) ? '<button class="secondary small" id="btn-settings" title="إعدادات التحليل الذكي (مفتاح Claude API والنموذج)">⚙</button>' : ""}
        <button class="secondary small" id="btn-refresh" title="إعادة تحميل جميع البيانات من الخادم">↻</button>
        <button class="secondary small" id="btn-logout" title="تسجيل الخروج من النظام">خروج</button>
      </div>
    </div>`;

  $("#btn-logout").onclick = () => authApi.logout();
  $("#btn-refresh").onclick = async () => { toast("جاري التحديث…"); await refreshAll(); toast("حُدّثت البيانات"); };
  $("#btn-settings")?.addEventListener("click", openSettings);
  $("#btn-notif").onclick = openNotifications;
  $("#side-nav").querySelectorAll("[data-view]").forEach((b) => (b.onclick = () => nav(b.dataset.view)));
  renderShellNav();
  updateNotifBadge();
}

function renderShellNav() {
  document.querySelectorAll("#side-nav .nav-item").forEach((b) =>
    b.classList.toggle("active", b.dataset.view === currentView)
  );
}

// ---------- التنبيهات ----------
function myNotifications() {
  const u = store.user;
  return store.notifications
    .filter((n) => (!n.userId || n.userId === u.uid) && (!n.roleTarget || n.roleTarget === u.role || canApprove(u)))
    .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
}

function updateNotifBadge() {
  const unread = myNotifications().filter((n) => !n.read).length;
  const badge = $("#notif-count");
  if (!badge) return;
  badge.textContent = unread;
  badge.classList.toggle("hidden", unread === 0);
}

function openNotifications() {
  const items = myNotifications().slice(0, 30);
  const ov = modal(`
    <div class="row" style="justify-content:space-between">
      <h2>🔔 التنبيهات</h2>
      ${items.some((n) => !n.read) ? '<button class="secondary small" id="nf-readall">تعليم الكل كمقروء</button>' : ""}
    </div>
    ${items
      .map(
        (n) => `<div class="notif-item ${n.read ? "" : "unread"}" data-link="${esc(n.link || "")}" data-id="${n.id}">
          <strong>${esc(n.title)}</strong><br/>${esc(n.message)}<br/><small class="muted">${fmtDate(n.createdAt)}</small>
        </div>`
      )
      .join("") || '<p class="muted">لا توجد تنبيهات</p>'}
    <div class="row" style="margin-top:12px"><button class="secondary" id="nf-close">إغلاق</button></div>`);
  $("#nf-close", ov).onclick = () => ov.remove();
  $("#nf-readall", ov)?.addEventListener("click", async () => {
    const unread = items.filter((n) => !n.read);
    for (const n of unread) await db.updateRow("notifications", n.id, { read: true }).catch(() => {});
    await reload("notifications");
    updateNotifBadge();
    ov.remove();
  });
  ov.querySelectorAll(".notif-item").forEach((item) => {
    item.onclick = async () => {
      const n = items.find((x) => x.id === item.dataset.id);
      if (n && !n.read) {
        db.updateRow("notifications", n.id, { read: true }).catch(() => {});
        n.read = true;
        updateNotifBadge();
      }
      ov.remove();
      const link = item.dataset.link;
      if (link && VIEWS[link]) nav(link);
    };
  });
}

// ---------- إعدادات التحليل الذكي ----------
function openSettings() {
  const ov = modal(`
    <h2>⚙ إعدادات التحليل الذكي</h2>
    <p class="muted">مفتاح Claude API يُحفظ في متصفحك فقط ولا يُرسل لأي جهة غير Anthropic.
      بدون مفتاح يعمل المحلل النصي الاحتياطي.</p>
    ${fld("مفتاح Claude API", `<input type="password" id="set-key" placeholder="sk-ant-..." value="${esc(settings.apiKey)}" />`)}
    ${fld("النموذج", txt("set-model", settings.model, DEFAULT_MODEL))}
    <div class="row" style="margin-top:14px">
      <button id="set-save">حفظ</button>
      <button class="secondary" id="set-cancel">إلغاء</button>
    </div>`);
  $("#set-cancel", ov).onclick = () => ov.remove();
  $("#set-save", ov).onclick = () => {
    settings.save($("#set-key", ov).value.trim(), val("set-model", ov));
    ov.remove();
    toast(aiEnabled() ? "حُفظ — التحليل الذكي مفعّل" : "حُفظ — التحليل الذكي غير مفعّل");
  };
}

// ---------- شاشات الدخول والإعداد ----------
function renderSetup() {
  document.body.classList.add("auth-mode");
  main.innerHTML = `
    <section class="card login-card">
      <h2>⚙️ يلزم ضبط إعدادات Firebase</h2>
      <p>انسخ إعدادات مشروعك إلى <code>public/js/firebase-config.js</code> ثم أعد النشر. التفاصيل في README.</p>
    </section>`;
}

function renderLogin() {
  document.body.classList.add("auth-mode");
  $("#sidebar").innerHTML = "";
  main.innerHTML = `
    <section class="card login-card">
      <div class="brand" style="justify-content:center;margin-bottom:10px">
        <span class="logo">⚖️</span>
        <div><h1>نظام إدارة الالتزام</h1><p class="subtitle">Compliance Management System · ISO 37301</p></div>
      </div>
      <label>البريد الإلكتروني</label>
      <input type="email" id="login-email" autocomplete="username" />
      <label>كلمة المرور</label>
      <input type="password" id="login-pass" autocomplete="current-password" />
      <div style="margin-top:14px"><button id="login-btn" style="width:100%">دخول</button></div>
    </section>`;
  const doLogin = async () => {
    const btn = $("#login-btn");
    btn.disabled = true;
    try {
      await authApi.login($("#login-email").value.trim(), $("#login-pass").value);
    } catch (err) {
      toast(err.message, true);
      btn.disabled = false;
    }
  };
  $("#login-btn").onclick = doLogin;
  $("#login-pass").addEventListener("keydown", (e) => e.key === "Enter" && doLogin());
}

// ---------- تشغيل ----------
function init() {
  initTooltips();
  if (!configReady) return renderSetup();
  authApi.onAuth(async (user) => {
    store.user = user;
    db.setAuditUser(user);
    if (!user) {
      store.loaded = false;
      renderLogin();
      return;
    }
    document.body.classList.remove("auth-mode");
    main.innerHTML = spinnerHtml("جاري تحميل البيانات…");
    try {
      await loadAll(true);
      store.regulations = await db.listRegulations().catch(() => []);
      renderShell();
      const hash = location.hash.replace("#", "");
      nav(VIEWS[hash] ? hash : "dashboard");
      toast(`مرحباً، ${user.name}`);
      // تحديث سجل المخاطر آلياً في الخلفية وفق الإضافات الحديثة في المكتبة والتحليلات
      if (canEdit(user)) {
        runAutoSync()
          .then((s) => {
            if (s.createdRisks || s.createdReqs) {
              toast(`تحديث آلي: أُضيف ${s.createdRisks} خطر و${s.createdReqs} متطلب وفق الإضافات الحديثة`);
              updateNotifBadge();
              if (["risks", "library", "dashboard"].includes(currentView)) nav(currentView);
            }
          })
          .catch((e) => console.warn("auto-sync failed", e));
      }
    } catch (err) {
      toast(err.message, true);
      renderLogin();
    }
  });
}

window.addEventListener("hashchange", () => {
  const hash = location.hash.replace("#", "");
  if (store.user && VIEWS[hash] && hash !== currentView) nav(hash);
});

init();
