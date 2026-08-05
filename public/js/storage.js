// طبقة تخزين الملفات على Firebase Storage — تُستخدم لرفع أدلة تقييم النضج
// الملفات تُخزَّن في المخزن ويُحفظ في Firestore رابط التنزيل فقط (لتفادي حد 1 م.ب للوثيقة)
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";
import { app } from "./db.js";

const storage = app ? getStorage(app) : null;

// أقصى حجم لملف الدليل الواحد (25 م.ب) — متوافق مع قواعد أمان التخزين
export const MAX_EVIDENCE_SIZE = 25 * 1024 * 1024;

// رفع ملف إلى مسار محدد؛ يعيد { url, name, path } لتخزينها في الوثيقة
export async function uploadFile(path, file) {
  if (!storage) throw new Error("خدمة التخزين غير متاحة — تحقق من إعدادات Firebase");
  if (file.size > MAX_EVIDENCE_SIZE) {
    throw new Error("حجم الملف يتجاوز الحد المسموح (25 م.ب)");
  }
  try {
    const r = ref(storage, path);
    const snap = await uploadBytes(r, file, {
      contentType: file.type || "application/octet-stream",
    });
    const url = await getDownloadURL(snap.ref);
    return { url, name: file.name, path };
  } catch (err) {
    if (err?.code === "storage/unauthorized") {
      throw new Error("لا تملك صلاحية رفع الملفات — تأكد من نشر قواعد التخزين (storage.rules)");
    }
    throw new Error(`تعذّر رفع الملف (${err?.code || err?.message || "خطأ غير معروف"})`);
  }
}

// حذف ملف سابق (يتجاهل الأخطاء إن لم يعد الملف موجوداً)
export async function deleteFile(path) {
  if (!storage || !path) return;
  try {
    await deleteObject(ref(storage, path));
  } catch {
    /* الملف غير موجود أو لا صلاحية — تجاهل */
  }
}
