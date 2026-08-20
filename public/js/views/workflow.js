// مسارات الاعتماد — محرك سير عمل قابل للتهيئة (مسودة → مراجعة → اعتماد → مغلق)
// مع SLA لكل مرحلة وتصعيد آلي، مبني على نموذج المهام ومربوط بالسجلات القائمة.
import { store, reload, userName, userOptions, reqOptions } from "../state.js";
import * as db from "../db.js";
import {
  $, esc, toast, modal, confirmBox, fld, txt, area, sel, val,
  fmtDate, fmtDateTime, statusBadgeFrom, emptyMsg, keepFocus,
} from "../ui.js";
import { WF_PIPELINE, WF_STAGES, WF_STAGE_ROLE, WF_PRIORITY, WF_LINK_TYPES } from "../meta.js";
import {
  loadTemplates, saveTemplates, createWorkflow, transition, slaStatus, actionVerb, stageRole,
} from "../workflow.js";
import { canEdit, canApprove } from "../auth.js";

const filters = { search: "", stage: "", priority: "", mine: false };
const LINK_VIEW = { requirement: "library", finding: "findings", regChange: "regchange", planItem: "plan", meeting: "meetings" };

// خيارات السجلات القابلة للربط حسب النوع
function linkOptions(type) {
  switch (type) {
    case "requirement": return reqOptions();
    case "finding": return store.findings.map((f) => ({ id: f.id, name: `${f.code} — ${f.title}` }));
    case "regChange": return store.regChanges.map((c) => ({ id: c.id, name: `${c.code} — ${c.title}` }));
    case "planItem": return store.planItems.map((p) => ({ id: p.id, name: p.title }));
    case "meeting": return store.meetings.map((m) => ({ id: m.code, name: `${m.code} — ${m.title}` }));
    default: return [];
  }
}

export function renderWorkflow(el, nav, refresh) {
  const editable = canEdit(store.user);
  const uid = store.user.uid;
  const all = store.workflows;
  const rows = all.filter((w) => {
    if (filters.search && !`${w.code} ${w.title}`.includes(filters.search)) return false;
    if (filters.stage && w.stage !== filters.stage) return false;
    if (filters.priority && w.priority !== filters.priority) return false;
    if (filters.mine && w.reviewerId !== uid && w.approverId !== uid && w.createdById !== uid) return false;
    return true;
  });

  const active = all.filter((w) => !["CLOSED", "REJECTED"].includes(w.stage));
  const overdue = active.filter((w) => slaStatus(w).daysLeft !== null && slaStatus(w).daysLeft < 0);
  const closed = all.filter((w) => w.stage === "CLOSED");

  const col = (stage) => {
    const items = rows.filter((w) => w.stage === stage).sort((a, b) => (a.dueAt || "").localeCompare(b.dueAt || ""));
    const shown = stage === "CLOSED" ? items.slice(0, 15) : items;
    return `<div class="wf-col">
      <div class="wf-col-head lvl lvl-${WF_STAGE_ROLE[stage]}"><span class="dot"></span>${esc(WF_STAGES[stage])} <strong>(${items.length})</strong></div>
      ${shown.map((w) => {
        const s = slaStatus(w);
        return `<div class="wf-card" data-open="${esc(w.id)}">
          <div class="row" style="justify-content:space-between;gap:6px">
            <strong>${esc(w.code)}</strong>
            ${w.priority && w.priority !== "NORMAL" ? `<span class="chip">${esc(WF_PRIORITY[w.priority])}</span>` : ""}
          </div>
          <div class="wf-card-title">${esc(w.title)}</div>
          ${!["CLOSED", "REJECTED"].includes(stage) ? `<span class="lvl lvl-${s.role}" style="font-size:0.74rem"><span class="dot"></span>${esc(s.label)}</span>` : `<span class="muted" style="font-size:0.74rem">${fmtDate(w.closedAt)}</span>`}
          ${w.approverId ? `<div class="muted" style="font-size:0.74rem">معتمِد: ${esc(userName(w.approverId))}</div>` : ""}
        </div>`;
      }).join("") || '<p class="muted" style="font-size:0.8rem;padding:6px">—</p>'}
    </div>`;
  };

  el.innerHTML = `
    <div class="page-head">
      <h1>✅ مسارات الاعتماد</h1>
      <div class="row">
        ${editable ? '<button class="secondary" id="wf-templates" title="تهيئة قوالب المسار واتفاقيات مستوى الخدمة (SLA)">⚙ القوالب و SLA</button>' : ""}
        ${editable ? '<button id="wf-add" title="بدء مسار اعتماد جديد">＋ مسار جديد</button>' : ""}
      </div>
    </div>
    <p class="muted">مسار الاعتماد: مسودة → مراجعة → اعتماد → مغلق. لكل مرحلة اتفاقية مستوى خدمة (SLA)، ويُصعَّد المسار آلياً عند التجاوز.</p>
    <div class="stats">
      <div class="stat"><div class="num">${active.length}</div><div class="lbl">مسارات نشطة</div></div>
      <div class="stat"><div class="num">${overdue.length}</div><div class="lbl">متجاوزة SLA</div></div>
      <div class="stat"><div class="num">${closed.length}</div><div class="lbl">معتمدة (مغلقة)</div></div>
      <div class="stat"><div class="num">${all.length}</div><div class="lbl">الإجمالي</div></div>
    </div>
    <section class="card">
      <div class="row filters">
        <input type="text" id="f-search" class="grow" placeholder="بحث بالرمز أو العنوان…" value="${esc(filters.search)}" />
        ${sel("f-stage", WF_STAGES, filters.stage, { empty: "كل المراحل" })}
        ${sel("f-prio", WF_PRIORITY, filters.priority, { empty: "كل الأولويات" })}
        <label class="chk-line"><input type="checkbox" id="f-mine" ${filters.mine ? "checked" : ""} /> المسندة إليّ</label>
      </div>
      <div class="wf-board">${WF_PIPELINE.map(col).join("")}</div>
    </section>`;

  const rerender = () => renderWorkflow(el, nav, refresh);
  $("#f-search", el).addEventListener("input", (e) => { filters.search = e.target.value; keepFocus(rerender); });
  $("#f-stage", el).onchange = (e) => { filters.stage = e.target.value; rerender(); };
  $("#f-prio", el).onchange = (e) => { filters.priority = e.target.value; rerender(); };
  $("#f-mine", el).onchange = (e) => { filters.mine = e.target.checked; rerender(); };
  $("#wf-add", el)?.addEventListener("click", () => openForm(null, rerender));
  $("#wf-templates", el)?.addEventListener("click", () => openTemplates(rerender));
  el.querySelectorAll("[data-open]").forEach((c) => c.addEventListener("click", () => openDetail(c.dataset.open, nav, rerender)));
}

async function openForm(w, done) {
  const isNew = !w;
  const templates = await loadTemplates();
  const tplOpts = templates.map((t) => ({ id: t.id, name: t.name }));
  const ov = modal(`
    <h2>${isNew ? "بدء مسار اعتماد" : `تعديل ${esc(w.code)}`}</h2>
    <div class="form-grid">
      ${fld("عنوان المسار *", txt("w-title", w?.title, "مثال: اعتماد سياسة مكافحة غسل الأموال"))}
      ${fld("القالب", sel("w-tpl", tplOpts, w?.templateId || templates[0]?.id))}
      ${fld("الأولوية", sel("w-prio", WF_PRIORITY, w?.priority || "NORMAL"))}
      ${fld("المراجع", sel("w-reviewer", userOptions(), w?.reviewerId, { empty: "— اختر —" }))}
      ${fld("المعتمِد", sel("w-approver", userOptions(), w?.approverId, { empty: "— اختر —" }))}
      ${fld("نوع الربط", sel("w-linktype", WF_LINK_TYPES, w?.linkType || "none"))}
      ${fld("السجل المرتبط", `<select id="w-linkid"></select>`)}
    </div>
    ${fld("الوصف", area("w-desc", w?.description, "", 3))}
    <div class="row" style="margin-top:14px">
      <button id="w-save">${isNew ? "بدء المسار" : "حفظ"}</button>
      <button class="secondary" id="w-cancel">إلغاء</button>
    </div>`, { wide: true });

  const linkSel = $("#w-linkid", ov);
  const fillLinks = (type, selected) => {
    const opts = linkOptions(type);
    linkSel.innerHTML = `<option value="">${type === "none" ? "— بلا ربط —" : "— اختر —"}</option>` +
      opts.map((o) => `<option value="${esc(o.id)}" ${o.id === selected ? "selected" : ""}>${esc(o.name)}</option>`).join("");
    linkSel.disabled = type === "none";
  };
  fillLinks(w?.linkType || "none", w?.linkId);
  $("#w-linktype", ov).onchange = (e) => fillLinks(e.target.value, null);

  $("#w-cancel", ov).onclick = () => ov.remove();
  $("#w-save", ov).onclick = async () => {
    const title = val("w-title", ov);
    if (!title) return toast("عنوان المسار إلزامي", true);
    const linkType = val("w-linktype", ov);
    const linkId = val("w-linkid", ov) || null;
    const linkOpt = linkOptions(linkType).find((o) => o.id === linkId);
    const fields = {
      title,
      description: val("w-desc", ov),
      priority: val("w-prio", ov),
      reviewerId: val("w-reviewer", ov) || null,
      approverId: val("w-approver", ov) || null,
      linkType,
      linkId,
      linkLabel: linkOpt?.name || "",
      linkView: LINK_VIEW[linkType] || null,
    };
    try {
      if (isNew) {
        const template = templates.find((t) => t.id === val("w-tpl", ov)) || templates[0];
        await createWorkflow(fields, template, store.user);
      } else {
        await db.updateRow("workflows", w.id, fields);
        await db.audit("UPDATE", "Workflow", w.code, `تعديل مسار الاعتماد ${w.code}`);
      }
      await reload("workflows");
      ov.remove();
      toast("تم الحفظ");
      done();
    } catch (err) {
      toast(err.message, true);
    }
  };
}

function pipelineBar(stage) {
  if (stage === "REJECTED") return `<div class="wf-pipe"><span class="wf-step lvl-critical">مُعاد / مرفوض</span></div>`;
  const idx = WF_PIPELINE.indexOf(stage);
  return `<div class="wf-pipe">${WF_PIPELINE.map((s, i) => `<span class="wf-step ${i <= idx ? "wf-step-on lvl-" + WF_STAGE_ROLE[s] : ""}">${esc(WF_STAGES[s])}</span>`).join('<span class="wf-arrow">←</span>')}</div>`;
}

export function openDetail(id, nav, done) {
  const w = store.workflows.find((x) => x.id === id);
  if (!w) return;
  const editable = canEdit(store.user);
  const approver = canApprove(store.user);
  const s = slaStatus(w);

  // الإجراءات المتاحة حسب المرحلة والدور
  const actions = [];
  if (w.stage === "DRAFT" && editable) actions.push({ id: "submit", cls: "", label: "📤 إرسال للمراجعة" });
  if (w.stage === "REVIEW" && editable) { actions.push({ id: "review", cls: "", label: "✔ اعتماد المراجعة" }); actions.push({ id: "reject", cls: "danger", label: "↩ إعادة للمسودة" }); }
  if (w.stage === "APPROVE" && approver) { actions.push({ id: "approve", cls: "", label: "✅ اعتماد نهائي" }); actions.push({ id: "reject", cls: "danger", label: "↩ إعادة للمسودة" }); }
  if (["CLOSED", "REJECTED"].includes(w.stage) && approver) actions.push({ id: "reopen", cls: "secondary", label: "↺ إعادة الفتح" });

  const ov = modal(`
    <div class="row" style="justify-content:space-between">
      <h2>✅ ${esc(w.code)} — ${esc(w.title)}</h2>
      <span>${statusBadgeFrom(WF_STAGES, w.stage, WF_STAGE_ROLE)}</span>
    </div>
    ${pipelineBar(w.stage)}
    <div class="detail-grid">
      <div><span class="muted">القالب</span><br/>${esc(w.templateName || "—")}</div>
      <div><span class="muted">الأولوية</span><br/>${esc(WF_PRIORITY[w.priority] || "عادية")}</div>
      <div><span class="muted">حالة SLA</span><br/><span class="lvl lvl-${s.role}"><span class="dot"></span>${esc(s.label)}</span></div>
      <div><span class="muted">استحقاق المرحلة</span><br/>${fmtDateTime(w.dueAt)}</div>
      <div><span class="muted">المراجع</span><br/>${esc(userName(w.reviewerId))}</div>
      <div><span class="muted">المعتمِد</span><br/>${esc(userName(w.approverId))}</div>
    </div>
    ${w.description ? `<p class="pre-line"><strong>الوصف:</strong> ${esc(w.description)}</p>` : ""}
    ${w.linkType && w.linkType !== "none" ? `<p><strong>مرتبط بـ:</strong> <span class="link-item" id="w-golink">${esc(WF_LINK_TYPES[w.linkType])}: ${esc(w.linkLabel || "—")}</span></p>` : ""}

    <h3 style="margin:12px 0 6px">سجل الحركة</h3>
    <div class="wf-history">
      ${(w.history || []).slice().reverse().map((h) => `<div class="wf-hist">
        <span class="lvl lvl-${WF_STAGE_ROLE[h.stage] || "neutral"}"><span class="dot"></span>${esc(WF_STAGES[h.stage] || h.stage)}</span>
        <span>${esc(h.action === "create" ? "إنشاء" : actionVerb(h.action))}</span>
        <span class="muted">${esc(h.byName || "—")} · ${fmtDateTime(h.at)}</span>
        ${h.note ? `<div class="muted pre-line">📝 ${esc(h.note)}</div>` : ""}
      </div>`).join("")}
    </div>

    ${actions.length ? fld("ملاحظة (اختيارية) على الإجراء", area("w-note", "", "سبب الإعادة أو ملاحظة الاعتماد…", 2)) : ""}
    <div class="row" style="margin-top:14px">
      ${actions.map((a) => `<button class="${a.cls}" data-act="${a.id}">${a.label}</button>`).join("")}
      ${editable && !["CLOSED", "REJECTED"].includes(w.stage) ? '<button class="secondary" id="w-edit">تعديل</button>' : ""}
      ${approver ? '<button class="danger" id="w-del">حذف</button>' : ""}
      <button class="secondary" id="w-close">إغلاق</button>
    </div>`, { wide: true });

  $("#w-close", ov).onclick = () => ov.remove();
  $("#w-golink", ov)?.addEventListener("click", () => { if (w.linkView) { ov.remove(); nav(w.linkView); } });
  $("#w-edit", ov)?.addEventListener("click", () => { ov.remove(); openForm(w, done); });
  ov.querySelectorAll("[data-act]").forEach((b) => b.addEventListener("click", async () => {
    const action = b.dataset.act;
    const note = val("w-note", ov);
    if (action === "reject" && !note) return toast("يُفضّل ذكر سبب الإعادة", true);
    try {
      const patch = transition(w, action, store.user, note);
      await db.updateRow("workflows", w.id, patch);
      await db.audit(action === "approve" ? "APPROVE" : "UPDATE", "Workflow", w.code, `${actionVerb(action)} — المسار ${w.code}${note ? ` (${note})` : ""}`);
      // إشعار المعنيّ بالمرحلة التالية
      const targetId = patch.stage === "REVIEW" ? w.reviewerId : patch.stage === "APPROVE" ? w.approverId : null;
      await db.notify({
        title: `مسار اعتماد: ${WF_STAGES[patch.stage]}`,
        message: `${w.code} — ${w.title}: ${actionVerb(action)}`,
        type: "WF_MOVE", link: "workflow",
        roleTarget: targetId ? null : "COMPLIANCE_MANAGER", userId: targetId || null,
      });
      await reload("workflows", "notifications");
      ov.remove();
      toast(actionVerb(action));
      done();
    } catch (err) {
      toast(err.message, true);
    }
  }));
  $("#w-del", ov)?.addEventListener("click", async () => {
    ov.remove();
    if (!(await confirmBox(`حذف مسار الاعتماد ${w.code}؟`))) return;
    await db.removeRow("workflows", w.id);
    await db.audit("DELETE", "Workflow", w.code, `حذف مسار الاعتماد ${w.code}`);
    await reload("workflows");
    toast("تم الحذف");
    done();
  });
}

// ---------- تهيئة القوالب و SLA ----------
async function openTemplates(done) {
  const templates = await loadTemplates();
  const ov = modal(`
    <h2>⚙ قوالب المسار واتفاقيات مستوى الخدمة</h2>
    <p class="muted">لكل قالب مدّة SLA (بالأيام) لكل مرحلة: المسودة والمراجعة والاعتماد. تُطبَّق على المسارات الجديدة.</p>
    <div id="tpl-list"></div>
    <div class="row" style="margin-top:10px">
      <button class="secondary" id="tpl-add" title="إضافة قالب جديد">＋ قالب</button>
    </div>
    <div class="row" style="margin-top:14px">
      <button id="tpl-save">حفظ</button>
      <button class="secondary" id="tpl-cancel">إلغاء</button>
    </div>`, { wide: true });

  let list = templates.map((t) => ({ ...t, slaDays: { ...t.slaDays } }));
  const draw = () => {
    $("#tpl-list", ov).innerHTML = `<div style="overflow-x:auto"><table>
      <thead><tr><th>اسم القالب</th><th>مسودة</th><th>مراجعة</th><th>اعتماد</th><th></th></tr></thead>
      <tbody>${list.map((t, i) => `<tr>
        <td><input type="text" data-f="name" data-i="${i}" value="${esc(t.name)}" style="min-width:180px" /></td>
        <td><input type="number" data-f="DRAFT" data-i="${i}" min="0" max="90" value="${esc(t.slaDays.DRAFT ?? 0)}" style="width:70px" /></td>
        <td><input type="number" data-f="REVIEW" data-i="${i}" min="0" max="90" value="${esc(t.slaDays.REVIEW ?? 0)}" style="width:70px" /></td>
        <td><input type="number" data-f="APPROVE" data-i="${i}" min="0" max="90" value="${esc(t.slaDays.APPROVE ?? 0)}" style="width:70px" /></td>
        <td><button class="danger small" data-del="${i}" title="حذف القالب">✕</button></td>
      </tr>`).join("")}</tbody></table></div>`;
    ov.querySelectorAll("[data-del]").forEach((b) => b.onclick = () => { list.splice(Number(b.dataset.del), 1); draw(); });
  };
  const sync = () => ov.querySelectorAll("#tpl-list [data-f]").forEach((inp) => {
    const i = Number(inp.dataset.i), f = inp.dataset.f;
    if (f === "name") list[i].name = inp.value;
    else list[i].slaDays[f] = Number(inp.value) || 0;
  });
  draw();
  $("#tpl-add", ov).onclick = () => { sync(); list.push({ id: "tpl_" + Date.now().toString(36), name: "قالب جديد", slaDays: { DRAFT: 5, REVIEW: 5, APPROVE: 3 } }); draw(); };
  $("#tpl-cancel", ov).onclick = () => ov.remove();
  $("#tpl-save", ov).onclick = async () => {
    sync();
    list = list.filter((t) => t.name.trim());
    if (!list.length) return toast("أضف قالباً واحداً على الأقل", true);
    try {
      await saveTemplates(list);
      await db.audit("UPDATE", "Config", "workflowTemplates", "تعديل قوالب مسار الاعتماد و SLA");
      ov.remove();
      toast("حُفظت القوالب");
      done();
    } catch (err) {
      toast(err.message, true);
    }
  };
}
