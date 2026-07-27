// برنامج مراقبة الالتزام — أنشطة رقابية مبنية على المخاطر والمتطلبات
// تسجيل النتيجة يولّد ملاحظة تلقائية عند عدم الالتزام
import { store, reload, deptName, userName, reqLabel, riskLabel, deptOptions, userOptions, riskOptions } from "../state.js";
import * as db from "../db.js";
import {
  $, esc, toast, modal, confirmBox, fld, txt, area, sel, dateInp, val,
  fmtDate, isoFromInput, levelBadge, statusBadgeFrom, emptyMsg, keepFocus, progressBar, distBar,
} from "../ui.js";
import { MON_TYPES, MON_FREQ, MON_STATUS, MON_RESULT, NC_LEVELS } from "../meta.js";
import { canEdit } from "../auth.js";

const ST_ROLE = { PLANNED: "neutral", IN_PROGRESS: "warning", COMPLETED: "good", CLOSED: "good" };
const RES_ROLE = { COMPLIANT: "good", PARTIAL: "warning", NON_COMPLIANT: "critical" };
const filters = { search: "", status: "", result: "", dept: "" };
const tabState = { tab: "list" }; // list | depts

export function renderMonitoring(el, nav, refresh) {
  const editable = canEdit(store.user);
  const rerender = () => renderMonitoring(el, nav, refresh);
  const head = `
    <div class="page-head">
      <h1>🔍 برنامج مراقبة الالتزام</h1>
      <div class="row">
        <div class="subtabs">
          <button class="subtab ${tabState.tab === "list" ? "active" : ""}" data-tab="list" title="عرض جميع الأنشطة الرقابية في قائمة">📋 القائمة</button>
          <button class="subtab ${tabState.tab === "depts" ? "active" : ""}" data-tab="depts" title="توزيع أنشطة المراقبة على الإدارات مع نسب الإنجاز والنتائج">🏢 حسب الإدارات</button>
        </div>
        ${editable ? `
          <button id="gen-mon" class="secondary" title="اختر إدارة ليولّد النظام نشاط مراقبة لكل متطلب من متطلباتها في المكتبة">⚙ توليد من متطلبات إدارة</button>
          <button id="add-mon" title="إضافة نشاط مراقبة جديد">＋ نشاط مراقبة جديد</button>` : ""}
      </div>
    </div>`;

  const bindCommon = () => {
    el.querySelectorAll("[data-tab]").forEach((b) => (b.onclick = () => { tabState.tab = b.dataset.tab; rerender(); }));
    $("#add-mon", el)?.addEventListener("click", () => openForm(null, rerender));
    $("#gen-mon", el)?.addEventListener("click", () => openGenerateForm(rerender));
  };

  if (tabState.tab === "depts") {
    el.innerHTML = head + renderByDepartments();
    bindCommon();
    el.querySelectorAll("[data-dept]").forEach((b) =>
      b.addEventListener("click", () => { filters.dept = b.dataset.dept; tabState.tab = "list"; rerender(); })
    );
    return;
  }

  const rows = store.monitoring.filter((m) => {
    if (filters.search && !`${m.code} ${m.name} ${m.scope || ""}`.includes(filters.search)) return false;
    if (filters.status && m.status !== filters.status) return false;
    if (filters.result && m.result !== filters.result) return false;
    if (filters.dept && m.targetDeptId !== filters.dept) return false;
    return true;
  });

  el.innerHTML = head + `
    <section class="card">
      <div class="row filters">
        <input type="text" id="f-search" class="grow" placeholder="بحث…" value="${esc(filters.search)}" />
        ${sel("f-status", MON_STATUS, filters.status, { empty: "كل الحالات" })}
        ${sel("f-result", MON_RESULT, filters.result, { empty: "كل النتائج" })}
        ${sel("f-dept", deptOptions(), filters.dept, { empty: "كل الإدارات" })}
      </div>
      <div style="overflow-x:auto">
        <table>
          <thead><tr>
            <th>الرقم</th><th>النشاط</th><th>المتطلب / الخطر</th><th>النوع</th><th>التكرار</th>
            <th>الإدارة المستهدفة</th><th>الفترة</th><th>النتيجة</th><th>الحالة</th>
          </tr></thead>
          <tbody>
            ${rows
              .map(
                (m) => `<tr class="rowlink" data-open="${m.id}">
                  <td><strong>${esc(m.code)}</strong></td>
                  <td><strong>${esc(m.name)}</strong><div class="muted clamp">${esc(m.scope || "")}</div></td>
                  <td class="muted">${esc(reqLabel(m.requirementId))}${m.riskId ? `<br/>⚠ ${esc(riskLabel(m.riskId))}` : ""}</td>
                  <td>${esc(MON_TYPES[m.type] || m.type || "—")}</td>
                  <td>${esc(MON_FREQ[m.frequency] || m.frequency || "—")}</td>
                  <td>${esc(deptName(m.targetDeptId))}</td>
                  <td class="muted">${fmtDate(m.startDate)} ← ${fmtDate(m.endDate)}</td>
                  <td>${m.result ? statusBadgeFrom(MON_RESULT, m.result, RES_ROLE) : '<span class="muted">—</span>'}</td>
                  <td>${statusBadgeFrom(MON_STATUS, m.status, ST_ROLE)}</td>
                </tr>`
              )
              .join("") || `<tr><td colspan="9">${emptyMsg("لا توجد أنشطة مطابقة")}</td></tr>`}
          </tbody>
        </table>
      </div>
      <p class="muted">عدد النتائج: ${rows.length} من ${store.monitoring.length}${filters.dept ? ` · <span class="link-item" id="clear-dept" style="display:inline;cursor:pointer;color:var(--primary-dark)">إلغاء تصفية الإدارة ✕</span>` : ""}</p>
    </section>`;

  bindCommon();
  $("#f-search", el).addEventListener("input", (e) => { filters.search = e.target.value; keepFocus(rerender); });
  $("#f-status", el).onchange = (e) => { filters.status = e.target.value; rerender(); };
  $("#f-result", el).onchange = (e) => { filters.result = e.target.value; rerender(); };
  $("#f-dept", el).onchange = (e) => { filters.dept = e.target.value; rerender(); };
  $("#clear-dept", el)?.addEventListener("click", () => { filters.dept = ""; rerender(); });
  el.querySelectorAll("[data-open]").forEach((tr) =>
    tr.addEventListener("click", () => openDetail(tr.dataset.open, nav, rerender))
  );
}

// عرض المراقبة موزّعة على الإدارات: بطاقة لكل إدارة بعدد الأنشطة ونسبة الإنجاز وتوزيع النتائج
function renderByDepartments() {
  const groups = store.departments
    .map((d) => ({ dept: d, items: store.monitoring.filter((m) => m.targetDeptId === d.id) }))
    .filter((g) => g.items.length);
  const unassigned = store.monitoring.filter((m) => !m.targetDeptId || !store.departments.some((d) => d.id === m.targetDeptId));
  if (unassigned.length) groups.push({ dept: { id: "", name: "غير محددة الإدارة" }, items: unassigned });

  if (!groups.length) return `<section class="card">${emptyMsg("لا توجد أنشطة مراقبة بعد")}</section>`;

  return `<div class="report-grid">${groups
    .map((g) => {
      const done = g.items.filter((m) => ["COMPLETED", "CLOSED"].includes(m.status)).length;
      const pct = Math.round((done / g.items.length) * 100);
      const res = { COMPLIANT: 0, PARTIAL: 0, NON_COMPLIANT: 0 };
      for (const m of g.items) if (m.result && res[m.result] !== undefined) res[m.result]++;
      const nc = res.NON_COMPLIANT;
      return `<section class="card" style="cursor:pointer" data-dept="${g.dept.id}" title="عرض أنشطة ${esc(g.dept.name)} في القائمة">
        <div class="row" style="justify-content:space-between">
          <h2 style="font-size:1rem">🏢 ${esc(g.dept.name)}</h2>
          ${nc ? `<span class="lvl lvl-critical"><span class="dot"></span>${nc} عدم التزام</span>` : done === g.items.length ? '<span class="lvl lvl-good"><span class="dot"></span>مكتملة</span>' : ""}
        </div>
        <div class="stats" style="margin:8px 0">
          <div class="stat"><div class="num">${g.items.length}</div><div class="lbl">نشاط</div></div>
          <div class="stat"><div class="num">${pct}%</div><div class="lbl">الإنجاز</div><div class="sub">${done}/${g.items.length}</div></div>
        </div>
        ${progressBar(pct)}
        ${distBar([
          { label: "ملتزم", count: res.COMPLIANT, role: "good" },
          { label: "جزئي", count: res.PARTIAL, role: "warning" },
          { label: "غير ملتزم", count: res.NON_COMPLIANT, role: "critical" },
        ])}
      </section>`;
    })
    .join("")}</div>`;
}

// خيارات المتطلبات المرتبطة بإدارة: متطلبات الإدارة المالكة أولاً، ثم البقية للمرونة
function reqOptionsForDept(deptId, selected) {
  const own = store.requirements.filter((r) => r.ownerDeptId === deptId && r.status !== "CANCELLED");
  const opt = (r) => `<option value="${esc(r.id)}" ${r.id === selected ? "selected" : ""}>${esc(r.code)} — ${esc(r.title)}</option>`;
  if (!deptId) {
    return `<option value="">— اختر الإدارة أولاً —</option>` +
      store.requirements.map((r) => opt(r)).join("");
  }
  const others = store.requirements.filter((r) => r.ownerDeptId !== deptId && r.status !== "CANCELLED");
  return `<option value="">— بلا ربط —</option>` +
    (own.length ? `<optgroup label="متطلبات هذه الإدارة (${own.length})">${own.map(opt).join("")}</optgroup>` : "") +
    (others.length ? `<optgroup label="متطلبات أخرى">${others.map(opt).join("")}</optgroup>` : "");
}

// توليد نشاط مراقبة لكل متطلب في إدارة مختارة — «اختر الإدارة والنظام يجلب متطلباتها»
function openGenerateForm(done) {
  const ov = modal(
    `
    <h2>⚙ توليد أنشطة مراقبة من متطلبات إدارة</h2>
    <p class="muted">اختر الإدارة المستهدفة، وسيُنشئ النظام نشاط مراقبة لكل متطلب مرتبط بها في مكتبة الالتزام (لا يُنشأ نشاط لمتطلب له نشاط قائم لنفس الإدارة).</p>
    <div class="form-grid">
      ${fld("الإدارة المستهدفة *", sel("g-dept", deptOptions(), "", { empty: "— اختر —" }))}
      ${fld("نوع الفحص", sel("g-type", MON_TYPES, "DESK"))}
      ${fld("التكرار", sel("g-freq", MON_FREQ, "QUARTERLY"))}
      ${fld("مسؤول الفحص", sel("g-assignee", userOptions(), "", { empty: "— اختر —" }))}
    </div>
    <p class="muted" id="g-hint">—</p>
    <div class="row" style="margin-top:14px">
      <button id="g-save">توليد الأنشطة</button>
      <button class="secondary" id="g-cancel">إلغاء</button>
    </div>`,
    { wide: true }
  );
  const deptReqs = () => {
    const d = val("g-dept", ov);
    return d ? store.requirements.filter((r) => r.ownerDeptId === d && r.status !== "CANCELLED") : [];
  };
  const refreshHint = () => {
    const d = val("g-dept", ov);
    const reqs = deptReqs();
    const already = store.monitoring.filter((m) => m.targetDeptId === d).map((m) => m.requirementId);
    const toCreate = reqs.filter((r) => !already.includes(r.id));
    $("#g-hint", ov).textContent = !d
      ? "اختر الإدارة لعرض عدد المتطلبات."
      : reqs.length
        ? `لإدارة «${deptName(d)}» ${reqs.length} متطلب — سيُنشأ ${toCreate.length} نشاط جديد (${reqs.length - toCreate.length} لها أنشطة سابقاً).`
        : `لا توجد متطلبات مسجلة لإدارة «${deptName(d)}» في المكتبة.`;
  };
  $("#g-dept", ov).onchange = refreshHint;

  $("#g-cancel", ov).onclick = () => ov.remove();
  $("#g-save", ov).onclick = async () => {
    const deptId = val("g-dept", ov);
    if (!deptId) return toast("اختر الإدارة المستهدفة", true);
    const already = store.monitoring.filter((m) => m.targetDeptId === deptId).map((m) => m.requirementId);
    const reqs = deptReqs().filter((r) => !already.includes(r.id));
    if (!reqs.length) return toast("لا توجد متطلبات جديدة لهذه الإدارة تحتاج نشاط مراقبة", true);
    const type = val("g-type", ov), freq = val("g-freq", ov), assignee = val("g-assignee", ov) || null;
    const btn = $("#g-save", ov);
    btn.disabled = true;
    try {
      for (const r of reqs) {
        const code = await db.nextCode("MON");
        await db.setRow("monitoring", code, {
          code,
          name: `مراقبة الالتزام بـ ${r.code} — ${r.title}`.slice(0, 120),
          requirementId: r.id,
          riskId: null,
          type, frequency: freq,
          targetDeptId: deptId,
          assigneeId: assignee,
          startDate: null, endDate: null,
          status: "PLANNED",
          scope: `فحص التزام الإدارة بالمتطلب ${r.code}`,
          result: null, notes: null, nonComplianceLevel: null,
          recommendations: null, correctionPlan: null,
          createdAt: db.now(), updatedAt: db.now(),
        });
      }
      await db.audit("CREATE", "Monitoring", null, `توليد ${reqs.length} نشاط مراقبة من متطلبات ${deptName(deptId)}`);
      await reload("monitoring");
      ov.remove();
      toast(`أُنشئ ${reqs.length} نشاط مراقبة لإدارة ${deptName(deptId)}`);
      done();
    } catch (err) {
      btn.disabled = false;
      toast(err.message, true);
    }
  };
}

function openForm(mon, done) {
  const isNew = !mon;
  const ov = modal(
    `
    <h2>${isNew ? "إضافة نشاط مراقبة" : `تعديل ${esc(mon.code)}`}</h2>
    <div class="form-grid">
      ${fld("اسم نشاط المراقبة *", txt("m-name", mon?.name))}
      ${fld("الإدارة المستهدفة", sel("m-dept", deptOptions(), mon?.targetDeptId, { empty: "— اختر —" }))}
      ${fld("المتطلب المرتبط", `<select id="m-req">${reqOptionsForDept(mon?.targetDeptId || "", mon?.requirementId)}</select>`)}
      ${fld("الخطر المرتبط", sel("m-risk", riskOptions(), mon?.riskId, { empty: "— بلا ربط —" }))}
      ${fld("نوع الفحص", sel("m-type", MON_TYPES, mon?.type || "DESK"))}
      ${fld("التكرار", sel("m-freq", MON_FREQ, mon?.frequency || "QUARTERLY"))}
      ${fld("مسؤول الفحص", sel("m-assignee", userOptions(), mon?.assigneeId, { empty: "— اختر —" }))}
      ${fld("تاريخ البداية", dateInp("m-start", mon?.startDate))}
      ${fld("تاريخ النهاية", dateInp("m-end", mon?.endDate))}
      ${fld("الحالة", sel("m-status", MON_STATUS, mon?.status || "PLANNED"))}
    </div>
    <p class="muted" id="m-req-hint">اختر الإدارة المستهدفة ليجلب النظام متطلباتها من مكتبة الالتزام تلقائياً.</p>
    ${fld("نطاق الفحص", area("m-scope", mon?.scope, "", 2))}
    <div class="row" style="margin-top:14px">
      <button id="m-save">حفظ</button>
      <button class="secondary" id="m-cancel">إلغاء</button>
    </div>`,
    { wide: true }
  );

  // عند تغيير الإدارة: إعادة تعبئة قائمة المتطلبات بمتطلبات تلك الإدارة، واقتراح اسم النشاط
  const updateReqs = () => {
    const deptId = val("m-dept", ov);
    $("#m-req", ov).innerHTML = reqOptionsForDept(deptId, "");
    const own = store.requirements.filter((r) => r.ownerDeptId === deptId && r.status !== "CANCELLED");
    const hint = $("#m-req-hint", ov);
    if (deptId) {
      hint.textContent = own.length
        ? `جُلب ${own.length} متطلب من مكتبة الالتزام لإدارة «${deptName(deptId)}» — اختر المتطلب المستهدف.`
        : `لا توجد متطلبات مسجلة لإدارة «${deptName(deptId)}» في المكتبة — يمكنك الربط بمتطلب آخر أو تركه.`;
    } else {
      hint.textContent = "اختر الإدارة المستهدفة ليجلب النظام متطلباتها من مكتبة الالتزام تلقائياً.";
    }
    if (isNew && !val("m-name", ov) && deptId) {
      $("#m-name", ov).value = `مراقبة التزام ${deptName(deptId)}`;
    }
  };
  $("#m-dept", ov).onchange = updateReqs;

  $("#m-cancel", ov).onclick = () => ov.remove();
  $("#m-save", ov).onclick = async () => {
    const name = val("m-name", ov);
    if (!name) return toast("اسم النشاط إلزامي", true);
    const data = {
      name,
      requirementId: val("m-req", ov) || null,
      riskId: val("m-risk", ov) || null,
      type: val("m-type", ov),
      frequency: val("m-freq", ov),
      targetDeptId: val("m-dept", ov) || null,
      assigneeId: val("m-assignee", ov) || null,
      startDate: isoFromInput(val("m-start", ov)),
      endDate: isoFromInput(val("m-end", ov)),
      status: val("m-status", ov),
      scope: val("m-scope", ov),
    };
    try {
      if (isNew) {
        const code = await db.nextCode("MON");
        await db.setRow("monitoring", code, {
          ...data, code,
          result: null, notes: null, nonComplianceLevel: null,
          recommendations: null, correctionPlan: null,
          createdAt: db.now(), updatedAt: db.now(),
        });
        await db.audit("CREATE", "Monitoring", code, `إضافة نشاط مراقبة: ${code} — ${name}`);
      } else {
        await db.updateRow("monitoring", mon.id, data);
        await db.audit("UPDATE", "Monitoring", mon.code, `تعديل نشاط المراقبة ${mon.code}`);
      }
      await reload("monitoring");
      ov.remove();
      toast("تم الحفظ");
      done();
    } catch (err) {
      toast(err.message, true);
    }
  };
}

// تسجيل نتيجة الفحص — مع توليد ملاحظة تلقائية عند عدم الالتزام
function openResultForm(m, done) {
  const ov = modal(`
    <h2>تسجيل نتيجة الفحص — ${esc(m.code)}</h2>
    <div class="form-grid">
      ${fld("نتيجة الفحص *", sel("r-result", MON_RESULT, m.result || "COMPLIANT"))}
      ${fld("مستوى عدم الالتزام", sel("r-nc", NC_LEVELS, m.nonComplianceLevel || "LOW"))}
    </div>
    ${fld("الملاحظات", area("r-notes", m.notes, "", 3))}
    ${fld("التوصيات", area("r-rec", m.recommendations, "", 2))}
    ${fld("خطة التصحيح المقترحة", area("r-corr", m.correctionPlan, "", 2))}
    <label class="chk"><input type="checkbox" id="r-mkfinding" checked /> إنشاء ملاحظة في سجل الملاحظات عند عدم الالتزام (كلي أو جزئي)</label>
    <div class="row" style="margin-top:14px">
      <button id="r-save">حفظ النتيجة وإغلاق النشاط</button>
      <button class="secondary" id="r-cancel">إلغاء</button>
    </div>`);
  $("#r-cancel", ov).onclick = () => ov.remove();
  $("#r-save", ov).onclick = async () => {
    const result = val("r-result", ov);
    const nc = result === "COMPLIANT" ? null : val("r-nc", ov);
    const data = {
      result,
      nonComplianceLevel: nc,
      notes: val("r-notes", ov),
      recommendations: val("r-rec", ov),
      correctionPlan: val("r-corr", ov) || null,
      status: "COMPLETED",
    };
    try {
      await db.updateRow("monitoring", m.id, data);
      await db.audit("REVIEW", "Monitoring", m.code, `تسجيل نتيجة ${MON_RESULT[result]} للنشاط ${m.code}`);
      if (result !== "COMPLIANT" && $("#r-mkfinding", ov).checked) {
        const code = await db.nextCode("FND");
        const severity = nc === "CRITICAL" ? "CRITICAL" : nc === "HIGH" ? "HIGH" : nc === "MEDIUM" ? "MEDIUM" : "LOW";
        await db.setRow("findings", code, {
          code,
          title: `عدم التزام في: ${m.name}`,
          description: data.notes || null,
          source: "MONITORING",
          severity,
          requirementId: m.requirementId || null,
          riskId: m.riskId || null,
          monitoringId: m.id,
          assessmentId: null,
          departmentId: m.targetDeptId || null,
          status: "OPEN",
          dueDate: new Date(Date.now() + 30 * 86400000).toISOString(),
          actions: data.correctionPlan
            ? [{
                id: crypto.randomUUID(),
                description: data.correctionPlan,
                ownerId: m.assigneeId || null,
                departmentId: m.targetDeptId || null,
                dueDate: new Date(Date.now() + 30 * 86400000).toISOString(),
                status: "OPEN",
                progress: 0,
                closureNotes: null,
                createdAt: db.now(),
              }]
            : [],
          createdAt: db.now(),
          updatedAt: db.now(),
        });
        await db.audit("CREATE", "Finding", code, `ملاحظة تلقائية من نشاط المراقبة ${m.code}`);
        if (severity === "CRITICAL" || severity === "HIGH") {
          await db.notify({
            title: "ملاحظة عالية الخطورة",
            message: `${code} — عدم التزام في: ${m.name}`,
            type: "FINDING_HIGH",
            link: "findings",
            roleTarget: "COMPLIANCE_MANAGER",
          });
        }
        await reload("findings");
      }
      await reload("monitoring");
      ov.remove();
      toast("سُجلت النتيجة");
      done();
    } catch (err) {
      toast(err.message, true);
    }
  };
}

export function openDetail(id, nav, done) {
  const m = store.monitoring.find((x) => x.id === id);
  if (!m) return;
  const editable = canEdit(store.user);
  const finds = store.findings.filter((f) => f.monitoringId === id);

  const ov = modal(
    `
    <div class="row" style="justify-content:space-between">
      <h2>${esc(m.code)} — ${esc(m.name)}</h2>
      <span>${statusBadgeFrom(MON_STATUS, m.status, ST_ROLE)}</span>
    </div>
    <div class="detail-grid">
      <div><span class="muted">المتطلب</span><br/>${esc(reqLabel(m.requirementId))}</div>
      <div><span class="muted">الخطر</span><br/>${esc(riskLabel(m.riskId))}</div>
      <div><span class="muted">النوع</span><br/>${esc(MON_TYPES[m.type] || "—")}</div>
      <div><span class="muted">التكرار</span><br/>${esc(MON_FREQ[m.frequency] || "—")}</div>
      <div><span class="muted">الإدارة المستهدفة</span><br/>${esc(deptName(m.targetDeptId))}</div>
      <div><span class="muted">مسؤول الفحص</span><br/>${esc(userName(m.assigneeId))}</div>
      <div><span class="muted">الفترة</span><br/>${fmtDate(m.startDate)} ← ${fmtDate(m.endDate)}</div>
      <div><span class="muted">النتيجة</span><br/>${m.result ? statusBadgeFrom(MON_RESULT, m.result, RES_ROLE) : "—"}
        ${m.nonComplianceLevel ? levelBadge(m.nonComplianceLevel, `عدم التزام ${NC_LEVELS[m.nonComplianceLevel]}`) : ""}</div>
    </div>
    ${m.scope ? `<p><strong>النطاق:</strong> ${esc(m.scope)}</p>` : ""}
    ${m.notes ? `<p><strong>الملاحظات:</strong> ${esc(m.notes)}</p>` : ""}
    ${m.recommendations ? `<p><strong>التوصيات:</strong> ${esc(m.recommendations)}</p>` : ""}
    ${m.correctionPlan ? `<p><strong>خطة التصحيح:</strong> ${esc(m.correctionPlan)}</p>` : ""}
    ${finds.length ? `<div class="card sub"><h3>🛠 ملاحظات ناتجة (${finds.length})</h3>${finds.map((f) => `<div class="link-item" data-nav="findings"><strong>${esc(f.code)}</strong> ${esc(f.title)}</div>`).join("")}</div>` : ""}
    <div class="row" style="margin-top:14px">
      ${editable ? `
        <button id="m-result">📝 تسجيل النتيجة</button>
        <button class="secondary" id="m-edit">تعديل</button>
        ${m.status === "COMPLETED" ? '<button class="secondary" id="m-close-act">إقفال النشاط</button>' : ""}
        <button class="danger" id="m-del">حذف</button>` : ""}
      <button class="secondary" id="m-close">إغلاق</button>
    </div>`,
    { wide: true }
  );

  ov.querySelectorAll("[data-nav]").forEach((n) =>
    n.addEventListener("click", () => { ov.remove(); nav(n.dataset.nav); })
  );
  $("#m-close", ov).onclick = () => ov.remove();
  $("#m-edit", ov)?.addEventListener("click", () => { ov.remove(); openForm(m, done); });
  $("#m-result", ov)?.addEventListener("click", () => { ov.remove(); openResultForm(m, done); });
  $("#m-close-act", ov)?.addEventListener("click", async () => {
    await db.updateRow("monitoring", m.id, { status: "CLOSED" });
    await db.audit("APPROVE", "Monitoring", m.code, `إقفال نشاط المراقبة ${m.code}`);
    await reload("monitoring");
    ov.remove();
    toast("أُقفل النشاط");
    done();
  });
  $("#m-del", ov)?.addEventListener("click", async () => {
    ov.remove();
    if (!(await confirmBox(`حذف نشاط المراقبة ${m.code}؟`))) return;
    await db.removeRow("monitoring", m.id);
    await db.audit("DELETE", "Monitoring", m.code, `حذف نشاط المراقبة ${m.code}`);
    await reload("monitoring");
    toast("تم الحذف");
    done();
  });
}
