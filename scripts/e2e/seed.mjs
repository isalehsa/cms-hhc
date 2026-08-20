// بذر بيانات تطوير في محاكيات Firebase للاختبار اليدوي والآلي (لا يُشغَّل على الإنتاج)
// يتطلب تشغيل: firebase emulators:start --only auth,firestore,hosting
process.env.FIRESTORE_EMULATOR_HOST ||= "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= "127.0.0.1:9099";

const { createRequire } = await import("node:module");
const require = createRequire(import.meta.url + "/../../../functions/");
const admin = require("firebase-admin");

if (!process.env.FIRESTORE_EMULATOR_HOST.startsWith("127.0.0.1")) {
  throw new Error("يرفض السكربت العمل خارج المحاكي");
}

admin.initializeApp({ projectId: "cms-hhc" });
const db = admin.firestore();
const auth = admin.auth();

const now = () => new Date().toISOString();

const USER = { email: "manager@cms.test", password: "Test1234!", name: "مدير الالتزام (اختبار)", role: "COMPLIANCE_MANAGER" };

let uid;
try {
  uid = (await auth.getUserByEmail(USER.email)).uid;
} catch {
  uid = (await auth.createUser({ email: USER.email, password: USER.password, displayName: USER.name })).uid;
}
await db.doc(`users/${uid}`).set({ name: USER.name, role: USER.role, departmentId: null, email: USER.email, active: true });

const depts = [
  { id: "dept-compliance", name: "الالتزام", sector: "الجهات الإشرافية والرقابية", type: "DEPARTMENT", active: true },
  { id: "dept-cyber", name: "الأمن السيبراني", sector: "الجهات الإشرافية والرقابية", type: "DEPARTMENT", active: true },
  { id: "dept-hr", name: "عمليات الموارد البشرية", sector: "رأس المال البشري", type: "DEPARTMENT", active: true },
];
for (const d of depts) await db.doc(`departments/${d.id}`).set(d);

await db.doc("authorities/auth-moh").set({ name: "وزارة الصحة", active: true });
await db.doc("authorities/auth-sdaia").set({ name: "الهيئة السعودية للبيانات والذكاء الاصطناعي", active: true });

// متطلب قائم مسبقاً — للتحقق من عدم كسر البيانات الحالية ومن ربط الأثر بها
await db.doc("requirements/REQ-9001").set({
  code: "REQ-9001",
  title: "حماية البيانات الشخصية للمرضى في الأنظمة الصحية",
  summary: "الالتزام بضوابط حماية البيانات الشخصية ونظام حماية البيانات الشخصية ولائحته التنفيذية داخل المنشآت الصحية.",
  type: "REGULATION", category: "PRIVACY", criticality: "HIGH",
  authorityId: "auth-sdaia", ownerDeptId: "dept-cyber",
  issueDate: null, nextReviewDate: null, status: "ACTIVE",
  attachmentUrl: null, penalty: "", createdById: uid, approvedById: uid,
  lastUpdated: now(), createdAt: now(),
});
await db.doc("counters/REQ").set({ value: 9001 });

// مصدر رصد للاختبار (معطّل — لا يُجلب شيء فعلياً في هذا الاختبار)
await db.doc("regSources/src-test").set({
  name: "مصدر اختبار محلي", url: "https://example.gov.sa/feed", type: "RSS",
  sector: "الصحة", authorityId: "auth-moh", linkPattern: null, active: false,
  notes: "مصدر تطوير", lastScanAt: null, lastStatus: "NEVER", lastError: null,
  lastItemCount: 0, totalDetected: 0, createdById: uid, createdAt: now(), updatedAt: now(),
});

console.log(JSON.stringify({ uid, email: USER.email, password: USER.password }, null, 2));
process.exit(0);
