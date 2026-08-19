// محضر الاجتماع — تحرير مسودة المحضر (يُضاف التوقيع الإلكتروني والاعتماد في وحدة التوقيع)
import { store, reload, userName } from "../state.js";
import * as db from "../db.js";
import { $, esc, toast, modal, fld, area, val, fmtDateTime } from "../ui.js";
import { MINUTES_STATUS } from "../meta.js";
import { canEdit } from "../auth.js";

export const minutesBadgeRole = { NONE: "neutral", DRAFT: "warning", APPROVED: "good" };

// يبني قسم المحضر داخل نافذة تفاصيل الاجتماع
export function renderMinutes(container, m, ov, done) {
  if (!container) return;
  const editable = canEdit(store.user);
  const min = m.minutes || null;
  const status = min?.status || "NONE";

  container.innerHTML = `
    <div class="card" style="background:rgba(20,112,92,0.05);margin:12px 0">
      <div class="row" style="justify-content:space-between;align-items:flex-start">
        <h3 style="margin:0">📝 محضر الاجتماع</h3>
        <span class="lvl lvl-${minutesBadgeRole[status]}"><span class="dot"></span>${esc(MINUTES_STATUS[status])}</span>
      </div>
      ${min?.text ? `<p class="pre-line" style="margin-top:8px">${esc(min.text)}</p>` : '<p class="muted" style="margin-top:8px">لا يوجد محضر بعد.</p>'}
      ${min?.updatedAt ? `<p class="muted" style="font-size:0.8rem">آخر تحديث: ${fmtDateTime(min.updatedAt)}${min.authorId ? ` — ${esc(userName(min.authorId))}` : ""}</p>` : ""}
      ${editable && status !== "APPROVED" ? '<div class="row" style="margin-top:8px"><button class="secondary" id="min-edit" title="تحرير مسودة المحضر">✎ تحرير المحضر</button></div>' : ""}
    </div>`;

  $("#min-edit", container)?.addEventListener("click", () => openMinutesEditor(m, ov, done));
}

function openMinutesEditor(m, parentOv, done) {
  const min = m.minutes || {};
  const ed = modal(`
    <h2>✎ محضر الاجتماع — ${esc(m.code || m.title)}</h2>
    ${fld("نص المحضر", area("min-text", min.text, "القرارات والتوصيات وبنود المتابعة…", 12))}
    <p class="muted">بعد كتابة المحضر يمكن اعتماده وتوقيعه إلكترونياً من نافذة الاجتماع.</p>
    <div class="row" style="margin-top:14px">
      <button id="min-save">حفظ المسودة</button>
      <button class="secondary" id="min-cancel">إلغاء</button>
    </div>`, { wide: true });
  $("#min-cancel", ed).onclick = () => ed.remove();
  $("#min-save", ed).onclick = async () => {
    const text = val("min-text", ed);
    if (!text) return toast("نص المحضر فارغ", true);
    const minutes = {
      ...min,
      text,
      status: min.status === "APPROVED" ? "APPROVED" : "DRAFT",
      authorId: store.user.uid,
      updatedAt: db.now(),
    };
    try {
      await db.updateRow("meetings", m.id, { minutes });
      await db.audit("UPDATE", "Meeting", m.code, `تحديث مسودة محضر الاجتماع ${m.code}`);
      await reload("meetings");
      m.minutes = minutes; // تحديث النسخة المحلية لإعادة رسم القسم
      ed.remove();
      toast("حُفظت المسودة");
      // إعادة رسم قسم المحضر داخل نافذة التفاصيل المفتوحة
      renderMinutes($("#minutes-section", parentOv), m, parentOv, done);
    } catch (err) {
      toast(err.message, true);
    }
  };
}
