// إعدادات مشروع Firebase — الصق هنا إعدادات مشروعك من:
// Firebase Console → Project settings → Your apps → SDK setup and configuration
// هذه القيم عامة وغير سرية (الحماية الفعلية عبر قواعد أمان Firestore)
export const firebaseConfig = {
  apiKey: "AIzaSyACvF-I0-gfgVcaEukARaJ3RDdlKDfG0dw",
  authDomain: "cms-hhc.firebaseapp.com",
  projectId: "cms-hhc",
  storageBucket: "cms-hhc.firebasestorage.app",
  messagingSenderId: "749671451438",
  appId: "1:749671451438:web:8141e48c886a5fd3c708bf",
  measurementId: "G-CSTYFPFYFT",
};

// هل ما زالت الإعدادات على القيم المبدئية؟ (تعرض الواجهة شاشة إرشاد بدل الانهيار)
export const configReady = !Object.values(firebaseConfig).some((v) =>
  String(v).startsWith("YOUR_")
);
