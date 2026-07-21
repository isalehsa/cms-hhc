// الفحص الذاتي للإدارات — نماذج مرتبطة بمتطلبات المكتبة، إجابات الإدارة، مراجعة الالتزام
// عدم الالتزام يولّد ملاحظات تلقائية قابلة للتحويل لخطط تصحيحية
import { store, reload, deptName, reqLabel, deptOptions, reqOptions } from "../state.js";
import * as db from "../db.js";
import {
  $, esc, safeUrl, toast, modal, confirmBox, fld, txt, area, sel, dateInp, val,
  fmtDate, isoFromInput, statusBadgeFrom, emptyMsg,
} from "../ui.js";
import { SA_STATUS, SA_ANSWERS } from "../meta.js";
import { canEdit, isDeptOwner } from "../auth.js";

const ST_ROLE = { DRAFT: "neutral", SENT: "warning", SUBMITTED: "serious", REVIEWED: "good" };
const ANS_ROLE = { COMPLIANT: "good", PARTIAL: "warning", NON_COMPLIANT: "critical", NA: "neutral" };

export function renderAssessments(el, nav, refresh) {
  const user = store.user;
  const editable = canEdit(user);
  const mine = isDeptOwner(user) ? store.assessments.filter((a) => a.departmentId === user.departmentId) : store.assessments;

  el.innerHTML = `
    <div class="page-head">
      <h1>📋 الفحص الذاتي للإدارات</h1>
      ${editable ? '<button id="add-sa">＋ فحص ذاتي جديد</button>' : ""}
    </div>
    <section class="card">
      <div style="overflow-x:auto">
        <table>
          <thead><tr>
            <th>الفحص</th><th>الإدارة</th><th>الفترة</th><th>الاستحقاق</th><th>الأسئلة</th><th>النتيجة</th><th>الحالة</th>
          </tr></thead>
          <tbody>
            ${mine
              .map((a) => {
                const answered = (a.questions || []).filter((q) => q.response?.answer);
                const nc = answered.filter((q) => q.response.answer === "NON_COMPLIANT").length;
                return `<tr class="rowlink" data-open="${a.id}">
                  <td><strong>${esc(a.title)}</strong></td>
                  <td>${esc(deptName(a.departmentId))}</td>
                  <td>${esc(a.period || "—")}</td>
                  <td>${fmtDate(a.dueDate)}</td>
                  <td>${answered.length} / ${(a.questions || []).length}</td>
                  <td>${answered.length ? (nc ? `<span class="lvl lvl-critical"><span class="dot"></span>${nc} غير ملتزم</span>` : '<span class="lvl lvl-good"><span class="dot"></span>لا يوجد عدم التزام</span>') : "—"}</td>
                  <td>${statusBadgeFrom(SA_STATUS, a.status, ST_ROLE)}</td>
                </tr>`;
              })
              .join("") || `<tr><td colspan="7">${emptyMsg("لا توجد فحوصات بعد")}</td></tr>`}
          </tbody>
        </table>
      </div>
    </section>`;

  const rerender = () => renderAssessments(el, nav, refresh);
  $("#add-sa", el)?.addEventListener("click", () => openCreate(rerender));
  el.querySelectorAll("[data-open]").forEach((tr) =>
    tr.addEventListener("click", () => openDetail(tr.dataset.open, nav, rerender))
  );
}

// إنشاء نموذج فحص ذاتي جديد
function openCreate(done) {
  const ov = modal(
    `
    <h2>فحص ذاتي جديد</h2>
    <div class="form-grid">
      ${fld("الإدارة المستهدفة *", sel("s-dept", deptOptions(), "", { empty: "— اختر —" }))}
      ${fld("الفترة", txt("s-period", "", "مثال: الربع الثالث 2026"))}
      ${fld("تاريخ الاستحقاق", dateInp("s-due"))}
    </div>
    ${fld("عنوان الفحص", txt("s-title", "", "يُولَّد تلقائياً إن تُرك فارغاً"))}
    <div class="row" style="justify-content:space-between;align-items:center">
      <h3 style="margin:8px 0">الأسئلة (كل سؤال مرتبط بمتطلب)</h3>
      <button class="secondary small" id="q-auto" title="توليد سؤال لكل متطلب في مكتبة الالتزام مملوك للإدارة المختارة — ثمرة أتمتة تحليل الوثائق">🤖 توليد من مكتبة الالتزام</button>
    </div>
    <p class="muted" id="q-auto-hint">اختر الإدارة أولاً ثم «توليد من مكتبة الالتزام» لإنشاء الأسئلة تلقائياً من متطلباتها، أو أضفها يدوياً.</p>
    <div id="q-list"></div>
    <button class="secondary small" id="q-add">＋ إضافة سؤال</button>
    <div class="row" style="margin-top:14px">
      <button id="s-save">حفظ كمسودة</button>
      <button id="s-send">حفظ وإرسال للإدارة</button>
      <button class="secondary" id="s-cancel">إلغاء</button>
    </div>`,
    { wide: true }
  );

  const addQ = (text = "", reqId = "") => {
    const div = document.createElement("div");
    div.className = "q-row card sub";
    div.innerHTML = `
      <div class="row">
        <input type="text" class="grow q-text" placeholder="نص السؤال…" value="${esc(text)}" />
        <button class="danger small q-del">✕</button>
      </div>
      <select class="q-req"><option value="">— المتطلب المرتبط —</option>
        ${reqOptions().map((o) => `<option value="${esc(o.id)}" ${o.id === reqId ? "selected" : ""}>${esc(o.name)}</option>`).join("")}
      </select>`;
    $("#q-list", ov).appendChild(div);
    div.querySelector(".q-del").onclick = () => div.remove();
    return div;
  };
  addQ();
  $("#q-add", ov).onclick = () => addQ();
  $("#s-cancel", ov).onclick = () => ov.remove();

  // توليد الأسئلة تلقائياً من متطلبات مكتبة الالتزام المملوكة للإدارة المختارة
  $("#q-auto", ov).onclick = () => {
    const deptId = val("s-dept", ov);
    if (!deptId) return toast("اختر الإدارة المستهدفة أولاً", true);
    const reqs = store.requirements.filter(
      (r) => r.ownerDeptId === deptId && r.status !== "CANCELLED"
    );
    if (!reqs.length) return toast("لا توجد متطلبات مسجلة لهذه الإدارة في مكتبة الالتزام", true);
    // نُبقي الأسئلة المعبّأة يدوياً ونتجاهل الصفوف الفارغة، ونمنع تكرار المتطلب
    const existingReqIds = new Set(
      [...ov.querySelectorAll(".q-row")]
        .filter((row) => row.querySelector(".q-text").value.trim())
        .map((row) => row.querySelector(".q-req").value)
        .filter(Boolean)
    );
    [...ov.querySelectorAll(".q-row")].forEach((row) => {
      if (!row.querySelector(".q-text").value.trim()) row.remove();
    });
    let added = 0;
    for (const r of reqs) {
      if (existingReqIds.has(r.id)) continue;
      addQ(`هل تلتزم الإدارة بمتطلب «${r.title}» (${r.code})؟`, r.id);
      added++;
    }
    if (!added) return toast("جميع متطلبات هذه الإدارة مضافة بالفعل", true);
    if (!val("s-title", ov)) {
      // عنوان مقترح
      const t = $("#s-title", ov);
      if (t) t.value = `الفحص الذاتي — ${deptName(deptId)} — ${val("s-period", ov) || new Date().getFullYear()}`;
    }
    toast(`أُضيف ${added} سؤالاً من مكتبة الالتزام`);
  };

  const save = async (send) => {
    const deptId = val("s-dept", ov);
    if (!deptId) return toast("اختر الإدارة المستهدفة", true);
    const questions = [...ov.querySelectorAll(".q-row")]
      .map((row, i) => ({
        id: crypto.randomUUID(),
        order: i + 1,
        text: row.querySelector(".q-text").value.trim(),
        requirementId: row.querySelector(".q-req").value || null,
        response: null,
      }))
      .filter((q) => q.text);
    if (!questions.length) return toast("أضف سؤالاً واحداً على الأقل", true);
    const period = val("s-period", ov) || `${new Date().getFullYear()}`;
    const title = val("s-title", ov) || `الفحص الذاتي — ${deptName(deptId)} — ${period}`;
    try {
      const row = await db.addRow("assessments", {
        title, period,
        departmentId: deptId,
        dueDate: isoFromInput(val("s-due", ov)),
        status: send ? "SENT" : "DRAFT",
        questions,
        deptComment: null,
        reviewNotes: null,
        createdAt: db.now(),
        updatedAt: db.now(),
      });
      await db.audit("CREATE", "Assessment", row.id, `إنشاء فحص ذاتي: ${title}`);
      if (send) {
        await db.notify({
          title: "فحص ذاتي جديد مطلوب",
          message: `${title} — الاستحقاق ${fmtDate(isoFromInput(val("s-due", ov)))}`,
          type: "ASSESSMENT_SENT",
          link: "assessments",
          roleTarget: "DEPT_OWNER",
        });
      }
      await reload("assessments");
      ov.remove();
      toast(send ? "أُرسل الفحص للإدارة" : "حُفظ كمسودة");
      done();
    } catch (err) {
      toast(err.message, true);
    }
  };
  $("#s-save", ov).onclick = () => save(false);
  $("#s-send", ov).onclick = () => save(true);
}

// تفاصيل الفحص: تعبئة الإدارة + مراجعة الالتزام
export function openDetail(id, nav, done) {
  const a = store.assessments.find((x) => x.id === id);
  if (!a) return;
  const user = store.user;
  const manager = canEdit(user);
  const owner = isDeptOwner(user) && user.departmentId === a.departmentId;
  const canAnswer = (owner || manager) && ["SENT", "DRAFT"].includes(a.status);
  const canReview = manager && a.status === "SUBMITTED";

  const qHtml = (a.questions || [])
    .map((q, i) => {
      const ans = q.response?.answer;
      return `<div class="card sub q-item" data-qid="${q.id}">
        <p><strong>${i + 1}.</strong> ${esc(q.text)}</p>
        ${q.requirementId ? `<p class="muted">📖 ${esc(reqLabel(q.requirementId))}</p>` : ""}
        ${
          canAnswer
            ? `<div class="row">
                <select class="q-answer">${Object.entries(SA_ANSWERS)
                  .map(([k, v]) => `<option value="${k}" ${k === ans ? "selected" : ""}>${v}</option>`)
                  .join("")}<option value="" ${!ans ? "selected" : ""}>— اختر الإجابة —</option></select>
                <input type="text" class="grow q-comment" placeholder="تعليق الإدارة" value="${esc(q.response?.comment || "")}" />
                <input type="text" class="grow q-evidence" placeholder="رابط الدليل (اختياري)" value="${esc(q.response?.evidence || "")}" />
              </div>`
            : ans
              ? `<p>${statusBadgeFrom(SA_ANSWERS, ans, ANS_ROLE)}
                 ${q.response?.comment ? ` — ${esc(q.response.comment)}` : ""}
                 ${q.response?.evidence ? ` — <a href="${safeUrl(q.response.evidence)}" target="_blank" rel="noopener">📎 الدليل</a>` : ""}</p>`
              : '<p class="muted">لم تُجب بعد</p>'
        }
      </div>`;
    })
    .join("");

  const ov = modal(
    `
    <div class="row" style="justify-content:space-between">
      <h2>${esc(a.title)}</h2>
      <span>${statusBadgeFrom(SA_STATUS, a.status, ST_ROLE)}</span>
    </div>
    <p class="muted">${esc(deptName(a.departmentId))} · ${esc(a.period || "")} · الاستحقاق: ${fmtDate(a.dueDate)}</p>
    ${qHtml}
    ${canAnswer ? fld("تعليق الإدارة العام", area("sa-comment", a.deptComment, "", 2)) : a.deptComment ? `<p><strong>تعليق الإدارة:</strong> ${esc(a.deptComment)}</p>` : ""}
    ${canReview ? fld("ملاحظات مراجعة إدارة الالتزام", area("sa-review", a.reviewNotes, "", 2)) : a.reviewNotes ? `<p><strong>ملاحظات المراجعة:</strong> ${esc(a.reviewNotes)}</p>` : ""}
    <div class="row" style="margin-top:14px">
      ${canAnswer ? '<button id="sa-submit">إرسال الإجابات للمراجعة</button><button class="secondary" id="sa-savedraft">حفظ مؤقت</button>' : ""}
      ${canReview ? '<button id="sa-doreview">✔ اعتماد المراجعة وتوليد الملاحظات</button>' : ""}
      ${manager && a.status !== "SUBMITTED" && a.status !== "REVIEWED" ? '<button class="secondary" id="sa-send">إرسال للإدارة</button>' : ""}
      ${manager ? '<button class="danger" id="sa-del">حذف</button>' : ""}
      <button class="secondary" id="sa-close">إغلاق</button>
    </div>`,
    { wide: true }
  );

  $("#sa-close", ov).onclick = () => ov.remove();

  const readAnswers = () =>
    (a.questions || []).map((q) => {
      const row = ov.querySelector(`[data-qid="${q.id}"]`);
      if (!row || !canAnswer) return q;
      const answer = row.querySelector(".q-answer")?.value || null;
      return {
        ...q,
        response: answer
          ? {
              answer,
              comment: row.querySelector(".q-comment")?.value?.trim() || null,
              evidence: row.querySelector(".q-evidence")?.value?.trim() || null,
            }
          : null,
      };
    });

  const saveAnswers = async (submit) => {
    const questions = readAnswers();
    if (submit && questions.some((q) => !q.response?.answer)) {
      return toast("أجب على جميع الأسئلة قبل الإرسال", true);
    }
    try {
      await db.updateRow("assessments", a.id, {
        questions,
        deptComment: val("sa-comment", ov) || a.deptComment || null,
        status: submit ? "SUBMITTED" : a.status,
      });
      await db.audit(submit ? "SUBMIT" : "UPDATE", "Assessment", a.id, `${submit ? "إرسال إجابات" : "حفظ مؤقت"}: ${a.title}`);
      if (submit) {
        await db.notify({
          title: "فحص ذاتي بانتظار المراجعة",
          message: a.title,
          type: "ASSESSMENT_SUBMITTED",
          link: "assessments",
          roleTarget: "COMPLIANCE_MANAGER",
        });
      }
      await reload("assessments");
      ov.remove();
      toast(submit ? "أُرسلت الإجابات للمراجعة" : "حُفظ");
      done();
    } catch (err) {
      toast(err.message, true);
    }
  };
  $("#sa-submit", ov)?.addEventListener("click", () => saveAnswers(true));
  $("#sa-savedraft", ov)?.addEventListener("click", () => saveAnswers(false));

  $("#sa-send", ov)?.addEventListener("click", async () => {
    await db.updateRow("assessments", a.id, { status: "SENT" });
    await db.notify({
      title: "فحص ذاتي جديد مطلوب",
      message: a.title,
      type: "ASSESSMENT_SENT",
      link: "assessments",
      roleTarget: "DEPT_OWNER",
    });
    await reload("assessments");
    ov.remove();
    toast("أُرسل للإدارة");
    done();
  });

  // اعتماد المراجعة: توليد ملاحظة لكل إجابة "غير ملتزم"
  $("#sa-doreview", ov)?.addEventListener("click", async () => {
    try {
      const reviewNotes = val("sa-review", ov) || null;
      const ncQuestions = (a.questions || []).filter((q) => q.response?.answer === "NON_COMPLIANT");
      await db.updateRow("assessments", a.id, { status: "REVIEWED", reviewNotes });
      await db.audit("REVIEW", "Assessment", a.id, `مراجعة الفحص الذاتي: ${a.title}`);
      let created = 0;
      for (const q of ncQuestions) {
        const already = store.findings.some((f) => f.assessmentId === a.id && f.title.includes(q.text.slice(0, 40)));
        if (already) continue;
        const code = await db.nextCode("FND");
        await db.setRow("findings", code, {
          code,
          title: `عدم التزام (فحص ذاتي): ${q.text.slice(0, 90)}`,
          description: q.response?.comment || null,
          source: "ASSESSMENT",
          severity: "HIGH",
          requirementId: q.requirementId || null,
          riskId: null,
          monitoringId: null,
          assessmentId: a.id,
          departmentId: a.departmentId,
          status: "OPEN",
          dueDate: new Date(Date.now() + 30 * 86400000).toISOString(),
          actions: [],
          createdAt: db.now(),
          updatedAt: db.now(),
        });
        created++;
      }
      if (created) {
        await db.notify({
          title: "ملاحظات جديدة من الفحص الذاتي",
          message: `${a.title}: ${created} ملاحظة عدم التزام`,
          type: "FINDING_HIGH",
          link: "findings",
          roleTarget: "COMPLIANCE_MANAGER",
        });
        await reload("findings");
      }
      await reload("assessments");
      ov.remove();
      toast(created ? `اعتُمدت المراجعة وأُنشئت ${created} ملاحظة` : "اعتُمدت المراجعة — لا يوجد عدم التزام");
      done();
    } catch (err) {
      toast(err.message, true);
    }
  });

  $("#sa-del", ov)?.addEventListener("click", async () => {
    ov.remove();
    if (!(await confirmBox("حذف هذا الفحص الذاتي؟"))) return;
    await db.removeRow("assessments", a.id);
    await db.audit("DELETE", "Assessment", a.id, `حذف فحص ذاتي: ${a.title}`);
    await reload("assessments");
    toast("تم الحذف");
    done();
  });
}
