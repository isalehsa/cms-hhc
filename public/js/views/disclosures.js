// سجل الإفصاحات — تعارض المصالح، الهدايا والضيافة، الإفصاحات المالية، البلاغات
// كل إفصاح يُراجَع ويُعتمد أو يُعالَج بإجراء؛ عدم التزامه يمكن تحويله لملاحظة
import { store, reload, deptName, userName, deptOptions, userOptions } from "../state.js";
import * as db from "../db.js";
import {
  $, esc, toast, modal, confirmBox, fld, txt, area, sel, dateInp, val,
  fmtDate, isoFromInput, statusBadgeFrom, emptyMsg, keepFocus, fmtSAR, distBar,
} from "../ui.js";
import { DISCLOSURE_TYPES, DISCLOSURE_STATUS } from "../meta.js";
import { canEdit, canApprove } from "../auth.js";

const ST_ROLE = { PENDING: "warning", UNDER_REVIEW: "serious", APPROVED: "good", MITIGATED: "good", REJECTED: "critical" };
const TYPE_ICON = { CONFLICT: "⚖", GIFTS: "🎁", OUTSIDE: "💼", FINANCIAL: "💰", RELATED_PARTY: "🔗", WHISTLEBLOW: "📢", OTHER: "📄" };

const filters = { search: "", type: "", status: "", dept: "" };

export function renderDisclosures(el, nav, refresh) {
  const editable = canEdit(store.user);
  const all = store.disclosures;
  const rows = all.filter((d) => {
    if (filters.search && !`${d.code} ${d.title} ${d.discloserName || ""} ${d.description || ""}`.includes(filters.search)) return false;
    if (filters.type && d.type !== filters.type) return false;
    if (filters.status && d.status !== filters.status) return false;
    if (filters.dept && d.departmentId !== filters.dept) return false;
    return true;
  });

  const pending = all.filter((d) => ["PENDING", "UNDER_REVIEW"].includes(d.status));

  el.innerHTML = `
    <div class="page-head">
      <h1>🗂 سجل الإفصاحات</h1>
      <button id="add-disc" title="تسجيل إفصاح جديد (تعارض مصالح، هدية، إفصاح مالي، بلاغ…)">＋ إفصاح جديد</button>
    </div>
    <div class="stats">
      <div class="stat"><div class="num">${all.length}</div><div class="lbl">إجمالي الإفصاحات</div></div>
      <div class="stat"><div class="num">${pending.length}</div><div class="lbl">بانتظار المراجعة</div>
        ${pending.length ? '<div class="sub"><span class="lvl lvl-warning"><span class="dot"></span>تتطلب إجراءً</span></div>' : ""}</div>
      <div class="stat"><div class="num">${all.filter((d) => d.type === "CONFLICT").length}</div><div class="lbl">تعارض مصالح</div></div>
      <div class="stat"><div class="num">${all.filter((d) => d.type === "GIFTS").length}</div><div class="lbl">هدايا وضيافة</div></div>
    </div>
    <div class="grid-2">
      <section class="card"><h2>حسب النوع</h2>
        ${distBar(Object.entries(DISCLOSURE_TYPES).map(([k, label], i) => ({
          label, count: all.filter((d) => d.type === k).length,
          role: ["serious", "warning", "good", "critical", "neutral", "warning", "neutral"][i] || "neutral",
        })).filter((x) => x.count))}
      </section>
      <section class="card"><h2>حسب الحالة</h2>
        ${distBar([
          { label: "بانتظار/قيد المراجعة", count: pending.length, role: "warning" },
          { label: "معتمد / لا تعارض", count: all.filter((d) => d.status === "APPROVED").length, role: "good" },
          { label: "معالَج بإجراء", count: all.filter((d) => d.status === "MITIGATED").length, role: "good" },
          { label: "مرفوض", count: all.filter((d) => d.status === "REJECTED").length, role: "critical" },
        ])}
      </section>
    </div>
    <section class="card">
      <div class="row filters">
        <input type="text" id="f-search" class="grow" placeholder="بحث بالرمز أو المُفصِح أو الموضوع…" value="${esc(filters.search)}" />
        ${sel("f-type", DISCLOSURE_TYPES, filters.type, { empty: "كل الأنواع" })}
        ${sel("f-status", DISCLOSURE_STATUS, filters.status, { empty: "كل الحالات" })}
        ${sel("f-dept", deptOptions(), filters.dept, { empty: "كل الإدارات" })}
      </div>
      <div style="overflow-x:auto">
        <table>
          <thead><tr>
            <th>الرقم</th><th>النوع</th><th>الموضوع</th><th>المُفصِح</th><th>الإدارة</th><th>التاريخ</th><th>القيمة</th><th>الحالة</th>
          </tr></thead>
          <tbody>
            ${rows
              .map((d) => `<tr class="rowlink" data-open="${d.id}">
                <td><strong>${esc(d.code)}</strong></td>
                <td>${TYPE_ICON[d.type] || "📄"} ${esc(DISCLOSURE_TYPES[d.type] || d.type)}</td>
                <td><strong>${esc(d.title)}</strong><div class="muted clamp">${esc(d.description || "")}</div></td>
                <td>${esc(d.discloserName || userName(d.discloserId))}</td>
                <td>${esc(deptName(d.departmentId))}</td>
                <td>${fmtDate(d.date)}</td>
                <td>${d.value ? esc(fmtSAR(d.value)) : "—"}</td>
                <td>${statusBadgeFrom(DISCLOSURE_STATUS, d.status, ST_ROLE)}</td>
              </tr>`)
              .join("") || `<tr><td colspan="8">${emptyMsg("لا توجد إفصاحات مطابقة")}</td></tr>`}
          </tbody>
        </table>
      </div>
      <p class="muted">عدد النتائج: ${rows.length} من ${all.length}</p>
    </section>`;

  const rerender = () => renderDisclosures(el, nav, refresh);
  $("#f-search", el).addEventListener("input", (e) => { filters.search = e.target.value; keepFocus(rerender); });
  $("#f-type", el).onchange = (e) => { filters.type = e.target.value; rerender(); };
  $("#f-status", el).onchange = (e) => { filters.status = e.target.value; rerender(); };
  $("#f-dept", el).onchange = (e) => { filters.dept = e.target.value; rerender(); };
  $("#add-disc", el)?.addEventListener("click", () => openForm(null, rerender));
  el.querySelectorAll("[data-open]").forEach((tr) =>
    tr.addEventListener("click", () => openDetail(tr.dataset.open, nav, rerender))
  );
}

function openForm(d, done) {
  const isNew = !d;
  const ov = modal(
    `
    <h2>${isNew ? "تسجيل إفصاح جديد" : `تعديل ${esc(d.code)}`}</h2>
    <div class="form-grid">
      ${fld("موضوع الإفصاح *", txt("d-title", d?.title, "مثال: هدية من مورّد بمناسبة التعاقد"))}
      ${fld("نوع الإفصاح", sel("d-type", DISCLOSURE_TYPES, d?.type || "CONFLICT"))}
      ${fld("اسم المُفصِح", txt("d-name", d?.discloserName))}
      ${fld("المُفصِح (مستخدم النظام)", sel("d-user", userOptions(), d?.discloserId, { empty: "— اختياري —" }))}
      ${fld("الإدارة", sel("d-dept", deptOptions(), d?.departmentId, { empty: "— اختر —" }))}
      ${fld("تاريخ الإفصاح", dateInp("d-date", d?.date))}
      ${fld("القيمة التقديرية (ريال)", `<input type="number" id="d-value" min="0" step="100" value="${d?.value ?? ""}" placeholder="للهدايا والمصالح المالية" />`)}
      ${fld("الطرف ذو العلاقة", txt("d-party", d?.relatedParty, "الجهة/الشخص محل الإفصاح"))}
      ${fld("الحالة", sel("d-status", DISCLOSURE_STATUS, d?.status || "PENDING"))}
    </div>
    ${fld("تفاصيل الإفصاح", area("d-desc", d?.description, "", 3))}
    ${fld("قرار / إجراء المعالجة", area("d-decision", d?.decision, "قرار مسؤول الالتزام والإجراء المتخذ", 2))}
    <div class="row" style="margin-top:14px">
      <button id="d-save">حفظ</button>
      <button class="secondary" id="d-cancel">إلغاء</button>
    </div>`,
    { wide: true }
  );
  $("#d-cancel", ov).onclick = () => ov.remove();
  $("#d-save", ov).onclick = async () => {
    const title = val("d-title", ov);
    if (!title) return toast("موضوع الإفصاح إلزامي", true);
    const data = {
      title,
      type: val("d-type", ov),
      discloserName: val("d-name", ov) || null,
      discloserId: val("d-user", ov) || null,
      departmentId: val("d-dept", ov) || null,
      date: isoFromInput(val("d-date", ov)),
      value: val("d-value", ov) ? Number(val("d-value", ov)) : null,
      relatedParty: val("d-party", ov) || null,
      status: val("d-status", ov),
      description: val("d-desc", ov),
      decision: val("d-decision", ov),
    };
    try {
      if (isNew) {
        const code = await db.nextCode("DSC");
        await db.setRow("disclosures", code, { ...data, code, createdById: store.user.uid, createdAt: db.now(), updatedAt: db.now() });
        await db.audit("CREATE", "Disclosure", code, `تسجيل إفصاح: ${code} — ${title}`);
        await db.notify({
          title: "إفصاح جديد بانتظار المراجعة",
          message: `${code} — ${DISCLOSURE_TYPES[data.type]}: ${title}`,
          type: "DISCLOSURE_NEW",
          link: "disclosures",
          roleTarget: "COMPLIANCE_MANAGER",
        });
      } else {
        await db.updateRow("disclosures", d.id, data);
        await db.audit("UPDATE", "Disclosure", d.code, `تعديل الإفصاح ${d.code}`);
      }
      await reload("disclosures", "notifications");
      ov.remove();
      toast("تم الحفظ");
      done();
    } catch (err) {
      toast(err.message, true);
    }
  };
}

export function openDetail(id, nav, done) {
  const d = store.disclosures.find((x) => x.id === id);
  if (!d) return;
  const editable = canEdit(store.user);
  const approver = canApprove(store.user);

  const ov = modal(
    `
    <div class="row" style="justify-content:space-between">
      <h2>${TYPE_ICON[d.type] || "📄"} ${esc(d.code)} — ${esc(d.title)}</h2>
      <span>${statusBadgeFrom(DISCLOSURE_STATUS, d.status, ST_ROLE)}</span>
    </div>
    <div class="detail-grid">
      <div><span class="muted">النوع</span><br/>${esc(DISCLOSURE_TYPES[d.type] || d.type)}</div>
      <div><span class="muted">المُفصِح</span><br/>${esc(d.discloserName || userName(d.discloserId))}</div>
      <div><span class="muted">الإدارة</span><br/>${esc(deptName(d.departmentId))}</div>
      <div><span class="muted">التاريخ</span><br/>${fmtDate(d.date)}</div>
      <div><span class="muted">القيمة التقديرية</span><br/>${d.value ? esc(fmtSAR(d.value)) : "—"}</div>
      <div><span class="muted">الطرف ذو العلاقة</span><br/>${esc(d.relatedParty || "—")}</div>
    </div>
    ${d.description ? `<p class="pre-line"><strong>التفاصيل:</strong> ${esc(d.description)}</p>` : ""}
    ${d.decision ? `<p class="pre-line"><strong>القرار / الإجراء:</strong> ${esc(d.decision)}</p>` : ""}
    <div class="row" style="margin-top:14px">
      ${editable ? '<button id="d-edit" title="تعديل بيانات الإفصاح">تعديل</button>' : ""}
      ${approver && ["PENDING", "UNDER_REVIEW"].includes(d.status) ? `
        <button class="secondary" id="d-approve" title="اعتماد الإفصاح — لا يوجد تعارض">✔ اعتماد</button>
        <button class="secondary" id="d-mitigate" title="إغلاق الإفصاح بإجراء معالجة">🛡 معالجة بإجراء</button>
        <button class="danger" id="d-reject" title="رفض الإفصاح">✕ رفض</button>` : ""}
      ${editable ? '<button class="danger" id="d-del" title="حذف الإفصاح">حذف</button>' : ""}
      <button class="secondary" id="d-close" title="إغلاق النافذة">إغلاق</button>
    </div>`,
    { wide: true }
  );

  $("#d-close", ov).onclick = () => ov.remove();
  $("#d-edit", ov)?.addEventListener("click", () => { ov.remove(); openForm(d, done); });
  const setStatus = async (status, label) => {
    await db.updateRow("disclosures", d.id, { status });
    await db.audit("REVIEW", "Disclosure", d.code, `${label} الإفصاح ${d.code}`);
    await reload("disclosures");
    ov.remove();
    toast(label);
    done();
  };
  $("#d-approve", ov)?.addEventListener("click", () => setStatus("APPROVED", "اعتُمد الإفصاح"));
  $("#d-mitigate", ov)?.addEventListener("click", () => setStatus("MITIGATED", "عولج بإجراء"));
  $("#d-reject", ov)?.addEventListener("click", () => setStatus("REJECTED", "رُفض الإفصاح"));
  $("#d-del", ov)?.addEventListener("click", async () => {
    ov.remove();
    if (!(await confirmBox(`حذف الإفصاح ${d.code}؟`))) return;
    await db.removeRow("disclosures", d.id);
    await db.audit("DELETE", "Disclosure", d.code, `حذف الإفصاح ${d.code} — ${d.title}`);
    await reload("disclosures");
    toast("تم الحذف");
    done();
  });
}
