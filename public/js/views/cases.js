// سجل البلاغات — استقبال وتقييم مبدئي، خطة تحقيق، نتيجة، إجراء جزائي/تصحيحي، إغلاق
// وفق دليل السياسات والإجراءات (التحقيق ومعالجة بلاغات عدم الالتزام) وقالب «سجل البلاغات»
import { store, reload, deptName, userName, deptOptions, userOptions, reqOptions } from "../state.js";
import * as db from "../db.js";
import {
  $, esc, toast, modal, confirmBox, fld, txt, area, sel, dateInp, val,
  fmtDate, isoFromInput, todayISO, levelBadge, statusBadgeFrom, emptyMsg, keepFocus,
} from "../ui.js";
import { CASE_SOURCES, CASE_STATUS, FND_SEVERITY } from "../meta.js";
import { canEdit } from "../auth.js";

const ST_ROLE = { RECEIVED: "warning", INVESTIGATING: "serious", CLOSED: "good" };
const filters = { search: "", status: "", source: "" };

export function renderCases(el, nav, refresh) {
  const editable = canEdit(store.user);
  const rows = store.cases.filter((c) => {
    if (filters.search && !`${c.code} ${c.summary} ${c.details || ""}`.includes(filters.search)) return false;
    if (filters.status && c.status !== filters.status) return false;
    if (filters.source && c.source !== filters.source) return false;
    return true;
  });
  const open = store.cases.filter((c) => c.status !== "CLOSED").length;
  const closed = store.cases.length - open;
  const closureRate = store.cases.length ? Math.round((closed / store.cases.length) * 100) : 0;

  el.innerHTML = `
    <div class="page-head">
      <h1>📣 سجل البلاغات</h1>
      ${editable ? '<button id="add-case" title="تسجيل بلاغ جديد وارد">＋ بلاغ جديد</button>' : ""}
    </div>
    <div class="stats">
      <div class="stat"><div class="num">${store.cases.length}</div><div class="lbl">إجمالي البلاغات</div></div>
      <div class="stat"><div class="num">${open}</div><div class="lbl">قيد التحقيق / المتابعة</div></div>
      <div class="stat"><div class="num">${closed}</div><div class="lbl">مغلقة</div></div>
      <div class="stat"><div class="num">${closureRate}%</div><div class="lbl">معدل إغلاق البلاغات</div><div class="sub">المستهدف 100%</div></div>
    </div>
    <section class="card">
      <div class="row filters">
        <input type="text" id="f-search" class="grow" placeholder="بحث…" value="${esc(filters.search)}" />
        ${sel("f-status", CASE_STATUS, filters.status, { empty: "كل الحالات" })}
        ${sel("f-source", CASE_SOURCES, filters.source, { empty: "كل المصادر" })}
      </div>
      <div style="overflow-x:auto">
        <table>
          <thead><tr>
            <th>رقم البلاغ</th><th>تاريخ الاستلام</th><th>وصف مختصر</th><th>المصدر</th>
            <th>التقييم المبدئي</th><th>المحقق</th><th>تاريخ الإغلاق</th><th>الحالة</th>
          </tr></thead>
          <tbody>
            ${rows
              .map((c) => `<tr class="rowlink" data-open="${c.id}">
                <td><strong>${esc(c.code)}</strong>${c.confidential ? ' <span class="chip" title="بلاغ سري">🔒</span>' : ""}</td>
                <td>${fmtDate(c.receivedDate)}</td>
                <td><strong>${esc(c.summary)}</strong></td>
                <td>${esc(CASE_SOURCES[c.source] || c.source || "—")}</td>
                <td>${c.initialAssessment ? levelBadge(c.initialAssessment, FND_SEVERITY[c.initialAssessment] || "—") : "—"}</td>
                <td>${esc(userName(c.investigatorId))}</td>
                <td>${fmtDate(c.closeDate)}</td>
                <td>${statusBadgeFrom(CASE_STATUS, c.status, ST_ROLE)}</td>
              </tr>`)
              .join("") || `<tr><td colspan="8">${emptyMsg("لا توجد بلاغات مطابقة")}</td></tr>`}
          </tbody>
        </table>
      </div>
      <p class="muted">عدد النتائج: ${rows.length} من ${store.cases.length}</p>
    </section>`;

  const rerender = () => renderCases(el, nav, refresh);
  $("#f-search", el).addEventListener("input", (e) => { filters.search = e.target.value; keepFocus(rerender); });
  $("#f-status", el).onchange = (e) => { filters.status = e.target.value; rerender(); };
  $("#f-source", el).onchange = (e) => { filters.source = e.target.value; rerender(); };
  $("#add-case", el)?.addEventListener("click", () => openForm(null, rerender));
  el.querySelectorAll("[data-open]").forEach((tr) =>
    tr.addEventListener("click", () => openDetail(tr.dataset.open, nav, rerender))
  );
}

function openForm(c, done) {
  const isNew = !c;
  const ov = modal(
    `
    <h2>${isNew ? "تسجيل بلاغ جديد" : `تعديل ${esc(c.code)}`}</h2>
    ${fld("وصف مختصر للبلاغ *", txt("c-summary", c?.summary))}
    <div class="form-grid">
      ${fld("تاريخ الاستلام", dateInp("c-received", c?.receivedDate || (isNew ? new Date().toISOString() : "")))}
      ${fld("مصدر البلاغ", sel("c-source", CASE_SOURCES, c?.source || "PLATFORM"))}
      ${fld("التقييم المبدئي", sel("c-assess", FND_SEVERITY, c?.initialAssessment || "MEDIUM"))}
      ${fld("الإدارة المعنية", sel("c-dept", deptOptions(), c?.departmentId, { empty: "— غير محدد —" }))}
      ${fld("المسؤول عن التحقيق", sel("c-investigator", userOptions(), c?.investigatorId, { empty: "— يُحدَّد لاحقاً —" }))}
      ${fld("المتطلب المرتبط", sel("c-req", reqOptions(), c?.requirementId, { empty: "— بلا —" }))}
    </div>
    ${fld("الشرح التفصيلي للبلاغ", area("c-details", c?.details, "", 3))}
    ${fld("خطة التحقيق", area("c-plan", c?.investigationPlan, "تكليف محقق مستقل عند الحاجة، بالتنسيق مع لجنة المراجعة…", 2))}
    ${fld("المستندات الداعمة (إن وجدت)", txt("c-docs", c?.supportingDocs, "روابط أو أسماء المرفقات"))}
    <label class="chk"><input type="checkbox" id="c-conf" ${c?.confidential ? "checked" : ""} /> بلاغ سري — يُحفظ على سرية الهوية والمعلومات قدر الإمكان</label>
    <div class="row" style="margin-top:14px">
      <button id="c-save">حفظ</button>
      <button class="secondary" id="c-cancel">إلغاء</button>
    </div>`,
    { wide: true }
  );
  $("#c-cancel", ov).onclick = () => ov.remove();
  $("#c-save", ov).onclick = async () => {
    const summary = val("c-summary", ov);
    if (!summary) return toast("وصف البلاغ إلزامي", true);
    const assess = val("c-assess", ov);
    const data = {
      summary,
      receivedDate: isoFromInput(val("c-received", ov)) || db.now(),
      source: val("c-source", ov),
      initialAssessment: assess,
      departmentId: val("c-dept", ov) || null,
      investigatorId: val("c-investigator", ov) || null,
      requirementId: val("c-req", ov) || null,
      details: val("c-details", ov) || null,
      investigationPlan: val("c-plan", ov) || null,
      supportingDocs: val("c-docs", ov) || null,
      confidential: $("#c-conf", ov).checked,
    };
    try {
      if (isNew) {
        const code = await db.nextCode("BLG");
        await db.setRow("cases", code, {
          ...data, code,
          status: data.investigatorId ? "INVESTIGATING" : "RECEIVED",
          finalResult: null, action: null, closeDate: null, notes: null,
          createdAt: db.now(), updatedAt: db.now(),
        });
        await db.audit("CREATE", "Case", code, `تسجيل بلاغ جديد: ${code} — ${summary}`);
        if (assess === "CRITICAL" || assess === "HIGH") {
          await db.notify({
            title: "بلاغ عالي الأهمية",
            message: `${code} — ${summary}`,
            type: "CASE_HIGH",
            link: "cases",
            roleTarget: "COMPLIANCE_MANAGER",
          });
        }
      } else {
        await db.updateRow("cases", c.id, data);
        await db.audit("UPDATE", "Case", c.code, `تعديل البلاغ ${c.code}`);
      }
      await reload("cases");
      ov.remove();
      toast("تم الحفظ");
      done();
    } catch (err) {
      toast(err.message, true);
    }
  };
}

export function openDetail(id, nav, done) {
  const c = store.cases.find((x) => x.id === id);
  if (!c) return;
  const editable = canEdit(store.user);

  const ov = modal(
    `
    <div class="row" style="justify-content:space-between">
      <h2>${esc(c.code)} — ${esc(c.summary)}</h2>
      <span>${statusBadgeFrom(CASE_STATUS, c.status, ST_ROLE)}</span>
    </div>
    <div class="detail-grid">
      <div><span class="muted">تاريخ الاستلام</span><br/>${fmtDate(c.receivedDate)}</div>
      <div><span class="muted">المصدر</span><br/>${esc(CASE_SOURCES[c.source] || "—")}</div>
      <div><span class="muted">التقييم المبدئي</span><br/>${c.initialAssessment ? levelBadge(c.initialAssessment, FND_SEVERITY[c.initialAssessment]) : "—"}</div>
      <div><span class="muted">الإدارة المعنية</span><br/>${esc(deptName(c.departmentId))}</div>
      <div><span class="muted">المسؤول عن التحقيق</span><br/>${esc(userName(c.investigatorId))}</div>
      <div><span class="muted">تاريخ الإغلاق</span><br/>${fmtDate(c.closeDate)}</div>
    </div>
    ${c.confidential ? '<p class="muted">🔒 بلاغ سري — تُراعى سرية الهوية والمعلومات</p>' : ""}
    ${c.details ? `<p><strong>الشرح التفصيلي:</strong> ${esc(c.details)}</p>` : ""}
    ${c.investigationPlan ? `<p><strong>خطة التحقيق:</strong> ${esc(c.investigationPlan)}</p>` : ""}
    ${c.supportingDocs ? `<p><strong>المستندات الداعمة:</strong> ${esc(c.supportingDocs)}</p>` : ""}
    ${c.finalResult ? `<p><strong>نتيجة التحقيق النهائية:</strong> ${esc(c.finalResult)}</p>` : ""}
    ${c.action ? `<p><strong>الإجراء الجزائي / التصحيحي:</strong> ${esc(c.action)}</p>` : ""}
    ${c.notes ? `<p class="muted"><strong>ملاحظات إضافية:</strong> ${esc(c.notes)}</p>` : ""}
    <div class="row" style="margin-top:14px">
      ${editable && c.status !== "CLOSED" ? '<button id="c-close-case">✔ إنهاء التحقيق وإغلاق البلاغ</button>' : ""}
      ${editable ? '<button class="secondary" id="c-edit">تعديل</button>' : ""}
      ${editable ? '<button class="danger" id="c-del">حذف</button>' : ""}
      <button class="secondary" id="c-x">إغلاق</button>
    </div>`,
    { wide: true }
  );

  $("#c-x", ov).onclick = () => ov.remove();
  $("#c-edit", ov)?.addEventListener("click", () => { ov.remove(); openForm(c, done); });
  $("#c-close-case", ov)?.addEventListener("click", () => { ov.remove(); openClose(c, done); });
  $("#c-del", ov)?.addEventListener("click", async () => {
    ov.remove();
    if (!(await confirmBox(`حذف البلاغ ${c.code}؟`))) return;
    await db.removeRow("cases", c.id);
    await db.audit("DELETE", "Case", c.code, `حذف البلاغ ${c.code}`);
    await reload("cases");
    toast("تم الحذف");
    done();
  });
}

// إغلاق البلاغ: توثيق نتيجة التحقيق والإجراء، مع خيار توليد ملاحظة/إجراء تصحيحي آلياً
function openClose(c, done) {
  const ov = modal(
    `
    <h2>إغلاق البلاغ ${esc(c.code)}</h2>
    <p class="muted">توثّق نتيجة التحقيق والإجراء الجزائي/التصحيحي المتخذ، ثم يُغلق البلاغ ويُحتسب ضمن معدل الإغلاق.</p>
    ${fld("نتيجة التحقيق النهائية *", area("cl-result", c.finalResult, "خلاصة التحقيق وتحديد المخالفة إن وُجدت…", 3))}
    ${fld("الإجراء الجزائي / التصحيحي", area("cl-action", c.action, "", 2))}
    ${fld("ملاحظات إضافية", txt("cl-notes", c.notes))}
    <label class="chk"><input type="checkbox" id="cl-mkfinding" /> إنشاء ملاحظة وخطة تصحيحية في سجل الملاحظات من هذا البلاغ</label>
    <div class="row" style="margin-top:14px">
      <button id="cl-save">اعتماد الإغلاق</button>
      <button class="secondary" id="cl-cancel">إلغاء</button>
    </div>`,
    { wide: true }
  );
  $("#cl-cancel", ov).onclick = () => ov.remove();
  $("#cl-save", ov).onclick = async () => {
    const result = val("cl-result", ov);
    if (!result) return toast("نتيجة التحقيق إلزامية للإغلاق", true);
    const action = val("cl-action", ov) || null;
    try {
      await db.updateRow("cases", c.id, {
        finalResult: result,
        action,
        notes: val("cl-notes", ov) || null,
        status: "CLOSED",
        closeDate: db.now(),
      });
      await db.audit("APPROVE", "Case", c.code, `إغلاق البلاغ ${c.code} بعد اكتمال التحقيق`);

      if ($("#cl-mkfinding", ov).checked) {
        const code = await db.nextCode("FND");
        await db.setRow("findings", code, {
          code,
          title: `ملاحظة من البلاغ ${c.code}: ${c.summary}`,
          description: result,
          source: "MANUAL",
          severity: c.initialAssessment || "MEDIUM",
          requirementId: c.requirementId || null,
          riskId: null, monitoringId: null, assessmentId: null,
          caseId: c.id,
          departmentId: c.departmentId || null,
          status: "OPEN",
          dueDate: new Date(Date.now() + 30 * 86400000).toISOString(),
          actions: action
            ? [{
                id: crypto.randomUUID(),
                description: action,
                ownerId: c.investigatorId || null,
                departmentId: c.departmentId || null,
                dueDate: new Date(Date.now() + 30 * 86400000).toISOString(),
                status: "OPEN", progress: 0, closureNotes: null, createdAt: db.now(),
              }]
            : [],
          createdAt: db.now(), updatedAt: db.now(),
        });
        await db.audit("CREATE", "Finding", code, `ملاحظة تلقائية من البلاغ ${c.code}`);
        await reload("findings");
      }
      await reload("cases");
      ov.remove();
      toast("أُغلق البلاغ");
      done();
    } catch (err) {
      toast(err.message, true);
    }
  };
}
