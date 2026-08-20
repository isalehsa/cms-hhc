// التحقق من فرض قواعد أمان Firestore على مجموعات الرصد التنظيمي
// يُشغَّل مقابل محاكي Firestore بالقواعد الحقيقية من firestore.rules
import { readFileSync } from "node:fs";
import {
  initializeTestEnvironment, assertFails, assertSucceeds,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from "firebase/firestore";

const results = [];
const run = async (name, fn) => {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`✓ ${name}`);
  } catch (e) {
    results.push({ name, ok: false, detail: String(e.message).slice(0, 160) });
    console.log(`✗ ${name} — ${String(e.message).slice(0, 160)}`);
  }
};

const env = await initializeTestEnvironment({
  projectId: "cms-rules-test",
  firestore: { host: "127.0.0.1", port: 8080, rules: readFileSync("firestore.rules", "utf8") },
});
await env.clearFirestore();

// تهيئة وثائق الأدوار متجاوزين القواعد
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, "users/mgr"), { name: "مدير الالتزام", role: "COMPLIANCE_MANAGER", active: true });
  await setDoc(doc(db, "users/spec"), { name: "أخصائي", role: "SPECIALIST", active: true });
  await setDoc(doc(db, "users/aud"), { name: "مراجع", role: "AUDITOR", active: true });
  await setDoc(doc(db, "regSources/s1"), { name: "مصدر", url: "https://x.gov.sa", active: true });
  await setDoc(doc(db, "regUpdates/RGU-1"), { code: "RGU-1", title: "مستجد", status: "ANALYZED" });
  await setDoc(doc(db, "regReports/WK-1"), { id: "WK-1", total: 0 });
  await setDoc(doc(db, "regScans/SCAN-1"), { id: "SCAN-1", status: "COMPLETED" });
});

const asMgr = env.authenticatedContext("mgr").firestore();
const asSpec = env.authenticatedContext("spec").firestore();
const asAud = env.authenticatedContext("aud").firestore();
const asAnon = env.unauthenticatedContext().firestore();

await run("زائر غير مسجَّل لا يقرأ المستجدات", () => assertFails(getDoc(doc(asAnon, "regUpdates/RGU-1"))));
await run("زائر غير مسجَّل لا يقرأ المصادر", () => assertFails(getDoc(doc(asAnon, "regSources/s1"))));
await run("المراجع يقرأ المستجدات", () => assertSucceeds(getDoc(doc(asAud, "regUpdates/RGU-1"))));
await run("المراجع لا يعدّل المستجدات", () =>
  assertFails(updateDoc(doc(asAud, "regUpdates/RGU-1"), { status: "REJECTED" })));
await run("المراجع لا يضيف مصدر رصد", () =>
  assertFails(setDoc(doc(asAud, "regSources/s2"), { name: "x", active: true })));
await run("أخصائي الالتزام يضيف مصدر رصد", () =>
  assertSucceeds(setDoc(doc(asSpec, "regSources/s3"), { name: "مصدر أخصائي", url: "https://y.gov.sa", active: true })));
await run("أخصائي الالتزام يسجّل مستجداً جديداً", () =>
  assertSucceeds(setDoc(doc(asSpec, "regUpdates/RGU-2"), { code: "RGU-2", title: "جديد", status: "DETECTED" })));
await run("أخصائي الالتزام يحلّل مستجداً (تحديث غير اعتماد)", () =>
  assertSucceeds(updateDoc(doc(asSpec, "regUpdates/RGU-2"), { status: "ANALYZED", applicability: "APPLICABLE" })));
await run("أخصائي الالتزام لا يعتمد مستجداً (الاعتماد للمعتمِد وحده)", () =>
  assertFails(updateDoc(doc(asSpec, "regUpdates/RGU-2"), { status: "APPROVED" })));
await run("مدير الالتزام يعتمد المستجد", () =>
  assertSucceeds(updateDoc(doc(asMgr, "regUpdates/RGU-1"), { status: "APPROVED", reviewedById: "mgr" })));
await run("أخصائي الالتزام يحدّث مستجداً معتمداً دون تغيير حالته", () =>
  assertSucceeds(updateDoc(doc(asSpec, "regUpdates/RGU-1"), { reviewNotes: "ملاحظة" })));
await run("أخصائي الالتزام لا يحذف مستجداً", () => assertFails(deleteDoc(doc(asSpec, "regUpdates/RGU-1"))));
await run("مدير الالتزام يحذف مستجداً", () => assertSucceeds(deleteDoc(doc(asMgr, "regUpdates/RGU-2"))));
await run("سجل الفحص لا يُحذف إطلاقاً", () => assertFails(deleteDoc(doc(asMgr, "regScans/SCAN-1"))));
await run("المراجع لا ينشئ سجل فحص", () =>
  assertFails(setDoc(doc(asAud, "regScans/SCAN-2"), { id: "SCAN-2", status: "RUNNING" })));
await run("أخصائي الالتزام يحفظ تقريراً أسبوعياً", () =>
  assertSucceeds(setDoc(doc(asSpec, "regReports/WK-2"), { id: "WK-2", total: 1 })));
await run("المراجع لا يحفظ تقريراً أسبوعياً", () =>
  assertFails(setDoc(doc(asAud, "regReports/WK-3"), { id: "WK-3", total: 1 })));
// انحدار: القواعد القائمة لم تتأثر
await run("انحدار: المراجع لا يكتب في مكتبة الالتزام", () =>
  assertFails(setDoc(doc(asAud, "requirements/REQ-X"), { code: "REQ-X", title: "x" })));
await run("انحدار: مدير الالتزام يكتب في مكتبة الالتزام", () =>
  assertSucceeds(setDoc(doc(asMgr, "requirements/REQ-X"), { code: "REQ-X", title: "x" })));
await run("انحدار: سجل التدقيق غير قابل للتعديل", async () => {
  await env.withSecurityRulesDisabled(async (ctx) =>
    setDoc(doc(ctx.firestore(), "auditLog/a1"), { action: "CREATE" }));
  await assertFails(updateDoc(doc(asMgr, "auditLog/a1"), { action: "DELETE" }));
});

await env.cleanup();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} فحص صلاحيات ناجح`);
process.exit(failed.length ? 1 : 0);
