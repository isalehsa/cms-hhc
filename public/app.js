// واجهة نظام إدارة الالتزام — عرض الأنظمة وتحليلها وتحرير المواد
const state = {
  user: null,
  token: localStorage.getItem("chcc_token") || null,
  meta: { departments: [], risk_levels: [], applicability: [], ai_enabled: false },
  view: "list", // list | detail
  regulations: [],
  current: null,
  filters: { applicability: "", risk: "", department: "", search: "" },
  pollTimer: null,
};

const $ = (sel) => document.querySelector(sel);
const app = $("#app");

// ---------- أدوات ----------
function toast(msg, isError = false) {
  const el = $("#toast");
  el.textContent = msg;
  el.className = `toast${isError ? " error" : ""}`;
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.add("hidden"), 4000);
}

async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const res = await fetch(path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `خطأ (${res.status})`);
  return data;
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

const isManager = () => state.user?.role === "compliance_manager";

// ---------- المصادقة ----------
function renderAuth() {
  const el = $("#auth-area");
  if (state.user) {
    el.innerHTML = `
      <span class="user-chip">👤 ${esc(state.user.display_name)}</span>
      <button class="secondary small" id="logout-btn">تسجيل خروج</button>`;
    $("#logout-btn").onclick = async () => {
      await api("/api/logout", { method: "POST" }).catch(() => {});
      state.user = null;
      state.token = null;
      localStorage.removeItem("chcc_token");
      renderAuth();
      render();
    };
  } else {
    el.innerHTML = `
      <input type="text" id="login-user" placeholder="اسم المستخدم" style="width:130px" />
      <input type="password" id="login-pass" placeholder="كلمة المرور" style="width:130px" />
      <button class="small" id="login-btn">دخول</button>`;
    $("#login-btn").onclick = doLogin;
    $("#login-pass").addEventListener("keydown", (e) => e.key === "Enter" && doLogin());
  }
}

async function doLogin() {
  try {
    const session = await api("/api/login", {
      method: "POST",
      body: JSON.stringify({
        username: $("#login-user").value.trim(),
        password: $("#login-pass").value,
      }),
    });
    state.user = session;
    state.token = session.token;
    localStorage.setItem("chcc_token", session.token);
    renderAuth();
    render();
    toast(`مرحباً، ${session.display_name}`);
  } catch (err) {
    toast(err.message, true);
  }
}

// ---------- قائمة الأنظمة ----------
async function loadRegulations() {
  const data = await api("/api/regulations");
  state.regulations = data.regulations;
}

function statusBadge(reg) {
  if (reg.status === "processing") return `<span class="spinner"></span> <span class="muted">جاري التحليل…</span>`;
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
        ${state.meta.ai_enabled ? "" : "⚠️ التحليل بالذكاء الاصطناعي غير مفعّل حالياً (لم يُضبط مفتاح API) — سيُستخدم التقسيم النصي المبدئي وتبقى جميع البنود بانتظار مراجعتك."}</p>
      <label>اسم النظام / اللائحة *</label>
      <input type="text" id="reg-name" placeholder="مثال: لائحة حوكمة البيانات" />
      <label>وصف مختصر</label>
      <input type="text" id="reg-desc" placeholder="اختياري" />
      <label>سياق المنشأة (يساعد الذكاء الاصطناعي على تحديد الانطباق والإدارة المالكة)</label>
      <input type="text" id="reg-context" placeholder="مثال: شركة قطاع صحي خاص، 500 موظف، تتعامل مع بيانات مرضى" />
      <label>النص الكامل للنظام / اللائحة *</label>
      <textarea id="reg-text" placeholder="الصق هنا النص الكامل بجميع مواده وبنوده…"></textarea>
      <div style="margin-top:12px">
        <button id="add-reg-btn">إضافة وتحليل</button>
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
    ${addForm}
    <section class="card">
      <h2>الأنظمة واللوائح المسجلة (${state.regulations.length})</h2>
      ${rows || '<p class="muted">لا توجد أنظمة مسجلة بعد.</p>'}
    </section>`;

  if (isManager()) {
    $("#add-reg-btn")?.addEventListener("click", addRegulation);
    app.querySelectorAll("[data-del]").forEach((btn) => {
      btn.onclick = async () => {
        if (!confirm("حذف هذا النظام وجميع مواده؟")) return;
        try {
          await api(`/api/regulations/${btn.dataset.del}`, { method: "DELETE" });
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

  // متابعة الأنظمة قيد التحليل
  if (state.regulations.some((r) => r.status === "processing")) schedulePoll(refreshList);
}

async function refreshList() {
  await loadRegulations();
  if (state.view === "list") renderList();
}

async function addRegulation() {
  const name = $("#reg-name").value.trim();
  const text = $("#reg-text").value.trim();
  if (!name || !text) return toast("اسم النظام ونصه الكامل حقلان إلزاميان", true);
  const btn = $("#add-reg-btn");
  btn.disabled = true;
  try {
    const reg = await api("/api/regulations", {
      method: "POST",
      body: JSON.stringify({
        name,
        description: $("#reg-desc").value.trim(),
        org_context: $("#reg-context").value.trim(),
        text,
      }),
    });
    toast("تمت الإضافة — بدأ تحليل المواد والبنود");
    await openRegulation(reg.id);
  } catch (err) {
    toast(err.message, true);
    btn.disabled = false;
  }
}

// ---------- تفاصيل النظام ----------
function schedulePoll(fn) {
  clearTimeout(state.pollTimer);
  state.pollTimer = setTimeout(fn, 3000);
}

async function openRegulation(id) {
  clearTimeout(state.pollTimer);
  state.view = "detail";
  state.current = await api(`/api/regulations/${id}`);
  renderDetail();
}

async function refreshDetail() {
  if (state.view !== "detail" || !state.current) return;
  state.current = await api(`/api/regulations/${state.current.id}`);
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
  const rows = arts
    .map((a) => {
      const cells = editable
        ? `
        <td>${selectHtml(state.meta.applicability, a.applicability, `data-edit="applicability" data-art="${a.id}"`)}</td>
        <td>${selectHtml(state.meta.risk_levels, a.risk_level, `data-edit="risk_level" data-art="${a.id}"`)}</td>
        <td>${selectHtml(state.meta.departments, a.owning_department, `data-edit="owning_department" data-art="${a.id}"`)}</td>`
        : `
        <td><span class="badge ${a.applicability === "تنطبق" ? "applies" : "not-applies"}">${esc(a.applicability)}</span></td>
        <td>${riskBadge(a.risk_level)}</td>
        <td>${esc(a.owning_department)}</td>`;
      return `
      <tr>
        <td><strong>${esc(a.number)}</strong>${a.needs_review ? '<br/><span class="badge review">بحاجة لمراجعة</span>' : ""}</td>
        <td>
          <strong>${esc(a.title)}</strong>
          <div class="article-text muted">${esc(a.text)}</div>
        </td>
        ${cells}
        <td class="muted" style="max-width:220px">${esc(a.rationale)}
          ${a.edited_by ? `<br/><em>آخر تعديل: ${esc(a.edited_by)}</em>` : ""}
        </td>
        ${editable ? `<td>
          <button class="secondary small" data-review="${a.id}" title="تبديل حالة المراجعة">${a.needs_review ? "✔ تمت المراجعة" : "🔖 للمراجعة"}</button>
          <button class="danger small" data-delart="${a.id}">حذف</button>
        </td>` : ""}
      </tr>`;
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
    clearTimeout(state.pollTimer);
    state.view = "list";
    await loadRegulations();
    renderList();
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
      try {
        await api(`/api/regulations/${reg.id}/reanalyze`, { method: "POST", body: "{}" });
        toast("بدأت إعادة التحليل");
        refreshDetail();
      } catch (err) {
        toast(err.message, true);
      }
    });

    $("#add-art")?.addEventListener("click", async () => {
      const number = prompt("رقم المادة/البند:");
      if (!number) return;
      const text = prompt("نص المادة:");
      if (!text) return;
      try {
        await api(`/api/regulations/${reg.id}/articles`, {
          method: "POST",
          body: JSON.stringify({ number, title: text.slice(0, 60), text, needs_review: true }),
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
          await api(`/api/regulations/${reg.id}/articles/${sel.dataset.art}`, {
            method: "PATCH",
            body: JSON.stringify({ [sel.dataset.edit]: sel.value }),
          });
          const art = state.current.articles.find((a) => a.id === sel.dataset.art);
          if (art) art[sel.dataset.edit] = sel.value;
          toast("تم حفظ التعديل");
          renderDetail();
        } catch (err) {
          toast(err.message, true);
          refreshDetail();
        }
      };
    });

    app.querySelectorAll("[data-review]").forEach((btn) => {
      btn.onclick = async () => {
        const art = state.current.articles.find((a) => a.id === btn.dataset.review);
        try {
          await api(`/api/regulations/${reg.id}/articles/${art.id}`, {
            method: "PATCH",
            body: JSON.stringify({ needs_review: !art.needs_review }),
          });
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
          await api(`/api/regulations/${reg.id}/articles/${btn.dataset.delart}`, { method: "DELETE" });
          state.current.articles = state.current.articles.filter((a) => a.id !== btn.dataset.delart);
          renderDetail();
          toast("حُذفت المادة");
        } catch (err) {
          toast(err.message, true);
        }
      };
    });
  }

  if (reg.status === "processing") schedulePoll(refreshDetail);
}

// ---------- تشغيل ----------
function render() {
  if (state.view === "detail" && state.current) renderDetail();
  else renderList();
}

async function init() {
  try {
    state.meta = await api("/api/meta");
    if (state.token) {
      const me = await api("/api/me");
      state.user = me.user;
      if (!state.user) {
        state.token = null;
        localStorage.removeItem("chcc_token");
      }
    }
    await loadRegulations();
  } catch (err) {
    toast(err.message, true);
  }
  renderAuth();
  renderList();
}

init();
