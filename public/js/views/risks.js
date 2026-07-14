// سجل مخاطر الالتزام — تقييم 5×5 قبل الضوابط وبعدها، ضوابط، خطة معالجة، KRI
import { store, reload, deptName, userName, reqLabel, deptOptions, userOptions, reqOptions } from "../state.js";
import * as db from "../db.js";
import {
  $, esc, toast, modal, confirmBox, fld, txt, num, area, sel, dateInp, val,
  fmtDate, isoFromInput, levelBadge, statusBadgeFrom, emptyMsg,
} from "../ui.js";
import { riskLevel, riskPriority, RISK_STATUS, CONTROL_EFFECTIVENESS, RISK_SOURCES, LIKELIHOOD_SCALE, IMPACT_SCALE } from "../meta.js";
import { canEdit } from "../auth.js";
import { runAutoSync } from "../sync.js";

const ST_ROLE = { OPEN: "critical", IN_TREATMENT: "warning", TREATED: "good", ACCEPTED: "neutral", CLOSED: "good" };
const filters = { search: "", level: "", status: "", dept: "" };

export function renderRisks(el, nav, refresh) {
  const editable = canEdit(store.user);
  const rows = store.risks.filter((r) => {
    const lvl = riskLevel(r.residualLikelihood ?? r.likelihood, r.residualImpact ?? r.impact);
    if (filters.search && !`${r.code} ${r.title} ${r.description || ""}`.includes(filters.search)) return false;
    if (filters.level && lvl.key !== filters.level) return false;
    if (filters.status && r.status !== filters.status) return false;
    if (filters.dept && r.ownerDeptId !== filters.dept) return false;
    return true;
  });

  el.innerHTML = `
    <div class="page-head">
      <h1>⚠ سجل مخاطر الالتزام</h1>
      ${editable ? `<div class="row">
        <button class="secondary" id="sync-risks" title="تحديث سجل المخاطر آلياً: فحص الإضافات الحديثة في مكتبة الالتزام والأنظمة المحلَّلة وإنشاء المخاطر الناقصة وفق الغرامات والمخالفات">⟳ تحديث آلي</button>
        <button id="add-risk" title="إضافة خطر جديد يدوياً إلى السجل">＋ خطر جديد</button>
      </div>` : ""}
    </div>
    <section class="card">
      <div class="row filters">
        <input type="text" id="f-search" class="grow" placeholder="بحث…" value="${esc(filters.search)}" />
        ${sel("f-level", { CRITICAL: "حرج", HIGH: "عالٍ", MEDIUM: "متوسط", LOW: "منخفض" }, filters.level, { empty: "كل المستويات" })}
        ${sel("f-status", RISK_STATUS, filters.status, { empty: "كل الحالات" })}
        ${sel("f-dept", deptOptions(), filters.dept, { empty: "كل الإدارات" })}
      </div>
      <div style="overflow-x:auto">
        <table>
          <thead><tr>
            <th>الرقم</th><th>الخطر</th><th>المتطلب المرتبط</th><th>الكامن (قبل)</th><th>المتبقي (بعد)</th>
            <th>الأولوية</th><th>الإدارة</th><th>الاستحقاق</th><th>الحالة</th>
          </tr></thead>
          <tbody>
            ${rows
              .map((r) => {
                const pre = riskLevel(r.likelihood, r.impact);
                const post = riskLevel(r.residualLikelihood ?? r.likelihood, r.residualImpact ?? r.impact);
                const prio = riskPriority(post.score);
                return `<tr class="rowlink" data-open="${r.id}">
                  <td><strong>${esc(r.code)}</strong></td>
                  <td><strong>${esc(r.title)}</strong>
                    ${r.source ? ` <span class="chip chip-auto" data-tip="${esc(RISK_SOURCES[r.source] || "أُنشئ آلياً")}">🤖 آلي</span>` : ""}
                    ${r.penalty ? ` <span class="chip chip-penalty" data-tip="${esc(r.penalty)}">⚖ غرامة</span>` : ""}
                    <div class="muted clamp">${esc(r.description || "")}</div></td>
                  <td class="muted">${esc(reqLabel(r.requirementId))}</td>
                  <td>${levelBadge(pre.key, `${pre.label} (${pre.score})`)}</td>
                  <td>${levelBadge(post.key, `${post.label} (${post.score})`)}</td>
                  <td>${levelBadge(prio.key, prio.roman)}</td>
                  <td>${esc(deptName(r.ownerDeptId))}</td>
                  <td>${fmtDate(r.dueDate)}</td>
                  <td>${statusBadgeFrom(RISK_STATUS, r.status, ST_ROLE)}</td>
                </tr>`;
              })
              .join("") || `<tr><td colspan="9">${emptyMsg("لا توجد مخاطر مطابقة")}</td></tr>`}
          </tbody>
        </table>
      </div>
      <p class="muted">عدد النتائج: ${rows.length} من ${store.risks.length}</p>
    </section>`;

  const rerender = () => renderRisks(el, nav, refresh);
  $("#f-search", el).addEventListener("input", (e) => { filters.search = e.target.value; rerender(); });
  $("#f-level", el).onchange = (e) => { filters.level = e.target.value; rerender(); };
  $("#f-status", el).onchange = (e) => { filters.status = e.target.value; rerender(); };
  $("#f-dept", el).onchange = (e) => { filters.dept = e.target.value; rerender(); };
  $("#add-risk", el)?.addEventListener("click", () => openForm(null, rerender));
  $("#sync-risks", el)?.addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    toast("جاري التحديث الآلي لسجل المخاطر…");
    try {
      const s = await runAutoSync((msg) => toast(msg));
      toast(
        s.createdRisks || s.createdReqs
          ? `اكتمل التحديث الآلي: ${s.createdRisks} خطر جديد و${s.createdReqs} متطلب`
          : "سجل المخاطر محدّث — لا توجد إضافات جديدة"
      );
      rerender();
    } catch (err) {
      toast(err.message, true);
      btn.disabled = false;
    }
  });
  el.querySelectorAll("[data-open]").forEach((tr) =>
    tr.addEventListener("click", () => openDetail(tr.dataset.open, nav, rerender))
  );
}

function deptOptsHtml(selectedId) {
  return `<option value="">— الإدارة المعنية —</option>` +
    deptOptions().map((d) => `<option value="${esc(d.id)}" ${d.id === selectedId ? "selected" : ""}>${esc(d.name)}</option>`).join("");
}

function ctlRowHtml(c = {}) {
  return `<div class="row ctl-row" style="flex-wrap:wrap;gap:6px">
    <input type="text" class="grow ctl-name" value="${esc(c.name || "")}" placeholder="وصف الضابط الرقابي الحالي" />
    <select class="ctl-dept">${deptOptsHtml(c.deptId)}</select>
    <select class="ctl-eff">${CONTROL_EFFECTIVENESS.map((e) => `<option ${e === c.effectiveness ? "selected" : ""}>${e}</option>`).join("")}</select>
    <button class="danger small ctl-del">✕</button>
  </div>`;
}

function controlsEditor(controls) {
  return `
    <p class="muted" style="margin:2px 0">لكل ضابط: الوصف، الإدارة المعنية بتنفيذه، ثم تقييمه (ممتاز←غير مرضٍ).</p>
    <div id="ctl-list">${controls.map((c) => ctlRowHtml(c)).join("")}</div>
    <button class="secondary small" id="ctl-add">＋ إضافة ضابط</button>`;
}

function readControls(ov) {
  return [...ov.querySelectorAll(".ctl-row")]
    .map((row) => ({
      id: crypto.randomUUID(),
      name: row.querySelector(".ctl-name").value.trim(),
      deptId: row.querySelector(".ctl-dept").value || null,
      effectiveness: row.querySelector(".ctl-eff").value,
    }))
    .filter((c) => c.name);
}

function openForm(risk, done, presetReqId = null) {
  const isNew = !risk;
  const ov = modal(
    `
    <h2>${isNew ? "إضافة خطر جديد" : `تعديل ${esc(risk.code)}`}</h2>
    <div class="form-grid">
      ${fld("عنوان خطر عدم الالتزام *", txt("k-title", risk?.title))}
      ${fld("المتطلب المرتبط (من الموسوعة)", sel("k-req", reqOptions(), risk?.requirementId || presetReqId, { empty: "— بلا ربط —" }))}
      ${fld("مالك خطر عدم الالتزام", txt("k-riskowner", risk?.riskOwner, "الجهة/المنصب المسؤول"))}
      ${fld("الإدارة المالكة", sel("k-dept", deptOptions(), risk?.ownerDeptId, { empty: "— اختر —" }))}
    </div>
    <h3 class="form-sec">المرحلة الثانية — المخاطر الكامنة</h3>
    <div class="form-grid">
      ${fld("احتمالية وقوع الخطر (1-5)", num("k-lik", risk?.likelihood ?? 3))}
      ${fld("أثر الخطر (1-5)", num("k-imp", risk?.impact ?? 3))}
    </div>
    ${fld("وصف احتمالية وقوع الخطر", area("k-likdesc", risk?.likelihoodDesc, "", 2))}
    ${fld("وصف أثر الخطر", area("k-impdesc", risk?.impactDesc, "", 2))}
    <h3 class="form-sec">المرحلة الثالثة — تقييم الضوابط والخطر المتبقي</h3>
    ${fld("الضوابط الرقابية الحالية", controlsEditor(risk?.controls || []))}
    <div class="form-grid">
      ${fld("الاحتمالية بعد الضوابط (1-5)", num("k-rlik", risk?.residualLikelihood ?? 2))}
      ${fld("الأثر بعد الضوابط (1-5)", num("k-rimp", risk?.residualImpact ?? 3))}
    </div>
    <h3 class="form-sec">المرحلة الرابعة — المعالجة والمتابعة</h3>
    <div class="form-grid">
      ${fld("مالك المعالجة", sel("k-owner", userOptions(), risk?.treatmentOwnerId, { empty: "— اختر —" }))}
      ${fld("تاريخ الاستحقاق", dateInp("k-due", risk?.dueDate))}
      ${fld("الحالة", sel("k-status", RISK_STATUS, risk?.status || "OPEN"))}
    </div>
    ${fld("وصف الخطر (المخالفات والعقوبات)", area("k-desc", risk?.description, "", 3))}
    ${fld("سبب الخطر", area("k-cause", risk?.cause, "", 2))}
    ${fld("الخطة التصحيحية / المعالجة", area("k-plan", risk?.treatmentPlan, "", 3))}
    ${fld("مؤشر الخطر الرئيسي (KRI)", txt("k-kri", risk?.kri, "مثال: نسبة التراخيص المنتهية > 2%"))}
    <div class="row" style="margin-top:14px">
      <button id="k-save">حفظ</button>
      <button class="secondary" id="k-cancel">إلغاء</button>
    </div>`,
    { wide: true }
  );

  const bindCtl = () => {
    ov.querySelectorAll(".ctl-del").forEach((b) => (b.onclick = () => b.closest(".ctl-row").remove()));
  };
  bindCtl();
  $("#ctl-add", ov).onclick = () => {
    const wrap = document.createElement("div");
    wrap.innerHTML = ctlRowHtml();
    $("#ctl-list", ov).appendChild(wrap.firstElementChild);
    bindCtl();
  };

  $("#k-cancel", ov).onclick = () => ov.remove();
  $("#k-save", ov).onclick = async () => {
    const title = val("k-title", ov);
    if (!title) return toast("عنوان الخطر إلزامي", true);
    const data = {
      title,
      requirementId: val("k-req", ov) || null,
      riskOwner: val("k-riskowner", ov) || null,
      likelihood: Number(val("k-lik", ov)) || 3,
      impact: Number(val("k-imp", ov)) || 3,
      likelihoodDesc: val("k-likdesc", ov) || null,
      impactDesc: val("k-impdesc", ov) || null,
      residualLikelihood: Number(val("k-rlik", ov)) || 2,
      residualImpact: Number(val("k-rimp", ov)) || 3,
      ownerDeptId: val("k-dept", ov) || null,
      treatmentOwnerId: val("k-owner", ov) || null,
      dueDate: isoFromInput(val("k-due", ov)),
      status: val("k-status", ov),
      description: val("k-desc", ov),
      cause: val("k-cause", ov),
      treatmentPlan: val("k-plan", ov),
      kri: val("k-kri", ov),
      controls: readControls(ov),
    };
    try {
      const lvl = riskLevel(data.residualLikelihood, data.residualImpact);
      if (isNew) {
        const code = await db.nextCode("RSK");
        await db.setRow("risks", code, { ...data, code, createdAt: db.now(), updatedAt: db.now() });
        await db.audit("CREATE", "Risk", code, `إضافة خطر: ${code} — ${title}`);
        if (lvl.key === "CRITICAL" || lvl.key === "HIGH") {
          await db.notify({
            title: "خطر بمستوى مرتفع",
            message: `${code} — ${title} (${lvl.label})`,
            type: "RISK_HIGH",
            link: "risks",
            roleTarget: "COMPLIANCE_MANAGER",
          });
        }
      } else {
        const prevLvl = riskLevel(risk.residualLikelihood ?? risk.likelihood, risk.residualImpact ?? risk.impact);
        await db.updateRow("risks", risk.id, data);
        await db.audit("UPDATE", "Risk", risk.code, `تعديل الخطر ${risk.code}`);
        if (lvl.score > prevLvl.score && (lvl.key === "CRITICAL" || lvl.key === "HIGH")) {
          await db.notify({
            title: "ارتفاع مستوى خطر",
            message: `${risk.code} — ${title}: أصبح ${lvl.label}`,
            type: "RISK_HIGH",
            link: "risks",
            roleTarget: "COMPLIANCE_MANAGER",
          });
        }
      }
      await reload("risks");
      ov.remove();
      toast("تم الحفظ");
      done();
    } catch (err) {
      toast(err.message, true);
    }
  };
}

export function openDetail(id, nav, done) {
  const r = store.risks.find((x) => x.id === id);
  if (!r) return;
  const editable = canEdit(store.user);
  const pre = riskLevel(r.likelihood, r.impact);
  const post = riskLevel(r.residualLikelihood ?? r.likelihood, r.residualImpact ?? r.impact);
  const prio = riskPriority(post.score);
  const mons = store.monitoring.filter((x) => x.riskId === id);
  const finds = store.findings.filter((x) => x.riskId === id);

  const ov = modal(
    `
    <div class="row" style="justify-content:space-between">
      <h2>${esc(r.code)} — ${esc(r.title)}</h2>
      <span>${statusBadgeFrom(RISK_STATUS, r.status, ST_ROLE)}</span>
    </div>
    <div class="detail-grid">
      <div><span class="muted">المتطلب المرتبط (الموسوعة)</span><br/>${esc(reqLabel(r.requirementId))}</div>
      <div><span class="muted">مالك خطر عدم الالتزام</span><br/>${esc(r.riskOwner || "—")}</div>
      <div><span class="muted">الخطر الكامن (قبل)</span><br/>${levelBadge(pre.key, `${pre.label} — ${r.likelihood}×${r.impact}=${pre.score}`)}</div>
      <div><span class="muted">الخطر المتبقي (بعد)</span><br/>${levelBadge(post.key, `${post.label} — ${r.residualLikelihood ?? "؟"}×${r.residualImpact ?? "؟"}=${post.score}`)}</div>
      <div><span class="muted">الأولوية</span><br/>${levelBadge(prio.key, `${prio.roman} — ${prio.label}`)}</div>
      <div><span class="muted">الإدارة المالكة</span><br/>${esc(deptName(r.ownerDeptId))}</div>
      <div><span class="muted">مالك المعالجة</span><br/>${esc(userName(r.treatmentOwnerId))}</div>
      <div><span class="muted">الاستحقاق</span><br/>${fmtDate(r.dueDate)}</div>
    </div>
    ${r.description ? `<p><strong>خطر عدم الالتزام (المخالفات والعقوبات):</strong> ${esc(r.description)}</p>` : ""}
    ${r.impactDesc ? `<p><strong>وصف أثر الخطر:</strong> ${esc(r.impactDesc)}</p>` : ""}
    ${r.likelihoodDesc ? `<p><strong>وصف احتمالية وقوع الخطر:</strong> ${esc(r.likelihoodDesc)}</p>` : ""}
    ${r.cause ? `<p><strong>السبب:</strong> ${esc(r.cause)}</p>` : ""}
    ${r.treatmentPlan ? `<p><strong>الخطة التصحيحية / المعالجة:</strong> ${esc(r.treatmentPlan)}</p>` : ""}
    ${r.kri ? `<p><strong>KRI:</strong> ${esc(r.kri)}</p>` : ""}
    ${r.penalty ? `<p><strong>الغرامة / العقوبة النظامية:</strong><br/><span class="penalty-chip">⚖ ${esc(r.penalty)}</span></p>` : ""}
    ${r.source ? `<p class="muted">🤖 ${esc(RISK_SOURCES[r.source] || "أُنشئ آلياً")}${r.regulationId ? ` — من تحليل: ${esc(store.regulations.find((x) => x.id === r.regulationId)?.name || "نظام محذوف")}` : ""}</p>` : ""}
    <div class="card sub">
      <h3>الضوابط الرقابية الحالية (${(r.controls || []).length})</h3>
      ${(r.controls || []).map((c) => `<div class="row" style="margin:4px 0"><span class="grow">${esc(c.name)}</span>${c.deptId ? `<span class="chip">${esc(deptName(c.deptId))}</span>` : ""}<span class="chip">${esc(c.effectiveness || "—")}</span></div>`).join("") || '<p class="muted">لا توجد ضوابط مسجلة</p>'}
    </div>
    <div class="grid-2">
      <div class="card sub"><h3>🔍 أنشطة مراقبة مرتبطة (${mons.length})</h3>
        ${mons.map((m) => `<div class="link-item" data-nav="monitoring"><strong>${esc(m.code)}</strong> ${esc(m.name)}</div>`).join("") || '<p class="muted">لا يوجد</p>'}
      </div>
      <div class="card sub"><h3>🛠 ملاحظات مرتبطة (${finds.length})</h3>
        ${finds.map((f) => `<div class="link-item" data-nav="findings"><strong>${esc(f.code)}</strong> ${esc(f.title)}</div>`).join("") || '<p class="muted">لا يوجد</p>'}
      </div>
    </div>
    <div class="row" style="margin-top:14px">
      ${editable ? `<button id="k-edit">تعديل</button><button class="danger" id="k-del">حذف</button>` : ""}
      <button class="secondary" id="k-close">إغلاق</button>
    </div>`,
    { wide: true }
  );

  ov.querySelectorAll("[data-nav]").forEach((n) =>
    n.addEventListener("click", () => { ov.remove(); nav(n.dataset.nav); })
  );
  $("#k-close", ov).onclick = () => ov.remove();
  $("#k-edit", ov)?.addEventListener("click", () => { ov.remove(); openForm(r, done); });
  $("#k-del", ov)?.addEventListener("click", async () => {
    ov.remove();
    if (!(await confirmBox(`حذف الخطر ${r.code}؟`))) return;
    await db.removeRow("risks", r.id);
    await db.audit("DELETE", "Risk", r.code, `حذف الخطر ${r.code} — ${r.title}`);
    await reload("risks");
    toast("تم الحذف");
    done();
  });
}
