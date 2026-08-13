// نظام إدارة الالتزام (CMS) — الهيكل الرئيسي: تسجيل الدخول، القائمة الجانبية، التوجيه، التنبيهات
import { configReady } from "./firebase-config.js";
import * as db from "./db.js";
import * as authApi from "./auth.js";
import { canEdit, canApprove, isClusterOfficer } from "./auth.js";
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
import { renderDisclosures } from "./views/disclosures.js";
import { renderTraining } from "./views/training.js";
import { renderMaturity } from "./views/maturity.js";
import { renderWeekly, renderDeptMeetings, renderMyTasks } from "./views/weekly.js";
import { renderDirectory } from "./views/directory.js";
import { renderReports } from "./views/reports.js";
import { settings, aiEnabled } from "./views/regulations.js";
import { renderAdmin } from "./views/admin.js";
import { DEFAULT_MODEL } from "./analyzer.js";

// مجموعات القائمة الجانبية (قابلة للطي) — التبويبات المتشابهة معاً
const NAV_GROUPS = [
  { key: "records", label: "السجلات", icon: "🗃" },
  { key: "control", label: "المراقبة والالتزام", icon: "🔍" },
  { key: "planning", label: "التخطيط والتطوير", icon: "📅" },
  { key: "clusters", label: "التجمعات الصحية", icon: "🏥" },
  { key: "meetings", label: "الاجتماعات", icon: "🗓" },
  { key: "general", label: "عام", icon: "📌" },
];

const VIEWS = {
  // لوحة التحكم — عنصر مستقل أعلى القائمة (بلا مجموعة)
  dashboard: { icon: "🏠", label: "لوحة التحكم", render: renderDashboard },

  // السجلات
  library: { icon: "📖", label: "مكتبة الالتزام", render: renderLibrary, group: "records" },
  risks: { icon: "⚠️", label: "سجل المخاطر", render: renderRisks, group: "records" },
  correspondence: { icon: "📨", label: "سجل المراسلات", render: renderCorrespondence, group: "records" },
  disclosures: { icon: "🗂", label: "سجل الإفصاحات", render: renderDisclosures, group: "records" },

  // المراقبة والالتزام
  monitoring: { icon: "🔍", label: "برنامج المراقبة", render: renderMonitoring, group: "control" },
  assessments: { icon: "📋", label: "الفحص الذاتي", render: renderAssessments, group: "control" },
  findings: { icon: "🛠", label: "الملاحظات والتصحيح", render: renderFindings, group: "control" },

  // التخطيط والتطوير
  plan: { icon: "📅", label: "الخطة السنوية", render: renderPlan, group: "planning" },
  training: { icon: "🎓", label: "التدريب والتوعية", render: renderTraining, group: "planning" },

  // التجمعات الصحية
  maturity: { icon: "📊", label: "تقييم نضج التجمعات", render: renderMaturity, group: "clusters", clusterVisible: true },

  // الاجتماعات
  weekly: { icon: "🗓", label: "الاجتماع الأسبوعي", render: renderWeekly, group: "meetings" },
  deptmeetings: { icon: "🤝", label: "اجتماعات الأقسام", render: renderDeptMeetings, group: "meetings" },
  mytasks: { icon: "✅", label: "مهامي", render: renderMyTasks, group: "meetings" },

  // عام
  directory: { icon: "📇", label: "دليل التواصل", render: renderDirectory, group: "general" },
  reports: { icon: "📊", label: "التقارير", render: renderReports, group: "general" },
  admin: { icon: "⚙️", label: "الإدارة", render: renderAdmin, group: "general" },

  // موسوعة الوثائق مدمجة داخل مكتبة الالتزام كتبويب فرعي — المسار يبقى للروابط القديمة
  regulations: {
    icon: "📚", label: "الوثائق", hidden: true,
    render: (el, navFn, refresh, params = {}) => renderLibrary(el, navFn, refresh, { ...params, tab: "analysis" }),
  },
};

// المجموعات المفتوحة حالياً في القائمة الجانبية
const openGroups = new Set();

let currentView = "dashboard";
const main = $("#app");

function nav(view, params = {}) {
  currentView = VIEWS[view] ? view : "dashboard";
  // مسؤول التزام التجمع محصور في الوحدات المتاحة له (التقييم الذاتي والنتائج)
  if (isClusterOfficer(store.user) && !VIEWS[currentView]?.clusterVisible) currentView = "maturity";
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
    <nav id="side-nav">${renderNavItems(u)}</nav>
    <div class="side-foot">
      <div class="user-chip" title="${esc(u.email)}">👤 ${esc(u.name)}<br/><small>${esc(ROLES[u.role] || u.role)}</small></div>
      <div class="row">
        <button class="secondary small theme-toggle" id="btn-theme" title="تبديل الوضع الداكن/الفاتح">${themeIcon()}</button>
        <button class="secondary small" id="btn-notif" title="عرض التنبيهات الواردة">🔔<span id="notif-count" class="notif-count hidden"></span></button>
        ${canEdit(u) ? '<button class="secondary small" id="btn-settings" title="إعدادات التحليل الذكي (مفتاح Claude API والنموذج)">⚙</button>' : ""}
        <button class="secondary small" id="btn-refresh" title="إعادة تحميل جميع البيانات من الخادم">↻</button>
        <button class="secondary small" id="btn-logout" title="تسجيل الخروج من النظام">خروج</button>
      </div>
      <div class="copyright">جميع الحقوق محفوظة لصالح الميموني</div>
    </div>`;

  $("#btn-logout").onclick = () => authApi.logout();
  $("#btn-refresh").onclick = async () => { toast("جاري التحديث…"); await refreshAll(); toast("حُدّثت البيانات"); };
  $("#btn-settings")?.addEventListener("click", openSettings);
  $("#btn-notif").onclick = openNotifications;
  $("#btn-theme").onclick = toggleTheme;
  renderShellNav();
  updateNotifBadge();
}

// ---------- السمة (داكن/فاتح) ----------
const currentTheme = () => (document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark");
const themeIcon = () => (currentTheme() === "light" ? "☀️" : "🌙");
function toggleTheme() {
  const next = currentTheme() === "light" ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", next);
  try { localStorage.setItem("cms-theme", next); } catch (e) { /* تجاهل */ }
  const btn = $("#btn-theme");
  if (btn) btn.textContent = themeIcon();
}

// ---------- القائمة الجانبية بمجموعات قابلة للطي ----------
function visibleViews(u) {
  return Object.entries(VIEWS).filter(([k, v]) => {
    if (v.hidden) return false;
    // مسؤول التزام التجمع يرى فقط أداة التقييم الذاتي والنتائج الربعية
    if (isClusterOfficer(u)) return v.clusterVisible === true;
    return k !== "admin" || canApprove(u);
  });
}

function navBtn(k, v, child = false) {
  return `<button class="nav-item ${child ? "child" : ""} ${k === currentView ? "active" : ""}" data-view="${k}"><span>${v.icon}</span> ${v.label}</button>`;
}

function renderNavItems(u) {
  const entries = visibleViews(u);
  // مسؤول التزام التجمع: عناصر مسطّحة بلا مجموعات
  if (isClusterOfficer(u)) return entries.map(([k, v]) => navBtn(k, v)).join("");

  const byGroup = {};
  let top = "";
  for (const [k, v] of entries) {
    if (!v.group) { top += navBtn(k, v); continue; }
    (byGroup[v.group] ||= []).push([k, v]);
  }
  let html = top;
  for (const g of NAV_GROUPS) {
    const items = byGroup[g.key];
    if (!items || !items.length) continue;
    const hasActive = items.some(([k]) => k === currentView);
    const isOpen = openGroups.has(g.key) || hasActive;
    html += `<div class="nav-group ${isOpen ? "open" : ""}">
      <button class="nav-group-head ${hasActive ? "has-active" : ""}" data-group="${g.key}">
        <span class="nav-group-title"><span>${g.icon}</span> ${g.label}</span>
        <span class="nav-caret">▾</span>
      </button>
      <div class="nav-group-items">${items.map(([k, v]) => navBtn(k, v, true)).join("")}</div>
    </div>`;
  }
  return html;
}

function bindNav() {
  const navEl = document.getElementById("side-nav");
  if (!navEl) return;
  navEl.querySelectorAll("[data-view]").forEach((b) => (b.onclick = () => nav(b.dataset.view)));
  navEl.querySelectorAll("[data-group]").forEach((b) => (b.onclick = () => {
    const g = b.dataset.group;
    if (openGroups.has(g)) openGroups.delete(g); else openGroups.add(g);
    renderShellNav();
  }));
}

function renderShellNav() {
  const navEl = document.getElementById("side-nav");
  if (!navEl) return;
  navEl.innerHTML = renderNavItems(store.user);
  bindNav();
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
    ${fld("وسيط API (اختياري)", `<input type="text" id="set-base" placeholder="https://api.anthropic.com" value="${esc(settings.apiBase)}" />`)}
    <p class="muted" style="margin-top:2px">استخدمه فقط إذا ظهر خطأ «فشل الاتصال بالشبكة» (Failed to fetch) عند التحليل —
      يعني أن شبكتك أو مانع الإعلانات يحجب <code>api.anthropic.com</code>. اترك الحقل فارغاً للاتصال المباشر.
      ⚠️ الوسيط يمرّر مفتاحك، فلا تستخدم إلا وسيطاً تثق به.</p>
    <div class="row" style="margin-top:14px">
      <button id="set-save">حفظ</button>
      <button class="secondary" id="set-cancel">إلغاء</button>
    </div>`);
  $("#set-cancel", ov).onclick = () => ov.remove();
  $("#set-save", ov).onclick = () => {
    settings.save($("#set-key", ov).value.trim(), val("set-model", ov), val("set-base", ov));
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
      const home = isClusterOfficer(user) ? "maturity" : "dashboard";
      nav(VIEWS[hash] ? hash : home);
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
