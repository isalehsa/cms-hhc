// إعدادات مشروع Firebase — الصق هنا إعدادات مشروعك من:
// Firebase Console → Project settings → Your apps → SDK setup and configuration
// هذه القيم عامة وغير سرية (الحماية الفعلية عبر قواعد أمان Firestore)
export const firebaseConfig = {
  apiKey: "YOUR_FIREBASE_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.firebasestorage.app",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
};

// هل ما زالت الإعدادات على القيم المبدئية؟ (تعرض الواجهة شاشة إرشاد بدل الانهيار)
export const configReady = !Object.values(firebaseConfig).some((v) =>
  String(v).startsWith("YOUR_")
);
