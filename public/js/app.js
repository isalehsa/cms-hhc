// نظام إدارة الالتزام (CMS) — الهيكل الرئيسي: تسجيل الدخول، القائمة الجانبية، التوجيه، التنبيهات
import { configReady } from "./firebase-config.js";
import * as db from "./db.js";
import * as authApi from "./auth.js";
import { canEdit, canApprove, isClusterOfficer } from "./auth.js";
import { store, loadAll, reload } from "./state.js";
import { $, esc, toast, modal, fld, txt, val, spinnerHtml, fmtDate, initTooltips, lineIcon } from "./ui.js";
import { runAutoSync } from "./sync.js";
import { runReminders } from "./reminders.js";
import { captureSnapshot } from "./metrics.js";
import { ROLES } from "./meta.js";
import { renderDashboard } from "./views/dashboard.js";
import { renderExecutive } from "./views/executive.js";
import { renderLibrary } from "./views/library.js";
import { renderRisks } from "./views/risks.js";
import { renderRiskMap } from "./views/riskmap.js";
import { renderMonitoring } from "./views/monitoring.js";
import { renderPlan } from "./views/plan.js";
import { renderAssessments } from "./views/assessments.js";
import { renderFindings } from "./views/findings.js";
import { renderCorrespondence } from "./views/correspondence.js";
import { renderDisclosures } from "./views/disclosures.js";
import { renderTraining } from "./views/training.js";
import { renderMaturity } from "./views/maturity.js";
import { renderWeekly, renderDeptMeetings, renderMyTasks } from "./views/weekly.js";
import { renderMeetings } from "./views/meetings.js";
import { renderRegChange } from "./views/regchange.js";
import { renderWorkflow } from "./views/workflow.js";
import { renderAudit } from "./views/audit.js";
import { scanWorkflowEscalations } from "./workflow.js";
import { registerServiceWorker, ensureNotificationPermission, notificationsState, showLocalNotification } from "./pwa.js";
import {
  hasSSO, ssoLabel, loginWithSSO, isMfaError, getMfaResolver, completeTotpSignIn,
  enrolledFactors, startTotpEnrollment, finishTotpEnrollment, unenrollFactor,
} from "./identity.js";
import { renderDirectory } from "./views/directory.js";
import { renderReports } from "./views/reports.js";
import { renderAssistant } from "./views/assistant.js";
import { renderGovernance } from "./views/governance.js";
import { settings, aiEnabled } from "./views/regulations.js";
import { renderAdmin } from "./views/admin.js";
import { DEFAULT_MODEL } from "./analyzer.js";

const VIEWS = {
  dashboard: { ic: "grid", label: "لوحة التحكم", render: renderDashboard },
  executive: { ic: "trend", label: "اللوحة التنفيذية", render: renderExecutive },

  // السجلات
  library: { ic: "book", label: "مكتبة الالتزام", render: renderLibrary, group: "records" },
  risks: { ic: "alert", label: "سجل المخاطر", render: renderRisks, group: "records" },
  riskmap: { ic: "scale", label: "خريطة المخاطر", render: renderRiskMap, group: "records" },
  regchange: { ic: "bell", label: "التغيّر التنظيمي", render: renderRegChange, group: "records" },
  correspondence: { ic: "mail", label: "سجل المراسلات", render: renderCorrespondence, group: "records" },
  disclosures: { ic: "folder", label: "سجل الإفصاحات", render: renderDisclosures, group: "records" },

  // المراقبة والالتزام
  monitoring: { ic: "search", label: "برنامج المراقبة", render: renderMonitoring, group: "control" },
  assessments: { ic: "clipboard", label: "الفحص الذاتي", render: renderAssessments, group: "control" },
  findings: { ic: "tool", label: "الملاحظات والتصحيح", render: renderFindings, group: "control" },
  audit: { ic: "shield", label: "التدقيق الداخلي", render: renderAudit, group: "control" },
  workflow: { ic: "checksq", label: "مسارات الاعتماد", render: renderWorkflow, group: "control" },

  // التخطيط والتطوير
  plan: { ic: "calendar", label: "الخطة السنوية", render: renderPlan, group: "planning" },
  training: { ic: "cap", label: "التدريب والتوعية", render: renderTraining, group: "planning" },

  // التجمعات الصحية
  maturity: { ic: "bars", label: "تقييم نضج التجمعات", render: renderMaturity, group: "clusters", clusterVisible: true },

  // الاجتماعات
  weekly: { ic: "calcheck", label: "الاجتماع الأسبوعي", render: renderWeekly, group: "meetings" },
  deptmeetings: { ic: "users", label: "اجتماعات الأقسام", render: renderDeptMeetings, group: "meetings" },
  mytasks: { ic: "checksq", label: "مهامي", render: renderMyTasks, group: "meetings" },
  cmeetings: { ic: "calendar", label: "اجتماعات الالتزام", render: renderMeetings, group: "meetings" },

  // عام
  directory: { ic: "contact", label: "دليل التواصل", render: renderDirectory, group: "general" },
  reports: { ic: "pie", label: "التقارير", render: renderReports, group: "general" },
  assistant: { ic: "chat", label: "المساعد الذكي", render: renderAssistant, group: "general" },
  governance: { ic: "shield", label: "حوكمة البيانات", render: renderGovernance, group: "general" },
  admin: { ic: "gear", label: "الإدارة", render: renderAdmin, group: "general" },

  // موسوعة الوثائق مدمجة داخل مكتبة الالتزام كتبويب فرعي — المسار يبقى للروابط القديمة
  regulations: {
    ic: "book", label: "الوثائق", hidden: true,
    render: (el, navFn, refresh, params = {}) => renderLibrary(el, navFn, refresh, { ...params, tab: "analysis" }),
  },
};

// ترتيب المجموعات في الشريط العلوي (فواصل بينها)
const NAV_GROUP_ORDER = ["records", "control", "planning", "clusters", "meetings", "general"];

// تسمية وأيقونة كل مجموعة — تُعرض كزرّ رئيسي في الشريط، وتنكشف تبويباتها بقائمة منسدلة
const NAV_GROUPS = {
  records: { label: "السجلات", ic: "folder" },
  control: { label: "المراقبة والالتزام", ic: "search" },
  planning: { label: "التخطيط والتطوير", ic: "calendar" },
  clusters: { label: "التجمعات الصحية", ic: "bars" },
  meetings: { label: "الاجتماعات", ic: "calcheck" },
  general: { label: "عام", ic: "gear" },
};

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
      <div class="brand-txt"><h1>إدارة الالتزام</h1><p class="subtitle">CMS · ISO 37301</p></div>
    </div>
    <nav id="side-nav" class="tb-nav">${renderNavItems(u)}</nav>
    <div class="tb-actions">
      <button class="tb-action theme-toggle" id="btn-theme" title="تبديل الوضع الداكن/الفاتح">${themeIcon()}</button>
      <button class="tb-action" id="btn-notif" title="عرض التنبيهات الواردة">🔔<span id="notif-count" class="notif-count hidden"></span></button>
      ${canEdit(u) ? '<button class="tb-action" id="btn-settings" title="إعدادات التحليل الذكي (مفتاح Claude API والنموذج)">⚙</button>' : ""}
      <button class="tb-action" id="btn-security" title="الأمان والتحقق بخطوتين (MFA)">🔐</button>
      <button class="tb-action" id="btn-refresh" title="إعادة تحميل جميع البيانات من الخادم">↻</button>
      <div class="user-chip" title="${esc(u.email)}"><span class="user-av">${esc((u.name || "?").trim().charAt(0))}</span><span class="user-meta"><strong>${esc(u.name)}</strong><small>${esc(ROLES[u.role] || u.role)}</small></span></div>
      <button class="tb-action" id="btn-logout" title="تسجيل الخروج من النظام">⎋</button>
    </div>`;

  $("#btn-logout").onclick = () => authApi.logout();
  $("#btn-refresh").onclick = async () => { toast("جاري التحديث…"); await refreshAll(); toast("حُدّثت البيانات"); };
  $("#btn-settings")?.addEventListener("click", openSettings);
  $("#btn-security").onclick = openSecurity;
  $("#btn-notif").onclick = openNotifications;
  $("#btn-theme").onclick = toggleTheme;
  renderShellNav();
  bindNavAutoClose();
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

// ---------- الشريط العلوي الأفقي بأيقونات خطّية ----------
function visibleViews(u) {
  return Object.entries(VIEWS).filter(([k, v]) => {
    if (v.hidden) return false;
    // مسؤول التزام التجمع يرى فقط أداة التقييم الذاتي والنتائج الربعية
    if (isClusterOfficer(u)) return v.clusterVisible === true;
    return k !== "admin" || canApprove(u);
  });
}

// زرّ تبويب مفرد نصّي مدمج — للوحة التحكم واللوحة التنفيذية بلا مجموعة
function navBtn(k, v) {
  return `<button class="tb-item ${k === currentView ? "active" : ""}" data-view="${k}" title="${esc(v.label)}">${esc(v.label)}</button>`;
}

// عنصر داخل القائمة المنسدلة للمجموعة (أيقونة + تسمية)
function navMenuItem(k, v) {
  return `<button class="tb-menu-item ${k === currentView ? "active" : ""}" data-view="${k}" role="menuitem">${lineIcon(v.ic, 22)}<span>${esc(v.label)}</span></button>`;
}

// زرّ مجموعة رئيسي مع قائمته المنسدلة — يُبرز إن كانت الشاشة الحالية ضمنه
function navGroup(g, items) {
  const meta = NAV_GROUPS[g] || { label: g, ic: "grid" };
  const active = items.some(([k]) => k === currentView);
  return `<div class="tb-group${active ? " active" : ""}">
      <button class="tb-group-btn" data-group="${g}" aria-haspopup="true" aria-expanded="false" title="${esc(meta.label)}">
        <span>${esc(meta.label)}</span><span class="tb-caret" aria-hidden="true">▾</span>
      </button>
      <div class="tb-menu" role="menu">${items.map(([k, v]) => navMenuItem(k, v)).join("")}</div>
    </div>`;
}

function renderNavItems(u) {
  const entries = visibleViews(u);
  if (isClusterOfficer(u)) return entries.map(([k, v]) => navBtn(k, v)).join("");

  const byGroup = {};
  let head = "";
  for (const [k, v] of entries) {
    if (!v.group) { head += navBtn(k, v); continue; }
    (byGroup[v.group] ||= []).push([k, v]);
  }
  let html = head;
  for (const g of NAV_GROUP_ORDER) {
    const items = byGroup[g];
    if (items && items.length) html += navGroup(g, items);
  }
  return html;
}

function bindNav() {
  const navEl = document.getElementById("side-nav");
  if (!navEl) return;
  navEl.querySelectorAll("[data-view]").forEach((b) => (b.onclick = () => nav(b.dataset.view)));
  // زرّ المجموعة: القائمة تنكشف بالمرور (CSS)، وبالنقر أيضاً للمس ولوحة المفاتيح
  navEl.querySelectorAll(".tb-group-btn").forEach((b) => {
    b.onclick = (e) => {
      e.stopPropagation();
      const grp = b.closest(".tb-group");
      const willOpen = !grp.classList.contains("open");
      navEl.querySelectorAll(".tb-group.open").forEach((x) => { x.classList.remove("open"); x.querySelector(".tb-group-btn")?.setAttribute("aria-expanded", "false"); });
      grp.classList.toggle("open", willOpen);
      b.setAttribute("aria-expanded", String(willOpen));
    };
  });
}

// إغلاق القوائم المنسدلة عند النقر خارجها (يُثبَّت مرة واحدة)
let navCloseBound = false;
function bindNavAutoClose() {
  if (navCloseBound) return;
  navCloseBound = true;
  document.addEventListener("click", (e) => {
    if (e.target.closest?.(".tb-group")) return;
    document.querySelectorAll("#side-nav .tb-group.open").forEach((x) => {
      x.classList.remove("open");
      x.querySelector(".tb-group-btn")?.setAttribute("aria-expanded", "false");
    });
  });
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
      <div class="row">
        ${notificationsState() === "default" ? '<button class="secondary small" id="nf-enable" title="تفعيل إشعارات النظام على هذا الجهاز">تفعيل إشعارات النظام</button>' : ""}
        ${items.some((n) => !n.read) ? '<button class="secondary small" id="nf-readall">تعليم الكل كمقروء</button>' : ""}
      </div>
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
  $("#nf-enable", ov)?.addEventListener("click", async () => {
    const state = await ensureNotificationPermission();
    toast(state === "granted" ? "فُعّلت إشعارات النظام" : state === "denied" ? "الإشعارات محظورة — فعّلها من إعدادات المتصفح" : "لم تُفعّل الإشعارات", state !== "granted");
    $("#nf-enable", ov)?.remove();
  });
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

// ---------- الأمان: التحقق بخطوتين (MFA / TOTP) ----------
function openSecurity() {
  const factors = enrolledFactors();
  const ov = modal(`
    <h2>🔐 الأمان — التحقق بخطوتين</h2>
    <p class="muted">أضف طبقة حماية ثانية بربط تطبيق مصادقة (TOTP) بحسابك — متوافق مع ضوابط الأمن (NCA ECC).</p>
    <h3>العوامل المسجّلة</h3>
    ${factors.length ? `<ul>${factors.map((f) => `<li>${esc(f.displayName || "تطبيق مصادقة")} <button class="danger small" data-unen="${esc(f.uid)}">إزالة</button></li>`).join("")}</ul>` : '<p class="muted">لا يوجد تحقّق بخطوتين مفعّل.</p>'}
    <div id="mfa-enroll-area"></div>
    <div class="row" style="margin-top:14px">
      <button id="mfa-start">＋ تسجيل تطبيق مصادقة</button>
      <button class="secondary" id="sec-close">إغلاق</button>
    </div>`);
  $("#sec-close", ov).onclick = () => ov.remove();
  ov.querySelectorAll("[data-unen]").forEach((b) => b.addEventListener("click", async () => {
    if (!(await import("./ui.js").then((m) => m.confirmBox("إزالة هذا العامل؟")))) return;
    try { await unenrollFactor(b.dataset.unen); toast("أُزيل العامل"); ov.remove(); openSecurity(); }
    catch (e) { toast(e.message, true); }
  }));
  $("#mfa-start", ov).onclick = async () => {
    const area = $("#mfa-enroll-area", ov);
    area.innerHTML = spinnerHtml("جاري تجهيز السر…");
    try {
      const { secret, secretKey, uri } = await startTotpEnrollment(store.user.email, "CMS — إدارة الالتزام");
      area.innerHTML = `
        <div class="card" style="background:rgba(20,112,92,0.05);margin-top:10px">
          <p>أضف الحساب في تطبيق المصادقة يدوياً بهذا المفتاح، أو افتح الرابط:</p>
          <p><code style="word-break:break-all">${esc(secretKey)}</code></p>
          <p><a href="${esc(uri)}" class="btn-link">فتح في تطبيق المصادقة</a></p>
          ${fld("رمز التحقق من التطبيق", '<input type="text" id="mfa-enroll-otp" inputmode="numeric" placeholder="123456" />')}
          <div class="row"><button id="mfa-finish">تأكيد وتفعيل</button></div>
        </div>`;
      $("#mfa-finish", area).onclick = async () => {
        try {
          await finishTotpEnrollment(secret, val("mfa-enroll-otp", ov), "تطبيق مصادقة");
          toast("فُعّل التحقق بخطوتين");
          ov.remove();
          openSecurity();
        } catch (e) {
          toast(e.code === "auth/requires-recent-login" ? "يلزم تسجيل دخول حديث — سجّل الخروج ثم الدخول وأعد المحاولة" : (e.message || "رمز غير صحيح"), true);
        }
      };
    } catch (e) {
      area.innerHTML = `<p class="lvl lvl-critical"><span class="dot"></span>${esc(e.code === "auth/requires-recent-login" ? "يلزم تسجيل دخول حديث لتفعيل التحقق بخطوتين" : e.message)}</p>`;
    }
  };
}

// نافذة إدخال رمز TOTP عند الدخول (بعد طلب MFA)
function promptMfaCode(err) {
  const resolver = getMfaResolver(err);
  const ov = modal(`
    <h2>🔐 التحقق بخطوتين</h2>
    <p class="muted">أدخل الرمز من تطبيق المصادقة لإتمام الدخول.</p>
    ${fld("رمز التحقق", '<input type="text" id="mfa-otp" inputmode="numeric" autocomplete="one-time-code" placeholder="123456" />')}
    <div class="row" style="margin-top:14px">
      <button id="mfa-go">تأكيد</button>
      <button class="secondary" id="mfa-cancel">إلغاء</button>
    </div>`);
  $("#mfa-cancel", ov).onclick = () => { ov.remove(); renderLogin(); };
  $("#mfa-go", ov).onclick = async () => {
    try {
      await completeTotpSignIn(resolver, val("mfa-otp", ov));
      ov.remove(); // onAuth يُكمل تحميل النظام
    } catch (e) {
      toast(e.message?.includes("INVALID") || e.code === "auth/invalid-verification-code" ? "رمز غير صحيح" : (e.message || "تعذّر التحقق"), true);
    }
  };
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
      ${hasSSO() ? `<div style="margin-top:10px"><button class="secondary" id="sso-btn" style="width:100%">🔐 ${esc(ssoLabel())}</button></div>` : ""}
    </section>`;
  const doLogin = async () => {
    const btn = $("#login-btn");
    btn.disabled = true;
    try {
      await authApi.login($("#login-email").value.trim(), $("#login-pass").value);
    } catch (err) {
      if (isMfaError(err)) { promptMfaCode(err); return; }
      toast(err.message, true);
      btn.disabled = false;
    }
  };
  $("#login-btn").onclick = doLogin;
  $("#login-pass").addEventListener("keydown", (e) => e.key === "Enter" && doLogin());
  $("#sso-btn")?.addEventListener("click", async () => {
    try {
      await loginWithSSO();
    } catch (err) {
      if (isMfaError(err)) { promptMfaCode(err); return; }
      toast(err.message || err.code || "تعذّر الدخول الموحّد", true);
    }
  });
}

// ---------- تشغيل ----------
function init() {
  initTooltips();
  registerServiceWorker();
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
      // توليد تنبيهات الاستحقاقات المتأخرة/القريبة في الخلفية (داخل النظام + بريد اختياري)
      if (canEdit(user)) {
        captureSnapshot().catch((e) => console.warn("snapshot failed", e)); // لقطة يومية لسلاسل اللوحة التنفيذية
        scanWorkflowEscalations().then((n) => { if (n) { reload("notifications").then(updateNotifBadge); } }).catch((e) => console.warn("wf escalation failed", e));
        runReminders()
          .then(async (s) => {
            if (s.inApp) {
              await reload("notifications");
              updateNotifBadge();
            }
            if (s.overdue || s.soon) {
              const parts = [];
              if (s.overdue) parts.push(`${s.overdue} متأخر`);
              if (s.soon) parts.push(`${s.soon} قريب`);
              toast(`تنبيهات الاستحقاق: ${parts.join(" و")}${s.emails ? ` — أُرسل ${s.emails} ملخّص بريدي` : ""}`);
              // إشعار نظام محلي عند تفعيل الإشعارات (PWA)
              if (s.overdue) showLocalNotification("تنبيهات الالتزام", `لديك ${s.overdue} استحقاق متأخر و${s.soon} قريب`, "#dashboard").catch(() => {});
            }
          })
          .catch((e) => console.warn("reminders failed", e));
      }
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
