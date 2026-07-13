// المصادقة عبر Firebase Authentication (بريد إلكتروني وكلمة مرور)
// الدور والاسم المعروض يُقرآن من وثيقة users/{uid} في Firestore (تُنشأ من لوحة Firebase — انظر README)
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { app } from "./db.js";

const auth = app ? getAuth(app) : null;

const AUTH_ERRORS = {
  "auth/invalid-credential": "البريد الإلكتروني أو كلمة المرور غير صحيحة",
  "auth/invalid-email": "صيغة البريد الإلكتروني غير صحيحة",
  "auth/user-disabled": "هذا الحساب معطَّل",
  "auth/too-many-requests": "محاولات كثيرة متتالية — انتظر قليلاً ثم أعد المحاولة",
  "auth/network-request-failed": "تعذّر الاتصال بالخادم — تحقق من اتصالك بالإنترنت",
};

async function buildProfile(fbUser) {
  let role = "viewer";
  let displayName = fbUser.email;
  try {
    const snap = await getDoc(doc(getFirestore(app), "users", fbUser.uid));
    if (snap.exists()) {
      const data = snap.data();
      role = data.role || "viewer";
      displayName = data.display_name || fbUser.email;
    }
  } catch {
    // بلا وثيقة دور (أو تعذّرت قراءتها) يُعامل المستخدم كمستعرض
  }
  return { uid: fbUser.uid, email: fbUser.email, role, display_name: displayName };
}

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

// يستدعي cb بالملف الشخصي عند الدخول و null عند الخروج
export function onAuth(cb) {
  onAuthStateChanged(auth, async (fbUser) => {
    cb(fbUser ? await buildProfile(fbUser) : null);
  });
}
