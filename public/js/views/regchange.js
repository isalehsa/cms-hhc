// سجل التغيّر التنظيمي — يرصد الأنظمة/اللوائح/التعاميم الجديدة أو المعدّلة،
// ويربطها آلياً بالمتطلبات المتأثرة (عبر محرك التشابه القائم) ومخاطرها،
// ثم يولّد مهام مراجعة (تحديث حالة المتطلب + مبادرة في الخطة السنوية).
import { store, reload, authName, authOptions } from "../state.js";
import * as db from "../db.js";
import {
  $, esc, toast, modal, confirmBox, fld, txt, area, sel, dateInp, val,
  fmtDate, isoFromInput, statusBadgeFrom, emptyMsg, keepFocus, chip,
} from "../ui.js";
import { REGCHANGE_TYPES, REGCHANGE_STATUS, REGCHANGE_ROLE } from "../meta.js";
import { rankBySimilarity } from "../similarity.js";
import { canEdit } from "../auth.js";

const filters = { search: "", type: "", status: "", authority: "" };

// نص المتطلب القابل للمقارنة
const reqText = (r) => `${r.title || ""} ${r.summary || ""} ${r.penalty || ""}`;

// حساب المتطلبات المتأثرة بتغيّر تنظيمي عبر التشابه النصي
function computeAffected(text, limit = 12) {
  const ranked = rankBySimilarity(text, store.requirements.filter((r) => r.status !== "CANCELLED"), reqText, { limit, threshold: 0.1 });
  return ranked.map((x) => ({ id: x.item.id, code: x.item.code, title: x.item.title, score: x.score }));
}

export function renderRegChange(el, nav, refresh) {
  const editable = canEdit(store.user);
  const all = store.regChanges;
  const rows = all.filter((c) => {
    if (filters.search && !`${c.code} ${c.title} ${c.summary || ""}`.includes(filters.search)) return false;
    if (filters.type && c.changeType !== filters.type) return false;
    if (filters.status && c.status !== filters.status) return false;
    if (filters.authority && c.authorityId !== filters.authority) return false;
    return true;
  }).sort((a, b) => (b.effectiveDate || b.createdAt || "").localeCompare(a.effectiveDate || a.createdAt || ""));

  const pending = all.filter((c) => c.status === "NEW");
  const impacted = all.filter((c) => c.status === "IMPACTED");

  el.innerHTML = `
    <div class="page-head">
      <h1>🔔 سجل التغيّر التنظيمي</h1>
      ${editable ? '<button id="add-rc" title="تسجيل تغيّر تنظيمي جديد (نظام/تعديل/تعميم)">＋ تغيّر جديد</button>' : ""}
    </div>
    <p class="muted">تسجيل الأنظمة والتعاميم الجديدة أو المعدّلة، وربطها آلياً بالمتطلبات والمخاطر المتأثرة، وتوليد مهام المراجعة.</p>
    <div class="stats">
      <div class="stat"><div class="num">${all.length}</div><div class="lbl">إجمالي التغييرات</div></div>
      <div class="stat"><div class="num">${pending.length}</div><div class="lbl">بانتظار تقييم الأثر</div></div>
      <div class="stat"><div class="num">${impacted.length}</div><div class="lbl">حُدّد أثرها</div></div>
      <div class="stat"><div class="num">${all.reduce((s, c) => s + (c.affected?.length || 0), 0)}</div><div class="lbl">ارتباطات بمتطلبات</div></div>
    </div>
    <section class="card">
      <div class="row filters">
        <input type="text" id="f-search" class="grow" placeholder="بحث بالرمز أو العنوان…" value="${esc(filters.search)}" />
        ${sel("f-type", REGCHANGE_TYPES, filters.type, { empty: "كل الأنواع" })}
        ${sel("f-status", REGCHANGE_STATUS, filters.status, { empty: "كل الحالات" })}
        ${sel("f-auth", authOptions(), filters.authority, { empty: "كل الجهات" })}
      </div>
      <div style="overflow-x:auto">
        <table>
          <thead><tr>
            <th>الرقم</th><th>النوع</th><th>العنوان</th><th>الجهة</th><th>النفاذ</th>
            <th>متطلبات متأثرة</th><th>الحالة</th>
          </tr></thead>
          <tbody>
            ${rows.map((c) => `<tr class="rowlink" data-open="${c.id}">
              <td><strong>${esc(c.code)}</strong></td>
              <td>${esc(REGCHANGE_TYPES[c.changeType] || c.changeType)}</td>
              <td><strong>${esc(c.title)}</strong></td>
              <td>${esc(c.authorityId ? authName(c.authorityId) : "—")}</td>
              <td>${fmtDate(c.effectiveDate)}</td>
              <td>${c.affected?.length ? chip(`${c.affected.length} متطلب`) : '<span class="muted">لم يُقيَّم</span>'}</td>
              <td>${statusBadgeFrom(REGCHANGE_STATUS, c.status, REGCHANGE_ROLE)}</td>
            </tr>`).join("") || `<tr><td colspan="7">${emptyMsg("لا توجد تغييرات مطابقة")}</td></tr>`}
          </tbody>
        </table>
      </div>
      <p class="muted">عدد النتائج: ${rows.length} من ${all.length}</p>
    </section>`;

  const rerender = () => renderRegChange(el, nav, refresh);
  $("#f-search", el).addEventListener("input", (e) => { filters.search = e.target.value; keepFocus(rerender); });
  $("#f-type", el).onchange = (e) => { filters.type = e.target.value; rerender(); };
  $("#f-status", el).onchange = (e) => { filters.status = e.target.value; rerender(); };
  $("#f-auth", el).onchange = (e) => { filters.authority = e.target.value; rerender(); };
  $("#add-rc", el)?.addEventListener("click", () => openForm(null, rerender));
  el.querySelectorAll("[data-open]").forEach((tr) =>
    tr.addEventListener("click", () => openDetail(tr.dataset.open, nav, rerender))
  );
}

function openForm(c, done) {
  const isNew = !c;
  const ov = modal(`
    <h2>${isNew ? "تسجيل تغيّر تنظيمي" : `تعديل ${esc(c.code)}`}</h2>
    <div class="form-grid">
      ${fld("عنوان التغيّر *", txt("c-title", c?.title, "مثال: تعديل لائحة حماية البيانات الشخصية"))}
      ${fld("النوع", sel("c-type", REGCHANGE_TYPES, c?.changeType || "AMENDMENT"))}
      ${fld("الجهة المصدرة", sel("c-auth", authOptions(), c?.authorityId, { empty: "— اختر —" }))}
      ${fld("تاريخ النفاذ", dateInp("c-eff", c?.effectiveDate))}
      ${fld("رابط المصدر", txt("c-url", c?.sourceUrl, "https://…"))}
    </div>
    ${fld("ملخّص التغيّر / النص *", area("c-text", c?.summary, "صف التغيّر ومضمونه لربطه بالمتطلبات المتأثرة…", 6))}
    <p class="muted">عند الحفظ يُحلَّل النص آلياً لاقتراح المتطلبات المتأثرة عبر محرك التشابه.</p>
    <div class="row" style="margin-top:14px">
      <button id="c-save">حفظ وتحليل الأثر</button>
      <button class="secondary" id="c-cancel">إلغاء</button>
    </div>`, { wide: true });
  $("#c-cancel", ov).onclick = () => ov.remove();
  $("#c-save", ov).onclick = async () => {
    const title = val("c-title", ov);
    const summary = val("c-text", ov);
    if (!title) return toast("عنوان التغيّر إلزامي", true);
    if (!summary) return toast("ملخّص/نص التغيّر إلزامي", true);
    const affected = computeAffected(`${title} ${summary}`);
    const data = {
      title,
      changeType: val("c-type", ov),
      authorityId: val("c-auth", ov) || null,
      effectiveDate: isoFromInput(val("c-eff", ov)),
      sourceUrl: val("c-url", ov) || null,
      summary,
      affected,
    };
    try {
      if (isNew) {
        const code = await db.nextCode("RCH");
        await db.setRow("regChanges", code, {
          ...data, code, status: "NEW", reviewTasksCreated: false,
          createdById: store.user.uid, createdAt: db.now(), updatedAt: db.now(),
        });
        await db.audit("CREATE", "RegChange", code, `تسجيل تغيّر تنظيمي: ${code} — ${title} (${affected.length} متطلب متأثر)`);
        await db.notify({
          title: "تغيّر تنظيمي جديد",
          message: `${code} — ${title}: رُصد ${affected.length} متطلب قد يتأثر`,
          type: "REGCHANGE_NEW", link: "regchange", roleTarget: "COMPLIANCE_MANAGER",
        });
      } else {
        await db.updateRow("regChanges", c.id, { ...data, status: c.status === "IMPACTED" ? "IMPACTED" : c.status });
        await db.audit("UPDATE", "RegChange", c.code, `تعديل التغيّر التنظيمي ${c.code}`);
      }
      await reload("regChanges", "notifications");
      ov.remove();
      toast(`حُفظ — رُبط بـ ${affected.length} متطلب متأثر`);
      done();
    } catch (err) {
      toast(err.message, true);
    }
  };
}

export function openDetail(id, nav, done) {
  const c = store.regChanges.find((x) => x.id === id);
  if (!c) return;
  const editable = canEdit(store.user);
  const affected = c.affected || [];
  // المخاطر المتأثرة = مخاطر مرتبطة بأي متطلب متأثر
  const affReqIds = new Set(affected.map((a) => a.id));
  const affectedRisks = store.risks.filter((r) => affReqIds.has(r.requirementId));

  const ov = modal(`
    <div class="row" style="justify-content:space-between">
      <h2>🔔 ${esc(c.code)} — ${esc(c.title)}</h2>
      <span>${statusBadgeFrom(REGCHANGE_STATUS, c.status, REGCHANGE_ROLE)}</span>
    </div>
    <div class="detail-grid">
      <div><span class="muted">النوع</span><br/>${esc(REGCHANGE_TYPES[c.changeType] || c.changeType)}</div>
      <div><span class="muted">الجهة</span><br/>${esc(c.authorityId ? authName(c.authorityId) : "—")}</div>
      <div><span class="muted">تاريخ النفاذ</span><br/>${fmtDate(c.effectiveDate)}</div>
    </div>
    ${c.summary ? `<p class="pre-line"><strong>الملخّص:</strong>\n${esc(c.summary)}</p>` : ""}
    ${c.sourceUrl ? `<p>🔗 <a href="${esc(c.sourceUrl)}" target="_blank" rel="noopener">المصدر</a></p>` : ""}

    <h3 style="margin:12px 0 6px">المتطلبات المتأثرة (${affected.length})</h3>
    ${affected.length ? `<div class="link-list">${affected.map((a) => `<div class="link-item" data-req="${esc(a.id)}" style="display:flex;justify-content:space-between">
      <span><strong>${esc(a.code)}</strong> ${esc((a.title || "").slice(0, 70))}</span>
      <span class="muted">تشابه ${Math.round(a.score * 100)}%</span></div>`).join("")}</div>`
      : emptyMsg("لم تُرصد متطلبات متأثرة — عدّل النص وأعد التحليل")}

    <h3 style="margin:12px 0 6px">المخاطر المتأثرة (${affectedRisks.length})</h3>
    ${affectedRisks.length ? `<div class="link-list">${affectedRisks.slice(0, 20).map((r) => `<div class="link-item" data-risknav="1"><strong>${esc(r.code)}</strong> ${esc((r.title || "").slice(0, 70))}</div>`).join("")}</div>`
      : '<p class="muted">لا مخاطر مرتبطة بالمتطلبات المتأثرة.</p>'}

    ${c.reviewTasksCreated ? '<p class="lvl lvl-good" style="margin-top:12px"><span class="dot"></span>أُنشئت مهام المراجعة</p>' : ""}

    <div class="row" style="margin-top:14px">
      ${editable ? `
        <button id="c-edit" title="تعديل التغيّر وإعادة تحليل الأثر">تعديل</button>
        <button id="c-recompute" class="secondary" title="إعادة حساب المتطلبات المتأثرة بمحرك التشابه">↻ إعادة تحليل الأثر</button>
        ${!c.reviewTasksCreated && affected.length ? '<button id="c-tasks" title="تحديث حالة المتطلبات المتأثرة وإنشاء مبادرة مراجعة في الخطة">✅ توليد مهام المراجعة</button>' : ""}
        ${c.status !== "CLOSED" ? '<button class="secondary" id="c-close" title="إغلاق التغيّر بعد استكمال مراجعته">إغلاق</button>' : ""}
        <button class="danger" id="c-del" title="حذف السجل">حذف</button>` : ""}
      <button class="secondary" id="c-close-modal" title="إغلاق النافذة">إغلاق</button>
    </div>`, { wide: true });

  $("#c-close-modal", ov).onclick = () => ov.remove();
  ov.querySelectorAll("[data-req]").forEach((n) => n.addEventListener("click", () => { ov.remove(); nav("library"); }));
  ov.querySelectorAll("[data-risknav]").forEach((n) => n.addEventListener("click", () => { ov.remove(); nav("risks"); }));
  $("#c-edit", ov)?.addEventListener("click", () => { ov.remove(); openForm(c, done); });
  $("#c-recompute", ov)?.addEventListener("click", async () => {
    const affectedNew = computeAffected(`${c.title} ${c.summary}`);
    await db.updateRow("regChanges", c.id, { affected: affectedNew });
    await db.audit("UPDATE", "RegChange", c.code, `إعادة تحليل الأثر للتغيّر ${c.code} (${affectedNew.length} متطلب)`);
    await reload("regChanges");
    ov.remove();
    toast(`أُعيد التحليل — ${affectedNew.length} متطلب متأثر`);
    done();
  });
  $("#c-tasks", ov)?.addEventListener("click", async () => {
    if (!(await confirmBox(`سيتم تعليم ${affected.length} متطلب كـ«تحت المراجعة» وإنشاء مبادرة مراجعة في الخطة. متابعة؟`))) return;
    ov.remove();
    await generateReviewTasks(c, affected);
    done();
  });
  $("#c-close", ov)?.addEventListener("click", async () => {
    await db.updateRow("regChanges", c.id, { status: "CLOSED" });
    await db.audit("UPDATE", "RegChange", c.code, `إغلاق التغيّر التنظيمي ${c.code}`);
    await reload("regChanges");
    ov.remove();
    toast("أُغلق التغيّر");
    done();
  });
  $("#c-del", ov)?.addEventListener("click", async () => {
    ov.remove();
    if (!(await confirmBox(`حذف التغيّر التنظيمي ${c.code}؟`))) return;
    await db.removeRow("regChanges", c.id);
    await db.audit("DELETE", "RegChange", c.code, `حذف التغيّر التنظيمي ${c.code}`);
    await reload("regChanges");
    toast("تم الحذف");
    done();
  });
}

// توليد مهام المراجعة: تحديث حالة المتطلبات المتأثرة + مبادرة في الخطة السنوية
async function generateReviewTasks(c, affected) {
  const due = c.effectiveDate || new Date(Date.now() + 30 * 86400000).toISOString();
  try {
    // 1) كل متطلب متأثر → تحت المراجعة مع موعد مراجعة (يظهر في التقويم والتنبيهات)
    for (const a of affected) {
      await db.updateRow("requirements", a.id, { status: "UNDER_REVIEW", nextReviewDate: due }).catch(() => {});
    }
    // 2) مبادرة مراجعة واحدة في الخطة السنوية (محور الإرشاد — متابعة تنظيمية)
    const now = new Date(due);
    await db.addRow("planItems", {
      title: `مراجعة أثر التغيّر التنظيمي: ${c.title}`,
      axis: "GUIDANCE",
      planType: "REGULATORY",
      year: now.getFullYear(),
      quarter: Math.floor(now.getMonth() / 3) + 1,
      departmentId: null,
      ownerId: null,
      source: "REGULATORY",
      requirementId: affected[0]?.id || null,
      riskId: null,
      monitoringId: null,
      status: "NOT_STARTED",
      progress: 0,
      evidenceUrl: c.sourceUrl || null,
      expectedOutput: `تقييم أثر «${c.title}» على ${affected.length} متطلب وتحديثها وفق المتطلب الجديد قبل ${fmtDate(due)}`,
      regChangeId: c.id,
      createdAt: db.now(),
      updatedAt: db.now(),
    });
    await db.updateRow("regChanges", c.id, { status: "IMPACTED", reviewTasksCreated: true, reviewTasksAt: db.now() });
    await db.audit("CREATE", "RegChange", c.code, `توليد مهام مراجعة للتغيّر ${c.code}: ${affected.length} متطلب تحت المراجعة + مبادرة خطة`);
    await db.notify({
      title: "مهام مراجعة تنظيمية",
      message: `${c.code} — ${c.title}: ${affected.length} متطلب أصبح تحت المراجعة`,
      type: "REGCHANGE_TASKS", link: "plan", roleTarget: "COMPLIANCE_MANAGER",
    });
    await reload("regChanges", "requirements", "planItems", "notifications");
    toast(`أُنشئت مهام المراجعة لـ ${affected.length} متطلب`);
  } catch (err) {
    toast(err.message, true);
  }
}
