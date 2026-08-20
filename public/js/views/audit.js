// التدقيق الداخلي والأدلة — الخطة السنوية للتدقيق، مهام التدقيق وأوراق العمل،
// ربط الأدلة والملاحظات (على نموذج CAPA القائم)، وتقرير تدقيق معتمد قابل للطباعة.
import { store, reload, deptName, userName, deptOptions, userOptions } from "../state.js";
import * as db from "../db.js";
import {
  $, esc, toast, modal, confirmBox, fld, txt, area, sel, dateInp, num, val,
  fmtDate, isoFromInput, statusBadgeFrom, emptyMsg, keepFocus, progressBar,
} from "../ui.js";
import {
  AUDIT_TYPES, AUDIT_STATUS, AUDIT_STATUS_ROLE, AUDIT_OPINION, AUDIT_OPINION_ROLE,
  WP_RESULT, WP_RESULT_ROLE, AUDIT_REPORT_STATUS, FND_SEVERITY,
} from "../meta.js";
import { canEdit, canApprove } from "../auth.js";

const filters = { year: new Date().getFullYear(), type: "", status: "", dept: "" };
const TYPE_ICON = { COMPLIANCE: "⚖", INTERNAL: "🔍", PROCESS: "⚙", FOLLOWUP: "🔁", SPECIAL: "★" };

const auditFindings = (id) => store.findings.filter((f) => f.auditId === id);
const wpCount = (a) => (a.workingPapers || []).length;

export function renderAudit(el, nav, refresh) {
  const editable = canEdit(store.user);
  const all = store.audits;
  const years = [...new Set(all.map((a) => a.year).filter(Boolean))].sort((a, b) => b - a);
  if (!years.includes(filters.year) && years.length) filters.year = years[0];

  const rows = all.filter((a) => {
    if (filters.year && a.year !== filters.year) return false;
    if (filters.type && a.type !== filters.type) return false;
    if (filters.status && a.status !== filters.status) return false;
    if (filters.dept && a.departmentId !== filters.dept) return false;
    return true;
  }).sort((a, b) => (a.plannedStart || "").localeCompare(b.plannedStart || ""));

  const byStatus = (s) => all.filter((a) => a.year === filters.year && a.status === s).length;
  const completed = byStatus("COMPLETED");
  const totalYear = all.filter((a) => a.year === filters.year).length;

  el.innerHTML = `
    <div class="page-head">
      <h1>🕵 التدقيق الداخلي</h1>
      ${editable ? '<button id="add-aud" title="إضافة مهمة تدقيق إلى الخطة">＋ مهمة تدقيق</button>' : ""}
    </div>
    <p class="muted">الخطة السنوية للتدقيق، وأوراق العمل والأدلة، والملاحظات المرتبطة، وتقرير التدقيق المعتمد.</p>
    <div class="stats">
      <div class="stat"><div class="num">${totalYear}</div><div class="lbl">مهام خطة ${filters.year}</div></div>
      <div class="stat"><div class="num">${byStatus("FIELDWORK") + byStatus("REPORTING")}</div><div class="lbl">قيد التنفيذ</div></div>
      <div class="stat"><div class="num">${completed}</div><div class="lbl">مكتملة ومعتمدة</div>
        <div class="sub">${totalYear ? Math.round((completed / totalYear) * 100) : 0}% إنجاز الخطة</div></div>
      <div class="stat"><div class="num">${store.findings.filter((f) => f.source === "AUDIT").length}</div><div class="lbl">ملاحظات تدقيق</div></div>
    </div>
    <section class="card">
      <div class="row filters">
        ${sel("f-year", years.length ? years.map((y) => ({ id: String(y), name: String(y) })) : [{ id: String(filters.year), name: String(filters.year) }], String(filters.year))}
        ${sel("f-type", AUDIT_TYPES, filters.type, { empty: "كل الأنواع" })}
        ${sel("f-status", AUDIT_STATUS, filters.status, { empty: "كل الحالات" })}
        ${sel("f-dept", deptOptions(), filters.dept, { empty: "كل الجهات" })}
      </div>
      <div style="overflow-x:auto">
        <table>
          <thead><tr>
            <th>الرقم</th><th>النوع</th><th>عنوان المهمة</th><th>الجهة المدقَّقة</th><th>الفترة</th>
            <th>أوراق عمل</th><th>ملاحظات</th><th>الحالة</th>
          </tr></thead>
          <tbody>
            ${rows.map((a) => `<tr class="rowlink" data-open="${esc(a.id)}">
              <td><strong>${esc(a.code)}</strong></td>
              <td>${TYPE_ICON[a.type] || "🔍"} ${esc(AUDIT_TYPES[a.type] || a.type)}</td>
              <td><strong>${esc(a.title)}</strong></td>
              <td>${esc(a.departmentId ? deptName(a.departmentId) : "—")}</td>
              <td class="muted">${fmtDate(a.plannedStart)} → ${fmtDate(a.plannedEnd)}</td>
              <td>${wpCount(a)}</td>
              <td>${auditFindings(a.id).length}</td>
              <td>${statusBadgeFrom(AUDIT_STATUS, a.status, AUDIT_STATUS_ROLE)}</td>
            </tr>`).join("") || `<tr><td colspan="8">${emptyMsg("لا توجد مهام تدقيق مطابقة")}</td></tr>`}
          </tbody>
        </table>
      </div>
      <p class="muted">عدد النتائج: ${rows.length}</p>
    </section>`;

  const rerender = () => renderAudit(el, nav, refresh);
  $("#f-year", el).onchange = (e) => { filters.year = Number(e.target.value); rerender(); };
  $("#f-type", el).onchange = (e) => { filters.type = e.target.value; rerender(); };
  $("#f-status", el).onchange = (e) => { filters.status = e.target.value; rerender(); };
  $("#f-dept", el).onchange = (e) => { filters.dept = e.target.value; rerender(); };
  $("#add-aud", el)?.addEventListener("click", () => openForm(null, rerender));
  el.querySelectorAll("[data-open]").forEach((tr) => tr.addEventListener("click", () => openDetail(tr.dataset.open, nav, rerender)));
}

function openForm(a, done) {
  const isNew = !a;
  const ov = modal(`
    <h2>${isNew ? "إضافة مهمة تدقيق" : `تعديل ${esc(a.code)}`}</h2>
    <div class="form-grid">
      ${fld("عنوان المهمة *", txt("a-title", a?.title, "مثال: تدقيق الالتزام بلائحة حماية البيانات"))}
      ${fld("النوع", sel("a-type", AUDIT_TYPES, a?.type || "COMPLIANCE"))}
      ${fld("الجهة المدقَّقة", sel("a-dept", deptOptions(), a?.departmentId, { empty: "— اختر —" }))}
      ${fld("رئيس فريق التدقيق", sel("a-lead", userOptions(), a?.leadAuditorId, { empty: "— اختر —" }))}
      ${fld("سنة الخطة", num("a-year", a?.year ?? new Date().getFullYear(), 2020, 2100))}
      ${fld("بداية مخطّطة", dateInp("a-start", a?.plannedStart))}
      ${fld("نهاية مخطّطة", dateInp("a-end", a?.plannedEnd))}
      ${fld("الحالة", sel("a-status", AUDIT_STATUS, a?.status || "PLANNED"))}
    </div>
    ${fld("النطاق", area("a-scope", a?.scope, "نطاق التدقيق والعمليات المشمولة…", 2))}
    ${fld("الأهداف", area("a-obj", a?.objective, "أهداف المهمة…", 2))}
    <div class="row" style="margin-top:14px">
      <button id="a-save">حفظ</button>
      <button class="secondary" id="a-cancel">إلغاء</button>
    </div>`, { wide: true });
  $("#a-cancel", ov).onclick = () => ov.remove();
  $("#a-save", ov).onclick = async () => {
    const title = val("a-title", ov);
    if (!title) return toast("عنوان المهمة إلزامي", true);
    const data = {
      title,
      type: val("a-type", ov),
      departmentId: val("a-dept", ov) || null,
      leadAuditorId: val("a-lead", ov) || null,
      year: Number(val("a-year", ov)) || new Date().getFullYear(),
      plannedStart: isoFromInput(val("a-start", ov)),
      plannedEnd: isoFromInput(val("a-end", ov)),
      status: val("a-status", ov),
      scope: val("a-scope", ov),
      objective: val("a-obj", ov),
    };
    try {
      if (isNew) {
        const code = await db.nextCode("AUD");
        await db.setRow("audits", code, { ...data, code, workingPapers: [], report: null, createdById: store.user.uid, createdAt: db.now(), updatedAt: db.now() });
        await db.audit("CREATE", "Audit", code, `إضافة مهمة تدقيق: ${code} — ${title}`);
      } else {
        await db.updateRow("audits", a.id, data);
        await db.audit("UPDATE", "Audit", a.code, `تعديل مهمة التدقيق ${a.code}`);
      }
      await reload("audits");
      ov.remove();
      toast("تم الحفظ");
      done();
    } catch (err) {
      toast(err.message, true);
    }
  };
}

export function openDetail(id, nav, done) {
  const a = store.audits.find((x) => x.id === id);
  if (!a) return;
  const editable = canEdit(store.user);
  const approver = canApprove(store.user);
  const wps = a.workingPapers || [];
  const findings = auditFindings(a.id);
  const report = a.report || null;
  const reportStatus = report?.status || "NONE";

  const ov = modal(`
    <div class="row" style="justify-content:space-between">
      <h2>${TYPE_ICON[a.type] || "🔍"} ${esc(a.code)} — ${esc(a.title)}</h2>
      <span>${statusBadgeFrom(AUDIT_STATUS, a.status, AUDIT_STATUS_ROLE)}</span>
    </div>
    <div class="detail-grid">
      <div><span class="muted">النوع</span><br/>${esc(AUDIT_TYPES[a.type] || a.type)}</div>
      <div><span class="muted">الجهة المدقَّقة</span><br/>${esc(a.departmentId ? deptName(a.departmentId) : "—")}</div>
      <div><span class="muted">رئيس الفريق</span><br/>${esc(userName(a.leadAuditorId))}</div>
      <div><span class="muted">الفترة المخطّطة</span><br/>${fmtDate(a.plannedStart)} → ${fmtDate(a.plannedEnd)}</div>
      <div><span class="muted">أوراق العمل</span><br/>${wps.length}</div>
      <div><span class="muted">الرأي</span><br/>${report?.opinion ? `<span class="lvl lvl-${AUDIT_OPINION_ROLE[report.opinion]}"><span class="dot"></span>${esc(AUDIT_OPINION[report.opinion])}</span>` : "—"}</div>
    </div>
    ${a.scope ? `<p class="pre-line"><strong>النطاق:</strong> ${esc(a.scope)}</p>` : ""}
    ${a.objective ? `<p class="pre-line"><strong>الأهداف:</strong> ${esc(a.objective)}</p>` : ""}

    <div class="row" style="justify-content:space-between;align-items:center;margin-top:10px">
      <h3 style="margin:0">📋 أوراق العمل (${wps.length})</h3>
      ${editable ? '<button class="secondary small" id="wp-add" title="إضافة ورقة عمل / إجراء تدقيق">＋ ورقة عمل</button>' : ""}
    </div>
    <div style="overflow-x:auto">
      <table><thead><tr><th>المرجع</th><th>الإجراء</th><th>النتيجة</th><th>الدليل</th>${editable ? "<th></th>" : ""}</tr></thead>
      <tbody>
        ${wps.map((w) => `<tr>
          <td><strong>${esc(w.ref || "—")}</strong></td>
          <td>${esc(w.procedure || "")}${w.notes ? `<div class="muted">${esc(w.notes)}</div>` : ""}</td>
          <td>${statusBadgeFrom(WP_RESULT, w.result, WP_RESULT_ROLE)}</td>
          <td>${w.evidenceUrl ? `<a href="${esc(w.evidenceUrl)}" target="_blank" rel="noopener">📎 دليل</a>` : '<span class="muted">—</span>'}</td>
          ${editable ? `<td><button class="secondary small" data-wpedit="${esc(w.id)}">تعديل</button> <button class="danger small" data-wpdel="${esc(w.id)}">✕</button></td>` : ""}
        </tr>`).join("") || `<tr><td colspan="${editable ? 5 : 4}">${emptyMsg("لا توجد أوراق عمل بعد")}</td></tr>`}
      </tbody></table>
    </div>

    <div class="row" style="justify-content:space-between;align-items:center;margin-top:12px">
      <h3 style="margin:0">🛠 الملاحظات المرتبطة (${findings.length})</h3>
      ${editable ? '<button class="secondary small" id="fnd-add" title="رفع ملاحظة تدقيق مرتبطة بهذه المهمة">＋ ملاحظة</button>' : ""}
    </div>
    ${findings.length ? `<div class="link-list">${findings.map((f) => `<div class="link-item" data-fnd="1" style="display:flex;justify-content:space-between">
      <span><strong>${esc(f.code)}</strong> ${esc((f.title || "").slice(0, 60))}</span>
      <span class="lvl lvl-${{ CRITICAL: "critical", HIGH: "serious", MEDIUM: "warning", LOW: "good" }[f.severity] || "neutral"}"><span class="dot"></span>${esc(FND_SEVERITY[f.severity] || "")}</span>
    </div>`).join("")}</div>` : '<p class="muted">لا ملاحظات مرتبطة.</p>'}

    <div class="card" style="background:rgba(20,112,92,0.05);margin:12px 0">
      <div class="row" style="justify-content:space-between;align-items:flex-start">
        <h3 style="margin:0">📄 تقرير التدقيق</h3>
        <span class="lvl lvl-${reportStatus === "APPROVED" ? "good" : reportStatus === "DRAFT" ? "warning" : "neutral"}"><span class="dot"></span>${esc(AUDIT_REPORT_STATUS[reportStatus])}</span>
      </div>
      ${report?.text ? `<p class="pre-line" style="margin-top:8px">${esc(report.text.slice(0, 600))}${report.text.length > 600 ? "…" : ""}</p>` : '<p class="muted" style="margin-top:8px">لا يوجد تقرير بعد.</p>'}
      ${report?.approvedAt ? `<p class="muted" style="font-size:0.8rem">اعتُمد: ${fmtDate(report.approvedAt)} — ${esc(userName(report.approvedById))}</p>` : ""}
      <div class="row" style="margin-top:8px">
        ${editable && reportStatus !== "APPROVED" ? '<button class="secondary" id="rep-edit" title="تحرير مسودة تقرير التدقيق">✎ تحرير التقرير</button>' : ""}
        ${approver && reportStatus === "DRAFT" ? '<button id="rep-approve" title="اعتماد التقرير وإقفال المهمة">✅ اعتماد التقرير</button>' : ""}
        ${report?.text ? '<button class="secondary" id="rep-print" title="فتح نسخة قابلة للطباعة من التقرير">🖨 طباعة التقرير</button>' : ""}
      </div>
    </div>

    <div class="row" style="margin-top:14px">
      ${editable ? `
        <button id="a-edit" title="تعديل بيانات المهمة">تعديل</button>
        <button class="danger" id="a-del" title="حذف المهمة">حذف</button>` : ""}
      <button class="secondary" id="a-close" title="إغلاق النافذة">إغلاق</button>
    </div>`, { wide: true });

  const redo = () => { ov.remove(); openDetail(id, nav, done); };
  $("#a-close", ov).onclick = () => ov.remove();
  $("#a-edit", ov)?.addEventListener("click", () => { ov.remove(); openForm(a, done); });
  ov.querySelectorAll("[data-fnd]").forEach((n) => n.addEventListener("click", () => { ov.remove(); nav("findings"); }));

  // أوراق العمل
  $("#wp-add", ov)?.addEventListener("click", () => openWorkingPaper(a, null, redo));
  ov.querySelectorAll("[data-wpedit]").forEach((b) => b.addEventListener("click", () => openWorkingPaper(a, wps.find((w) => w.id === b.dataset.wpedit), redo)));
  ov.querySelectorAll("[data-wpdel]").forEach((b) => b.addEventListener("click", async () => {
    if (!(await confirmBox("حذف ورقة العمل؟"))) return;
    await db.updateRow("audits", a.id, { workingPapers: wps.filter((w) => w.id !== b.dataset.wpdel) });
    await db.audit("UPDATE", "Audit", a.code, `حذف ورقة عمل من ${a.code}`);
    await reload("audits");
    redo(); done();
  }));

  // رفع ملاحظة مرتبطة (على نموذج CAPA)
  $("#fnd-add", ov)?.addEventListener("click", () => openAuditFinding(a, () => { redo(); done(); }));

  // التقرير
  $("#rep-edit", ov)?.addEventListener("click", () => openReportEditor(a, () => { redo(); done(); }));
  $("#rep-print", ov)?.addEventListener("click", () => printAuditReport(a));
  $("#rep-approve", ov)?.addEventListener("click", async () => {
    if (!(await confirmBox("اعتماد تقرير التدقيق وإقفال المهمة؟"))) return;
    const rep = { ...(a.report || {}), status: "APPROVED", approvedById: store.user.uid, approvedAt: db.now() };
    await db.updateRow("audits", a.id, { report: rep, status: "COMPLETED" });
    await db.audit("APPROVE", "Audit", a.code, `اعتماد تقرير التدقيق ${a.code} وإقفال المهمة`);
    await db.notify({ title: "تقرير تدقيق معتمد", message: `${a.code} — ${a.title}: اعتُمد تقرير التدقيق`, type: "AUDIT_APPROVED", link: "audit", roleTarget: "COMPLIANCE_MANAGER" });
    await reload("audits", "notifications");
    redo(); done();
  });

  $("#a-del", ov)?.addEventListener("click", async () => {
    ov.remove();
    if (!(await confirmBox(`حذف مهمة التدقيق ${a.code}؟`))) return;
    await db.removeRow("audits", a.id);
    await db.audit("DELETE", "Audit", a.code, `حذف مهمة التدقيق ${a.code}`);
    await reload("audits");
    toast("تم الحذف");
    done();
  });
}

function openWorkingPaper(a, wp, done) {
  const isNew = !wp;
  const ov = modal(`
    <h2>${isNew ? "إضافة ورقة عمل" : "تعديل ورقة عمل"}</h2>
    <div class="form-grid">
      ${fld("المرجع", txt("wp-ref", wp?.ref, "WP-01"))}
      ${fld("النتيجة", sel("wp-result", WP_RESULT, wp?.result || "EFFECTIVE"))}
    </div>
    ${fld("إجراء التدقيق *", area("wp-proc", wp?.procedure, "الإجراء المنفّذ والاختبار…", 3))}
    ${fld("الملاحظات / الأدلة الوصفية", area("wp-notes", wp?.notes, "", 2))}
    ${fld("رابط الدليل", txt("wp-ev", wp?.evidenceUrl, "https://… رابط المستند الداعم"))}
    <div class="row" style="margin-top:14px">
      <button id="wp-save">حفظ</button>
      <button class="secondary" id="wp-cancel">إلغاء</button>
    </div>`, { wide: true });
  $("#wp-cancel", ov).onclick = () => ov.remove();
  $("#wp-save", ov).onclick = async () => {
    const procedure = val("wp-proc", ov);
    if (!procedure) return toast("إجراء التدقيق إلزامي", true);
    const entry = {
      id: wp?.id || db.newId("wp"),
      ref: val("wp-ref", ov), procedure, result: val("wp-result", ov),
      notes: val("wp-notes", ov), evidenceUrl: val("wp-ev", ov) || null,
      byId: wp?.byId || store.user.uid, at: wp?.at || db.now(),
    };
    const list = a.workingPapers || [];
    const next = isNew ? [...list, entry] : list.map((w) => (w.id === entry.id ? entry : w));
    try {
      await db.updateRow("audits", a.id, { workingPapers: next });
      await db.audit("UPDATE", "Audit", a.code, `${isNew ? "إضافة" : "تعديل"} ورقة عمل في ${a.code}`);
      await reload("audits");
      ov.remove();
      toast("تم الحفظ");
      done();
    } catch (err) {
      toast(err.message, true);
    }
  };
}

function openAuditFinding(a, done) {
  const ov = modal(`
    <h2>رفع ملاحظة تدقيق — ${esc(a.code)}</h2>
    ${fld("عنوان الملاحظة *", txt("af-title", "", "مثال: غياب سجل موافقات معالجة البيانات"))}
    <div class="form-grid">
      ${fld("الخطورة", sel("af-sev", FND_SEVERITY, "MEDIUM"))}
      ${fld("الاستحقاق", dateInp("af-due"))}
    </div>
    ${fld("الوصف", area("af-desc", "", "وصف الملاحظة وأثرها…", 3))}
    ${fld("رابط الدليل", txt("af-ev", "", "https://…"))}
    <div class="row" style="margin-top:14px">
      <button id="af-save">حفظ الملاحظة</button>
      <button class="secondary" id="af-cancel">إلغاء</button>
    </div>`, { wide: true });
  $("#af-cancel", ov).onclick = () => ov.remove();
  $("#af-save", ov).onclick = async () => {
    const title = val("af-title", ov);
    if (!title) return toast("عنوان الملاحظة إلزامي", true);
    try {
      const code = await db.nextCode("FND");
      await db.setRow("findings", code, {
        code, title, severity: val("af-sev", ov),
        departmentId: a.departmentId || null, requirementId: null,
        dueDate: isoFromInput(val("af-due", ov)),
        description: val("af-desc", ov) || null,
        evidenceUrl: val("af-ev", ov) || null,
        source: "AUDIT", auditId: a.id, monitoringId: null, assessmentId: null,
        status: "OPEN", actions: [],
        createdAt: db.now(), updatedAt: db.now(),
      });
      await db.audit("CREATE", "Finding", code, `رفع ملاحظة تدقيق من ${a.code}: ${title}`);
      await reload("findings");
      ov.remove();
      toast("سُجّلت الملاحظة");
      done();
    } catch (err) {
      toast(err.message, true);
    }
  };
}

function openReportEditor(a, done) {
  const rep = a.report || {};
  const ov = modal(`
    <h2>✎ تقرير التدقيق — ${esc(a.code)}</h2>
    ${fld("الرأي / التصنيف", sel("rp-op", AUDIT_OPINION, rep.opinion || "PARTIAL"))}
    ${fld("نص التقرير", area("rp-text", rep.text, "الملخّص التنفيذي، النطاق، النتائج، التوصيات…", 12))}
    <p class="muted">بعد التحرير يعتمده مدير الالتزام؛ الاعتماد يُقفل المهمة كمكتملة.</p>
    <div class="row" style="margin-top:14px">
      <button id="rp-save">حفظ المسودة</button>
      <button class="secondary" id="rp-cancel">إلغاء</button>
    </div>`, { wide: true });
  $("#rp-cancel", ov).onclick = () => ov.remove();
  $("#rp-save", ov).onclick = async () => {
    const text = val("rp-text", ov);
    if (!text) return toast("نص التقرير فارغ", true);
    const report = { ...rep, text, opinion: val("rp-op", ov), status: rep.status === "APPROVED" ? "APPROVED" : "DRAFT", updatedAt: db.now() };
    try {
      await db.updateRow("audits", a.id, { report, status: a.status === "PLANNED" || a.status === "FIELDWORK" ? "REPORTING" : a.status });
      await db.audit("UPDATE", "Audit", a.code, `تحديث مسودة تقرير التدقيق ${a.code}`);
      await reload("audits");
      ov.remove();
      toast("حُفظت المسودة");
      done();
    } catch (err) {
      toast(err.message, true);
    }
  };
}

function printAuditReport(a) {
  const rep = a.report || {};
  const wps = a.workingPapers || [];
  const findings = auditFindings(a.id);
  const wpRows = wps.map((w) => `<tr><td>${esc(w.ref || "—")}</td><td>${esc(w.procedure || "")}</td><td>${esc(WP_RESULT[w.result] || "")}</td></tr>`).join("");
  const fRows = findings.map((f) => `<li><b>${esc(f.code)}</b> — ${esc(f.title)} (${esc(FND_SEVERITY[f.severity] || "")})</li>`).join("");
  const html = `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8" />
    <title>تقرير تدقيق ${esc(a.code)}</title>
    <style>
      body { font-family: "Segoe UI", Tahoma, sans-serif; color: #14251f; padding: 32px; line-height: 1.7; }
      h1 { color: #0d5243; border-bottom: 3px solid #14705c; padding-bottom: 8px; }
      h2 { color: #0d5243; margin-top: 22px; }
      .meta { color: #5d6c66; font-size: 0.9rem; }
      table { border-collapse: collapse; width: 100%; margin-top: 8px; }
      th, td { border: 1px solid #ccc; padding: 6px 10px; text-align: right; font-size: 0.9rem; }
      .body { white-space: pre-line; }
      .op { display: inline-block; padding: 3px 12px; border-radius: 12px; background: #0d5243; color: #fff; }
      .badge { background: #0ca30c; color: #fff; padding: 2px 10px; border-radius: 12px; font-size: 0.8rem; }
      @media print { button { display:none; } }
    </style></head><body>
    <h1>تقرير التدقيق الداخلي — ${esc(a.title)}</h1>
    <div class="meta">الرقم: ${esc(a.code)} · النوع: ${esc(AUDIT_TYPES[a.type] || a.type)} · الجهة: ${esc(a.departmentId ? deptName(a.departmentId) : "—")} · الفترة: ${fmtDate(a.plannedStart)} → ${fmtDate(a.plannedEnd)}</div>
    <div class="meta">رئيس الفريق: ${esc(userName(a.leadAuditorId))} · الرأي: <span class="op">${esc(AUDIT_OPINION[rep.opinion] || "—")}</span> ${rep.status === "APPROVED" ? `· <span class="badge">معتمد ${fmtDate(rep.approvedAt)}</span>` : ""}</div>
    ${a.scope ? `<h2>النطاق</h2><div class="body">${esc(a.scope)}</div>` : ""}
    ${a.objective ? `<h2>الأهداف</h2><div class="body">${esc(a.objective)}</div>` : ""}
    <h2>التقرير</h2><div class="body">${esc(rep.text || "")}</div>
    <h2>أوراق العمل (${wps.length})</h2>
    <table><thead><tr><th>المرجع</th><th>الإجراء</th><th>النتيجة</th></tr></thead><tbody>${wpRows || '<tr><td colspan="3">—</td></tr>'}</tbody></table>
    <h2>الملاحظات (${findings.length})</h2><ul>${fRows || "<li>لا توجد</li>"}</ul>
    ${rep.status === "APPROVED" ? `<p style="margin-top:28px">المعتمِد: <b>${esc(userName(rep.approvedById))}</b> — ${fmtDate(rep.approvedAt)}</p>` : ""}
    <script>window.onload=function(){window.print();};<\/script>
    </body></html>`;
  const w = window.open("", "_blank");
  if (!w) return toast("مانع النوافذ المنبثقة يمنع الطباعة", true);
  w.document.write(html); w.document.close();
}
