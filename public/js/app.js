// واجهة نظام إدارة الالتزام — نسخة Firebase (تعمل بالكامل في المتصفح)
// البيانات: Firestore · المصادقة: Firebase Auth · التحليل والاستخراج والتصدير: في المتصفح
import { configReady } from "./firebase-config.js";
import * as db from "./db.js";
import * as authApi from "./auth.js";
import { DEPARTMENTS, RISK_LEVELS, APPLICABILITY } from "./meta.js";
import { findRelated } from "./similarity.js";
import { analyzeRegulation, DEFAULT_MODEL } from "./analyzer.js";
import { extractText } from "./extract.js";
import { downloadWorkbook } from "./export.js";

const state = {
  user: null,
  authReady: false,
  meta: {
    departments: DEPARTMENTS,
    risk_levels: RISK_LEVELS,
    applicability: APPLICABILITY,
  },
  view: "list", // list | detail | library
  regulations: [],
  current: null,
  library: [],
  filters: { applicability: "", risk: "", department: "", search: "" },
  libFilters: { regulation: "", applicability: "", risk: "", department: "", search: "" },
  openLinks: null, // معرف المادة المفتوح لوحة روابطها
  relatedCache: {},
  analyzing: {}, // regId -> رسالة تقدم التحليل الجاري في هذه الصفحة
};

const $ = (sel) => document.querySelector(sel);
const app = $("#app");

// ---------- إعدادات التحليل الذكي (تُحفظ في متصفح المستخدم فقط) ----------
const settings = {
  get apiKey() {
    return localStorage.getItem("chcc_api_key") || "";
  },
  get model() {
    return localStorage.getItem("chcc_model") || DEFAULT_MODEL;
  },
  save(apiKey, model) {
    if (apiKey) localStorage.setItem("chcc_api_key", apiKey);
    else localStorage.removeItem("chcc_api_key");
    if (model && model !== DEFAULT_MODEL) localStorage.setItem("chcc_model", model);
    else localStorage.removeItem("chcc_model");
  },
};

const aiEnabled = () => Boolean(settings.apiKey);

// ---------- أدوات ----------
function toast(msg, isError = false) {
  const el = $("#toast");
  el.textContent = msg;
  el.className = `toast${isError ? " error" : ""}`;
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.add("hidden"), 4000);
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

const isManager = () => state.user?.role === "compliance_manager";

// ---------- شاشة الإعداد الأولي (قبل ضبط firebase-config.js) ----------
function renderSetup() {
  app.innerHTML = `
    <section class="card">
      <h2>⚙️ التطبيق بحاجة لضبط إعدادات Firebase</h2>
      <p>لم تُضبط إعدادات مشروع Firebase بعد. الخطوات:</p>
      <ol class="setup-steps">
        <li>أنشئ مشروعاً مجانياً في <a href="https://console.firebase.google.com" target="_blank" rel="noopener">Firebase Console</a>.</li>
        <li>فعّل <strong>Authentication</strong> (بريد إلكتروني/كلمة مرور) و<strong>Cloud Firestore</strong>.</li>
        <li>انسخ إعدادات التطبيق من Project settings → Your apps إلى الملف <code>public/js/firebase-config.js</code>.</li>
        <li>أعد النشر: <code>firebase deploy</code>.</li>
      </ol>
      <p class="muted">التفاصيل الكاملة في ملف README داخل المستودع.</p>
    </section>`;
}

// ---------- المصادقة ----------
function renderAuth() {
  const el = $("#auth-area");
  if (state.user) {
    el.innerHTML = `
      <span class="user-chip">👤 ${esc(state.user.display_name)}${isManager() ? "" : " (استعراض)"}</span>
      ${isManager() ? '<button class="secondary small" id="settings-btn" title="إعدادات التحليل الذكي">⚙</button>' : ""}
      <button class="secondary small" id="logout-btn">تسجيل خروج</button>`;
    $("#logout-btn").onclick = () => authApi.logout();
    $("#settings-btn")?.addEventListener("click", openSettings);
  } else {
    el.innerHTML = "";
  }
}

function renderLogin() {
  app.innerHTML = `
    <section class="card login-card">
      <h2>تسجيل الدخول</h2>
      <p class="muted">الدخول بحساب Firebase المُسجَّل لمنشأتك (بريد إلكتروني وكلمة مرور).</p>
      <label>البريد الإلكتروني</label>
      <input type="email" id="login-email" autocomplete="username" />
      <label>كلمة المرور</label>
      <input type="password" id="login-pass" autocomplete="current-password" />
      <div style="margin-top:12px">
        <button id="login-btn">دخول</button>
      </div>
    </section>`;
  const doLogin = async () => {
    const btn = $("#login-btn");
    btn.disabled = true;
    try {
      await authApi.login($("#login-email").value.trim(), $("#login-pass").value);
      // onAuth يتكفل بإعادة الرسم بعد نجاح الدخول
    } catch (err) {
      toast(err.message, true);
      btn.disabled = false;
    }
  };
  $("#login-btn").onclick = doLogin;
  $("#login-pass").addEventListener("keydown", (e) => e.key === "Enter" && doLogin());
}

// ---------- إعدادات التحليل الذكي ----------
function openSettings() {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal card">
      <h2>⚙ إعدادات التحليل الذكي</h2>
      <p class="muted">مفتاح Claude API يُحفظ في متصفحك فقط (localStorage) ولا يُرسل لأي جهة غير Anthropic.
        بدون مفتاح يعمل المحلل النصي الاحتياطي وتُعلَّم البنود «بحاجة لمراجعة».</p>
      <label>مفتاح Claude API</label>
      <input type="password" id="set-key" placeholder="sk-ant-..." value="${esc(settings.apiKey)}" />
      <label>النموذج</label>
      <input type="text" id="set-model" placeholder="${DEFAULT_MODEL}" value="${esc(settings.model)}" />
      <div class="row" style="margin-top:14px">
        <button id="set-save">حفظ</button>
        <button class="secondary" id="set-cancel">إلغاء</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector("#set-cancel").onclick = () => overlay.remove();
  overlay.addEventListener("click", (e) => e.target === overlay && overlay.remove());
  overlay.querySelector("#set-save").onclick = () => {
    settings.save(
      overlay.querySelector("#set-key").value.trim(),
      overlay.querySelector("#set-model").value.trim()
    );
    overlay.remove();
    toast(aiEnabled() ? "حُفظت الإعدادات — التحليل الذكي مفعّل" : "حُفظت الإعدادات — التحليل الذكي غير مفعّل");
    render();
  };
}

// ---------- التنقل ----------
function navHtml(active) {
  return `
    <nav class="tabs">
      <button class="tab ${active === "list" ? "active" : ""}" data-nav="list">📋 الأنظمة واللوائح</button>
      <button class="tab ${active === "library" ? "active" : ""}" data-nav="library">📚 مكتبة الالتزام</button>
    </nav>`;
}

function bindNav() {
  app.querySelectorAll("[data-nav]").forEach((btn) => {
    btn.onclick = async () => {
      try {
        if (btn.dataset.nav === "library") {
          state.view = "library";
          await loadLibrary();
          renderLibrary();
        } else {
          state.view = "list";
          await loadRegulations();
          renderList();
        }
      } catch (err) {
        toast(err.message, true);
      }
    };
  });
}

// ---------- قائمة الأنظمة ----------
async function loadRegulations() {
  state.regulations = await db.listRegulations();
}

function statusBadge(reg) {
  if (reg.status === "processing") {
    const note = state.analyzing[reg.id];
    return `<span class="spinner"></span> <span class="muted">${esc(note || "جاري التحليل…")}</span>`;
  }
  if (reg.status === "failed") return `<span class="badge risk-high">فشل التحليل</span>`;
  if (reg.status === "ready") {
    const m = reg.analysis_method === "ai" ? "ذكاء اصطناعي" : "تحليل نصي مبدئي";
    return `<span class="badge status">جاهز</span> <span class="badge method">${m}</span>`;
  }
  return `<span class="badge">بانتظار التحليل</span>`;
}

function renderList() {
  const addForm = isManager()
    ? `
    <section class="card">
      <h2>إضافة نظام / لائحة جديدة</h2>
      <p class="muted">أدخل نص النظام كاملاً وسيقوم النظام باستخراج جميع المواد والبنود وتصنيفها
        (تنطبق / لا تنطبق) مع تحديد درجة الخطر والإدارة المالكة لكل مادة.
        ${aiEnabled() ? "" : "⚠️ التحليل بالذكاء الاصطناعي غير مفعّل حالياً (أضف مفتاح API من ⚙ أعلى الصفحة) — سيُستخدم التقسيم النصي المبدئي وتبقى جميع البنود بانتظار مراجعتك."}</p>
      <label>اسم النظام / اللائحة *</label>
      <input type="text" id="reg-name" placeholder="مثال: لائحة حوكمة البيانات" />
      <label>وصف مختصر</label>
      <input type="text" id="reg-desc" placeholder="اختياري" />
      <label>سياق المنشأة (يساعد الذكاء الاصطناعي على تحديد الانطباق والإدارة المالكة)</label>
      <input type="text" id="reg-context" placeholder="مثال: شركة قطاع صحي خاص، 500 موظف، تتعامل مع بيانات مرضى" />
      <label>ملف النظام (PDF أو Word) — اختياري</label>
      <div class="row">
        <input type="file" id="reg-file" class="grow"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" />
        <span id="reg-file-status" class="muted"></span>
      </div>
      <p class="muted">عند اختيار ملف يُستخرج نصه تلقائياً في الحقل أدناه لمراجعته قبل التحليل. ملفات PDF الممسوحة ضوئياً تُعالج بالتعرف الضوئي (OCR) داخل متصفحك.</p>
      <label>النص الكامل للنظام / اللائحة *</label>
      <textarea id="reg-text" placeholder="الصق النص الكامل هنا، أو حمّل ملف PDF/Word أعلاه…"></textarea>
      <div style="margin-top:12px">
        <button id="add-reg-btn">إضافة وتحليل</button>
        <span class="muted">التحليل يجري داخل هذه الصفحة — لا تغلقها قبل اكتماله.</span>
      </div>
    </section>`
    : `<section class="card"><p class="muted">سجّل الدخول بحساب مدير الالتزام لإضافة الأنظمة وتعديل التصنيفات.</p></section>`;

  const rows = state.regulations
    .map(
      (r) => `
      <div class="reg-list-item">
        <div>
          <div class="name" data-open="${r.id}">${esc(r.name)}</div>
          <div class="muted">${esc(r.description || "")} · ${r.articles_count} مادة/بند · أُضيف ${new Date(r.created_at).toLocaleDateString("ar-SA")}</div>
        </div>
        <div class="row">
          ${statusBadge(r)}
          ${isManager() ? `<button class="danger small" data-del="${r.id}">حذف</button>` : ""}
        </div>
      </div>`
    )
    .join("");

  app.innerHTML = `
    ${navHtml("list")}
    ${addForm}
    <section class="card">
      <h2>الأنظمة واللوائح المسجلة (${state.regulations.length})</h2>
      ${rows || '<p class="muted">لا توجد أنظمة مسجلة بعد.</p>'}
    </section>`;

  bindNav();
  if (isManager()) {
    $("#add-reg-btn")?.addEventListener("click", addRegulation);
    $("#reg-file")?.addEventListener("change", extractFromFile);
    app.querySelectorAll("[data-del]").forEach((btn) => {
      btn.onclick = async () => {
        if (!confirm("حذف هذا النظام وجميع مواده؟")) return;
        try {
          await db.deleteRegulation(btn.dataset.del);
          await loadRegulations();
          render();
          toast("تم الحذف");
        } catch (err) {
          toast(err.message, true);
        }
      };
    });
  }
  app.querySelectorAll("[data-open]").forEach((el) => {
    el.onclick = () => openRegulation(el.dataset.open);
  });
}

async function extractFromFile() {
  const input = $("#reg-file");
  const status = $("#reg-file-status");
  const file = input.files?.[0];
  if (!file) return;
  const setStatus = (msg) => {
    status.innerHTML = `<span class="spinner"></span> ${esc(msg)}`;
  };
  setStatus("جاري استخراج النص…");
  try {
    const data = await extractText(file, setStatus);
    $("#reg-text").value = data.text;
    const nameField = $("#reg-name");
    if (!nameField.value.trim()) {
      nameField.value = file.name.replace(/\.(pdf|docx)$/i, "");
    }
    status.textContent = data.ocr
      ? `✔ ${data.note || "استُخرج النص بتقنية OCR"} (${data.text.length.toLocaleString("ar")} حرفاً)`
      : `✔ استُخرج ${data.text.length.toLocaleString("ar")} حرفاً من ${file.name}`;
    toast(
      data.ocr
        ? "استُخرج النص بالتعرف الضوئي (OCR) — دقّق النص جيداً قبل التحليل"
        : "تم استخراج النص — راجعه ثم اضغط «إضافة وتحليل»"
    );
  } catch (err) {
    status.textContent = "";
    input.value = "";
    toast(err.message, true);
  }
}

// تشغيل التحليل داخل المتصفح وحفظ النتائج في Firestore
async function runAnalysis(regId, text, orgContext) {
  state.analyzing[regId] = aiEnabled()
    ? "جاري التحليل بالذكاء الاصطناعي…"
    : "جاري التقسيم النصي المبدئي…";
  const refreshIfVisible = () => {
    if (state.view === "detail" && state.current?.id === regId) renderDetail();
    else if (state.view === "list") renderList();
  };
  try {
    await db.updateRegulation(regId, { status: "processing", analysis_error: null });
    let lastPaint = 0;
    const { method, articles, warning } = await analyzeRegulation(
      text,
      orgContext,
      { apiKey: settings.apiKey, model: settings.model },
      (chars) => {
        state.analyzing[regId] = `جاري التحليل بالذكاء الاصطناعي… (استُخرج ~${Math.round(chars / 1024)} ك.ب)`;
        if (Date.now() - lastPaint > 2000) {
          lastPaint = Date.now();
          refreshIfVisible();
        }
      }
    );
    state.analyzing[regId] = "جاري حفظ المواد…";
    refreshIfVisible();
    await db.replaceArticles(regId, articles);
    await db.updateRegulation(regId, {
      status: "ready",
      analysis_method: method,
      analysis_error: warning || null,
    });
    if (warning) toast(warning, true);
    else toast("اكتمل التحليل");
  } catch (err) {
    await db
      .updateRegulation(regId, { status: "failed", analysis_error: err.message })
      .catch(() => {});
    toast(`فشل التحليل: ${err.message}`, true);
  } finally {
    delete state.analyzing[regId];
    try {
      if (state.view === "detail" && state.current?.id === regId) {
        state.current = await db.getRegulation(regId);
        renderDetail();
      } else if (state.view === "list") {
        await loadRegulations();
        if (state.view === "list") renderList();
      }
    } catch {
      // فشل تحديث العرض لا يُفشل التحليل نفسه
    }
  }
}

async function addRegulation() {
  const name = $("#reg-name").value.trim();
  const text = $("#reg-text").value.trim();
  if (!name || !text) return toast("اسم النظام ونصه الكامل حقلان إلزاميان", true);
  const btn = $("#add-reg-btn");
  btn.disabled = true;
  try {
    const orgContext = $("#reg-context").value.trim();
    const reg = await db.createRegulation({
      name,
      description: $("#reg-desc").value.trim(),
      text,
    });
    toast("تمت الإضافة — بدأ تحليل المواد والبنود");
    runAnalysis(reg.id, text, orgContext); // يستمر في الخلفية وتُحدَّث الواجهة عند اكتماله
    await openRegulation(reg.id);
  } catch (err) {
    toast(err.message, true);
    btn.disabled = false;
  }
}

// ---------- مكتبة الالتزام ----------
async function loadLibrary() {
  const regs = await db.allRegulations();
  state.regulations = regs.map(({ articles, text, ...meta }) => ({
    ...meta,
    articles_count: articles.length,
  }));
  state.library = regs.flatMap((reg) =>
    reg.articles.map((a) => ({
      ...a,
      regulation_id: reg.id,
      regulation_name: reg.name,
    }))
  );
}

function filteredLibrary() {
  const f = state.libFilters;
  return state.library.filter((a) => {
    if (f.regulation && a.regulation_id !== f.regulation) return false;
    if (f.applicability && a.applicability !== f.applicability) return false;
    if (f.risk && a.risk_level !== f.risk) return false;
    if (f.department && a.owning_department !== f.department) return false;
    if (f.search && !`${a.regulation_name} ${a.number} ${a.title} ${a.text}`.includes(f.search))
      return false;
    return true;
  });
}

function renderLibrary() {
  const arts = filteredLibrary();
  const counts = {
    total: state.library.length,
    applies: state.library.filter((a) => a.applicability === "تنطبق").length,
    high: state.library.filter((a) => a.risk_level === "عالي" && a.applicability === "تنطبق").length,
    linked: state.library.filter((a) => a.links?.length).length,
  };

  const rows = arts
    .map(
      (a) => `
      <tr>
        <td><span class="reg-link" data-goreg="${a.regulation_id}">${esc(a.regulation_name)}</span></td>
        <td><strong>${esc(a.number)}</strong></td>
        <td>
          <strong>${esc(a.title)}</strong>
          <div class="article-text muted" style="max-height:70px">${esc(a.text)}</div>
        </td>
        <td><span class="badge ${a.applicability === "تنطبق" ? "applies" : "not-applies"}">${esc(a.applicability)}</span></td>
        <td>${riskBadge(a.risk_level)}</td>
        <td>${esc(a.owning_department)}</td>
        <td>${(a.links || [])
          .map((l) => {
            const name = state.regulations.find((r) => r.id === l.regulation_id)?.name || "؟";
            return `<span class="badge status" title="${esc(name)}">🔗 ${esc(name)} — ${esc(l.number)}</span>`;
          })
          .join("<br/>") || '<span class="muted">—</span>'}</td>
      </tr>`
    )
    .join("");

  app.innerHTML = `
    ${navHtml("library")}
    <section class="card">
      <div class="row" style="justify-content:space-between">
        <h2>📚 مكتبة الالتزام — السجل الموحد لجميع المواد والبنود</h2>
        <button class="secondary small" id="export-lib">⬇ تصدير Excel (المكتبة كاملة)</button>
      </div>
      <div class="stats">
        <div class="stat"><div class="num">${state.regulations.length}</div><div class="lbl">الأنظمة واللوائح</div></div>
        <div class="stat"><div class="num">${counts.total}</div><div class="lbl">إجمالي المواد والبنود</div></div>
        <div class="stat"><div class="num">${counts.applies}</div><div class="lbl">تنطبق</div></div>
        <div class="stat"><div class="num">${counts.high}</div><div class="lbl">خطر عالٍ (منطبقة)</div></div>
        <div class="stat"><div class="num">${counts.linked}</div><div class="lbl">مواد مرتبطة بأنظمة أخرى</div></div>
      </div>
      <div class="row filters">
        <input type="text" id="lf-search" class="grow" placeholder="بحث في جميع الأنظمة…" value="${esc(state.libFilters.search)}" />
        <select id="lf-reg"><option value="">كل الأنظمة</option>${state.regulations.map((r) => `<option value="${r.id}" ${state.libFilters.regulation === r.id ? "selected" : ""}>${esc(r.name)}</option>`).join("")}</select>
        <select id="lf-app"><option value="">كل حالات الانطباق</option>${state.meta.applicability.map((o) => `<option ${state.libFilters.applicability === o ? "selected" : ""}>${esc(o)}</option>`).join("")}</select>
        <select id="lf-risk"><option value="">كل درجات الخطر</option>${state.meta.risk_levels.map((o) => `<option ${state.libFilters.risk === o ? "selected" : ""}>${esc(o)}</option>`).join("")}</select>
        <select id="lf-dept"><option value="">كل الإدارات</option>${state.meta.departments.map((o) => `<option ${state.libFilters.department === o ? "selected" : ""}>${esc(o)}</option>`).join("")}</select>
      </div>
      <div style="overflow-x:auto">
        <table>
          <thead><tr><th>النظام</th><th>المادة/البند</th><th>النص</th><th>الانطباق</th><th>الخطر</th><th>الإدارة المالكة</th><th>الروابط</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="7" class="muted">لا توجد مواد مطابقة</td></tr>'}</tbody>
        </table>
      </div>
      <p class="muted">عدد النتائج: ${arts.length}</p>
    </section>`;

  bindNav();
  $("#export-lib").onclick = async () => {
    try {
      toast("جاري تجهيز ملف Excel…");
      await downloadWorkbook(await db.allRegulations(), "مكتبة الالتزام.xlsx");
    } catch (err) {
      toast(err.message, true);
    }
  };
  $("#lf-search").addEventListener("input", (e) => { state.libFilters.search = e.target.value; renderLibrary(); });
  $("#lf-reg").onchange = (e) => { state.libFilters.regulation = e.target.value; renderLibrary(); };
  $("#lf-app").onchange = (e) => { state.libFilters.applicability = e.target.value; renderLibrary(); };
  $("#lf-risk").onchange = (e) => { state.libFilters.risk = e.target.value; renderLibrary(); };
  $("#lf-dept").onchange = (e) => { state.libFilters.department = e.target.value; renderLibrary(); };
  app.querySelectorAll("[data-goreg]").forEach((el) => {
    el.onclick = () => openRegulation(el.dataset.goreg);
  });
}

// ---------- تفاصيل النظام ----------
async function openRegulation(id) {
  state.view = "detail";
  state.openLinks = null;
  state.relatedCache = {};
  try {
    if (!state.regulations.length) await loadRegulations();
    state.current = await db.getRegulation(id);
    if (!state.current) throw new Error("النظام غير موجود");
    renderDetail();
  } catch (err) {
    toast(err.message, true);
  }
}

async function refreshDetail() {
  if (state.view !== "detail" || !state.current) return;
  state.current = await db.getRegulation(state.current.id);
  renderDetail();
}

function filteredArticles() {
  const f = state.filters;
  return state.current.articles.filter((a) => {
    if (f.applicability && a.applicability !== f.applicability) return false;
    if (f.risk && a.risk_level !== f.risk) return false;
    if (f.department && a.owning_department !== f.department) return false;
    if (f.search) {
      const q = f.search;
      if (!`${a.number} ${a.title} ${a.text}`.includes(q)) return false;
    }
    return true;
  });
}

function selectHtml(options, selected, attr) {
  return `<select ${attr}>${options
    .map((o) => `<option value="${esc(o)}" ${o === selected ? "selected" : ""}>${esc(o)}</option>`)
    .join("")}</select>`;
}

function riskBadge(level) {
  const cls = level === "عالي" ? "risk-high" : level === "منخفض" ? "risk-low" : "risk-med";
  return `<span class="badge ${cls}">${esc(level)}</span>`;
}

function linksPanelHtml(a) {
  const existing = (a.links || [])
    .map((l) => {
      const name = state.regulations.find((r) => r.id === l.regulation_id)?.name || l.regulation_id;
      return `<div class="row" style="margin:4px 0">
        <span class="badge status">🔗 ${esc(name)} — ${esc(l.number)}</span>
        <button class="danger small" data-unlink="${a.id}" data-target="${l.article_id}">فك الربط</button>
      </div>`;
    })
    .join("");

  const cache = state.relatedCache[a.id];
  let suggestions;
  if (!cache) {
    suggestions = '<p class="muted"><span class="spinner"></span> جاري البحث عن مواد مشابهة في بقية الأنظمة…</p>';
  } else if (!cache.length) {
    suggestions = '<p class="muted">لا توجد مواد مشابهة في الأنظمة الأخرى (أضف أنظمة أخرى ليعمل الربط).</p>';
  } else {
    suggestions = cache
      .map(
        (s) => `<div class="row" style="margin:4px 0">
          <span class="grow">
            <strong>${esc(s.regulation_name)}</strong> — ${esc(s.number)}: ${esc(s.title)}
            <span class="muted">(تشابه ${Math.round(s.score * 100)}٪ · ${esc(s.owning_department)} · خطر ${esc(s.risk_level)})</span>
          </span>
          <button class="small" data-dolink="${a.id}" data-reg="${s.regulation_id}" data-target="${s.article_id}">ربط</button>
        </div>`
      )
      .join("");
  }

  return `<div class="links-box">
    <strong>الروابط الحالية:</strong>
    ${existing || '<p class="muted">لا توجد روابط بعد.</p>'}
    <strong style="display:block;margin-top:10px">مواد مقترحة للربط من بقية الأنظمة:</strong>
    ${suggestions}
  </div>`;
}

function renderDetail() {
  const reg = state.current;
  const arts = filteredArticles();
  const counts = {
    total: reg.articles.length,
    applies: reg.articles.filter((a) => a.applicability === "تنطبق").length,
    high: reg.articles.filter((a) => a.risk_level === "عالي" && a.applicability === "تنطبق").length,
    review: reg.articles.filter((a) => a.needs_review).length,
  };

  const editable = isManager();
  const colCount = editable ? 7 : 6;
  const rows = arts
    .map((a) => {
      const linkBadges = (a.links || [])
        .map((l) => {
          const name = state.regulations.find((r) => r.id === l.regulation_id)?.name || l.regulation_id;
          return `<span class="badge status">🔗 ${esc(name)} — ${esc(l.number)}</span>`;
        })
        .join(" ");
      const cells = editable
        ? `
        <td>${selectHtml(state.meta.applicability, a.applicability, `data-edit="applicability" data-art="${a.id}"`)}</td>
        <td>${selectHtml(state.meta.risk_levels, a.risk_level, `data-edit="risk_level" data-art="${a.id}"`)}</td>
        <td>${selectHtml(state.meta.departments, a.owning_department, `data-edit="owning_department" data-art="${a.id}"`)}</td>`
        : `
        <td><span class="badge ${a.applicability === "تنطبق" ? "applies" : "not-applies"}">${esc(a.applicability)}</span></td>
        <td>${riskBadge(a.risk_level)}</td>
        <td>${esc(a.owning_department)}</td>`;
      const mainRow = `
      <tr>
        <td><strong>${esc(a.number)}</strong>${a.needs_review ? '<br/><span class="badge review">بحاجة لمراجعة</span>' : ""}</td>
        <td>
          <strong>${esc(a.title)}</strong>
          <div class="article-text muted">${esc(a.text)}</div>
          ${linkBadges ? `<div style="margin-top:4px">${linkBadges}</div>` : ""}
        </td>
        ${cells}
        <td class="muted" style="max-width:220px">${esc(a.rationale)}
          ${a.edited_by ? `<br/><em>آخر تعديل: ${esc(a.edited_by)}</em>` : ""}
        </td>
        ${editable ? `<td>
          <button class="secondary small" data-links="${a.id}" title="الربط مع مواد الأنظمة الأخرى">🔗 روابط${a.links?.length ? ` (${a.links.length})` : ""}</button>
          <button class="secondary small" data-review="${a.id}" title="تبديل حالة المراجعة">${a.needs_review ? "✔ تمت المراجعة" : "🔖 للمراجعة"}</button>
          <button class="danger small" data-delart="${a.id}">حذف</button>
        </td>` : ""}
      </tr>`;
      const panelRow =
        editable && state.openLinks === a.id
          ? `<tr class="links-panel"><td colspan="${colCount}">${linksPanelHtml(a)}</td></tr>`
          : "";
      return mainRow + panelRow;
    })
    .join("");

  app.innerHTML = `
    <p><span class="back-link" id="back">← العودة لقائمة الأنظمة</span></p>
    <section class="card">
      <div class="row" style="justify-content:space-between">
        <div>
          <h2>${esc(reg.name)}</h2>
          <p class="muted">${esc(reg.description || "")}</p>
        </div>
        <div class="row">
          ${statusBadge(reg)}
          <button class="secondary small" id="export-reg">⬇ تصدير Excel</button>
          ${editable && reg.status !== "processing" ? `<button class="secondary small" id="reanalyze">🔄 إعادة التحليل</button>` : ""}
        </div>
      </div>
      ${reg.analysis_error ? `<p class="muted">⚠️ ${esc(reg.analysis_error)}</p>` : ""}
      <div class="stats">
        <div class="stat"><div class="num">${counts.total}</div><div class="lbl">إجمالي المواد والبنود</div></div>
        <div class="stat"><div class="num">${counts.applies}</div><div class="lbl">تنطبق</div></div>
        <div class="stat"><div class="num">${counts.total - counts.applies}</div><div class="lbl">لا تنطبق</div></div>
        <div class="stat"><div class="num">${counts.high}</div><div class="lbl">خطر عالٍ (منطبقة)</div></div>
        <div class="stat"><div class="num">${counts.review}</div><div class="lbl">بحاجة لمراجعة</div></div>
      </div>
    </section>

    <section class="card">
      <div class="row filters">
        <input type="text" id="f-search" class="grow" placeholder="بحث في نص المواد…" value="${esc(state.filters.search)}" />
        <select id="f-app"><option value="">كل حالات الانطباق</option>${state.meta.applicability.map((o) => `<option ${state.filters.applicability === o ? "selected" : ""}>${esc(o)}</option>`).join("")}</select>
        <select id="f-risk"><option value="">كل درجات الخطر</option>${state.meta.risk_levels.map((o) => `<option ${state.filters.risk === o ? "selected" : ""}>${esc(o)}</option>`).join("")}</select>
        <select id="f-dept"><option value="">كل الإدارات</option>${state.meta.departments.map((o) => `<option ${state.filters.department === o ? "selected" : ""}>${esc(o)}</option>`).join("")}</select>
        ${editable ? '<button class="small" id="add-art">＋ إضافة مادة يدوياً</button>' : ""}
      </div>
      <div style="overflow-x:auto">
        <table>
          <thead>
            <tr>
              <th>المادة/البند</th><th>النص</th><th>الانطباق</th><th>درجة الخطر</th><th>الإدارة المالكة</th><th>المبرر</th>${editable ? "<th>إجراءات</th>" : ""}
            </tr>
          </thead>
          <tbody>${rows || `<tr><td colspan="7" class="muted">${reg.status === "processing" ? "جاري استخراج المواد وتصنيفها…" : "لا توجد مواد مطابقة"}</td></tr>`}</tbody>
        </table>
      </div>
    </section>`;

  $("#back").onclick = async () => {
    state.view = "list";
    await loadRegulations();
    renderList();
  };

  $("#export-reg").onclick = async () => {
    try {
      toast("جاري تجهيز ملف Excel…");
      const full = await db.getRegulation(reg.id);
      await downloadWorkbook([full], `${reg.name}.xlsx`, true);
    } catch (err) {
      toast(err.message, true);
    }
  };

  $("#f-search")?.addEventListener("input", (e) => {
    state.filters.search = e.target.value;
    renderDetail();
  });
  $("#f-app").onchange = (e) => { state.filters.applicability = e.target.value; renderDetail(); };
  $("#f-risk").onchange = (e) => { state.filters.risk = e.target.value; renderDetail(); };
  $("#f-dept").onchange = (e) => { state.filters.department = e.target.value; renderDetail(); };

  if (editable) {
    $("#reanalyze")?.addEventListener("click", async () => {
      if (!confirm("إعادة التحليل ستستبدل التصنيفات الحالية بما فيها تعديلاتك. متابعة؟")) return;
      runAnalysis(reg.id, reg.text, "");
      refreshDetail().catch(() => {});
    });

    $("#add-art")?.addEventListener("click", async () => {
      const number = prompt("رقم المادة/البند:");
      if (!number) return;
      const text = prompt("نص المادة:");
      if (!text) return;
      try {
        await db.addArticle(reg.id, {
          number,
          title: text.slice(0, 60),
          text,
          needs_review: true,
          edited_by: state.user.display_name,
        });
        await refreshDetail();
        toast("أُضيفت المادة");
      } catch (err) {
        toast(err.message, true);
      }
    });

    app.querySelectorAll("[data-edit]").forEach((sel) => {
      sel.onchange = async () => {
        try {
          await db.updateArticle(
            reg.id,
            sel.dataset.art,
            { [sel.dataset.edit]: sel.value },
            state.user.display_name
          );
          const art = state.current.articles.find((a) => a.id === sel.dataset.art);
          if (art) art[sel.dataset.edit] = sel.value;
          toast("تم حفظ التعديل");
          renderDetail();
        } catch (err) {
          toast(err.message, true);
          refreshDetail().catch(() => {});
        }
      };
    });

    app.querySelectorAll("[data-review]").forEach((btn) => {
      btn.onclick = async () => {
        const art = state.current.articles.find((a) => a.id === btn.dataset.review);
        try {
          await db.updateArticle(
            reg.id,
            art.id,
            { needs_review: !art.needs_review },
            state.user.display_name
          );
          art.needs_review = !art.needs_review;
          renderDetail();
        } catch (err) {
          toast(err.message, true);
        }
      };
    });

    app.querySelectorAll("[data-delart]").forEach((btn) => {
      btn.onclick = async () => {
        if (!confirm("حذف هذه المادة؟")) return;
        try {
          await db.deleteArticle(reg.id, btn.dataset.delart);
          state.current.articles = state.current.articles.filter((a) => a.id !== btn.dataset.delart);
          renderDetail();
          toast("حُذفت المادة");
        } catch (err) {
          toast(err.message, true);
        }
      };
    });

    // لوحة الربط مع مواد الأنظمة الأخرى
    app.querySelectorAll("[data-links]").forEach((btn) => {
      btn.onclick = async () => {
        const artId = btn.dataset.links;
        if (state.openLinks === artId) {
          state.openLinks = null;
          renderDetail();
          return;
        }
        state.openLinks = artId;
        renderDetail();
        if (!state.relatedCache[artId]) {
          try {
            const article = state.current.articles.find((a) => a.id === artId);
            const all = await db.allRegulations();
            state.relatedCache[artId] = findRelated(article, all, reg.id);
          } catch (err) {
            state.relatedCache[artId] = [];
            toast(err.message, true);
          }
          if (state.openLinks === artId) renderDetail();
        }
      };
    });

    app.querySelectorAll("[data-dolink]").forEach((btn) => {
      btn.onclick = async () => {
        try {
          const updated = await db.linkArticles(
            reg.id,
            btn.dataset.dolink,
            btn.dataset.reg,
            btn.dataset.target,
            state.user.display_name
          );
          const art = state.current.articles.find((a) => a.id === btn.dataset.dolink);
          if (art) art.links = updated.links;
          toast("تم الربط بين المادتين");
          renderDetail();
        } catch (err) {
          toast(err.message, true);
        }
      };
    });

    app.querySelectorAll("[data-unlink]").forEach((btn) => {
      btn.onclick = async () => {
        try {
          const updated = await db.unlinkArticles(reg.id, btn.dataset.unlink, btn.dataset.target);
          const art = state.current.articles.find((a) => a.id === btn.dataset.unlink);
          if (art) art.links = updated.links;
          toast("تم فك الربط");
          renderDetail();
        } catch (err) {
          toast(err.message, true);
        }
      };
    });
  }
}

// ---------- تشغيل ----------
function render() {
  if (!state.user) renderLogin();
  else if (state.view === "detail" && state.current) renderDetail();
  else if (state.view === "library") renderLibrary();
  else renderList();
}

function init() {
  if (!configReady) {
    renderSetup();
    return;
  }
  authApi.onAuth(async (user) => {
    const wasUser = state.user;
    state.user = user;
    state.authReady = true;
    renderAuth();
    if (!user) {
      state.view = "list";
      state.current = null;
      renderLogin();
      return;
    }
    try {
      await loadRegulations();
      state.view = "list";
      renderList();
      if (!wasUser) toast(`مرحباً، ${user.display_name}`);
    } catch (err) {
      toast(err.message, true);
      renderList();
    }
  });
}

init();
