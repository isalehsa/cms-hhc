// المصادقة عبر Firebase Authentication — الدور من وثيقة users/{uid}
// يدعم مخطط النظام السابق: {name, role: ADMIN|COMPLIANCE_MANAGER|…, departmentId, active}
import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { app } from "./db.js";
import { firebaseConfig } from "./firebase-config.js";
import { EDITOR_ROLES, APPROVER_ROLES } from "./meta.js";

const auth = app ? getAuth(app) : null;

const AUTH_ERRORS = {
  "auth/invalid-credential": "البريد الإلكتروني أو كلمة المرور غير صحيحة",
  "auth/invalid-email": "صيغة البريد الإلكتروني غير صحيحة",
  "auth/user-disabled": "هذا الحساب معطَّل",
  "auth/too-many-requests": "محاولات كثيرة متتالية — انتظر قليلاً ثم أعد المحاولة",
  "auth/network-request-failed": "تعذّر الاتصال بالخادم — تحقق من اتصالك بالإنترنت",
};

async function buildProfile(fbUser) {
  let data = {};
  try {
    const snap = await getDoc(doc(getFirestore(app), "users", fbUser.uid));
    if (snap.exists()) data = snap.data();
  } catch {
    // بلا وثيقة دور يُعامل المستخدم كمراجع (قراءة فقط)
  }
  // توحيد الدور: النظام القديم بأحرف كبيرة، وثائق أقدم بصيغة compliance_manager
  const role = String(data.role || "AUDITOR").toUpperCase();
  return {
    uid: fbUser.uid,
    email: fbUser.email,
    role,
    name: data.name || data.display_name || fbUser.email,
    departmentId: data.departmentId || null,
    active: data.active !== false,
  };
}

export const canEdit = (u) => EDITOR_ROLES.includes(u?.role);
export const canApprove = (u) => APPROVER_ROLES.includes(u?.role);
export const isDeptOwner = (u) => u?.role === "DEPT_OWNER";

export async function login(email, password) {
  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    return await buildProfile(cred.user);
  } catch (err) {
    throw new Error(AUTH_ERRORS[err.code] || `تعذّر تسجيل الدخول (${err.code || err.message})`);
  }
}

export function logout() {
  return signOut(auth);
}

// إنشاء حساب دخول جديد (بريد/كلمة مرور) دون إخراج المدير الحالي من جلسته:
// نستخدم نسخة Firebase ثانوية مؤقتة لأن إنشاء الحساب على النسخة الرئيسية يبدّل المستخدم النشط
export async function createAuthUser(email, password) {
  const secondary = initializeApp(firebaseConfig, `sec-${Date.now()}`);
  try {
    const secAuth = getAuth(secondary);
    const cred = await createUserWithEmailAndPassword(secAuth, email, password);
    await signOut(secAuth).catch(() => {});
    return cred.user.uid;
  } catch (err) {
    const map = {
      "auth/email-already-in-use": "البريد مستخدم لحساب موجود — استخدم «إضافة مستخدم بمعرّف UID» بدلاً من إنشاء حساب جديد",
      "auth/invalid-email": "صيغة البريد الإلكتروني غير صحيحة",
      "auth/weak-password": "كلمة المرور ضعيفة — استخدم 6 أحرف على الأقل",
      "auth/network-request-failed": "تعذّر الاتصال بالخادم — تحقق من اتصالك بالإنترنت",
      "auth/operation-not-allowed": "تسجيل الدخول بالبريد/كلمة المرور غير مفعّل في مشروع Firebase — فعّله من Authentication ← Sign-in method",
    };
    throw new Error(map[err.code] || `تعذّر إنشاء الحساب (${err.code || err.message})`);
  } finally {
    await deleteApp(secondary).catch(() => {});
  }
}

export function onAuth(cb) {
  onAuthStateChanged(auth, async (fbUser) => {
    cb(fbUser ? await buildProfile(fbUser) : null);
  });
}
