// اختبار مسار الفحص التنظيمي في الخادم مقابل محاكي Firestore
// يغطي: قراءة المصادر، منع التكرار، التحليل الآلي، تحديث حالة المصدر،
// سجل الفحص والتنبيه وسجل التدقيق، والقفل المانع لتشغيل فحصين معاً.
process.env.FIRESTORE_EMULATOR_HOST ||= "127.0.0.1:8080";
process.env.GCLOUD_PROJECT ||= "cms-hhc";

const { createRequire } = await import("node:module");
const require = createRequire(import.meta.url + "/../../../functions/");
const admin = require("firebase-admin");
if (!admin.apps.length) admin.initializeApp({ projectId: "cms-hhc" });
const db = admin.firestore();
const regintel = require("./regintel.js");

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
};

const FEED = `<?xml version="1.0"?><rss><channel>
  <item><title>قرار وزاري بتعديل اشتراطات ترخيص المنشآت الصحية الخاصة</title>
    <link>https://feed.example.gov.sa/items/1</link><guid>ITEM-1</guid>
    <pubDate>Sat, 01 Aug 2026 09:00:00 GMT</pubDate>
    <description>يلتزم كل مرفق صحي بتحديث بيانات الترخيص خلال 60 يوماً، ويعاقب المخالف بغرامة مالية.</description></item>
  <item><title>إعلان عن فعالية رياضية</title>
    <link>https://feed.example.gov.sa/items/2</link><guid>ITEM-2</guid>
    <description>فعالية مجتمعية بالمنطقة الشرقية.</description></item>
</channel></rss>`;

const fetcher = async () => ({
  url: "https://feed.example.gov.sa/rss", status: 200, contentType: "application/rss+xml", body: FEED,
});

// تنظيف وتهيئة
for (const c of ["regUpdates", "regScans", "notifications", "auditLog"]) {
  const snap = await db.collection(c).get();
  for (const d of snap.docs) await d.ref.delete();
}
await db.doc("appConfig/regintelScanLock").set({ holder: null, startedAt: null });
await db.doc("appConfig/regintel").set({ autoAnalyze: true, maxItemsPerSource: 25 });
await db.doc("regSources/src-feed").set({
  name: "تغذية اختبار رسمية", url: "https://feed.example.gov.sa/rss", type: "RSS",
  sector: "الصحة", authorityId: "auth-moh", linkPattern: null, active: true,
  lastScanAt: null, lastStatus: "NEVER", lastError: null, lastItemCount: 0, totalDetected: 0,
  createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
});
// مصدر معطّل: يجب تخطّيه
await db.doc("regSources/src-off").set({
  name: "مصدر معطّل", url: "https://off.example.gov.sa/rss", type: "RSS", active: false,
  lastStatus: "NEVER", totalDetected: 0, createdAt: new Date().toISOString(),
});

// ---------- الفحص الأول ----------
const first = await regintel.runScan({ trigger: "SCHEDULE", deps: { fetcher } });
check("اكتمال الفحص المجدول", first.status === "COMPLETED", first.status);
check("تخطّي المصادر المعطّلة", first.sourcesScanned === 1, `${first.sourcesScanned} مصدر`);
check("قراءة عناصر التغذية", first.itemsFound === 2, `${first.itemsFound} عنصر`);
check("إنشاء مستجدين جديدين", first.created === 2, `${first.created} مستجد`);
check("تحليل المستجدات آلياً", first.analyzed === 2, `${first.analyzed} محلَّل`);

const updates = (await db.collection("regUpdates").get()).docs.map((d) => d.data());
const relevant = updates.find((u) => u.title.includes("ترخيص"));
const irrelevant = updates.find((u) => u.title.includes("رياضية"));
check("تمييز المستجد المنطبق", relevant?.applicability === "APPLICABLE", relevant?.applicability);
check("تمييز الأثر العالي من ذكر الغرامة", relevant?.impact === "HIGH", relevant?.impact);
check("استبعاد غير المنطبق", irrelevant?.applicability === "NOT_APPLICABLE", irrelevant?.applicability);
check("استخراج المهلة النسبية (60 يوماً من النشر)", (relevant?.deadlines || []).some((d) => d.date === "2026-09-30"),
  JSON.stringify(relevant?.deadlines?.map((d) => d.date)));
check("ترقيم المستجدات بعدّاد النظام الموحّد", updates.every((u) => /^RGU-\d{4}$/.test(u.code)), updates.map((u) => u.code).join(","));

const src = (await db.doc("regSources/src-feed").get()).data();
check("تحديث حالة المصدر بعد الفحص", src.lastStatus === "OK" && src.lastItemCount === 2, `${src.lastStatus}/${src.lastItemCount}`);
check("تراكم عدّاد مستجدات المصدر", src.totalDetected === 2, String(src.totalDetected));

const notifs = (await db.collection("notifications").get()).docs.map((d) => d.data());
check("تنبيه بالمستجدات الجديدة", notifs.some((n) => n.type === "REGINTEL_SCAN"), "");
const audits = (await db.collection("auditLog").get()).docs.map((d) => d.data());
check("قيد في سجل التدقيق للفحص", audits.some((a) => a.entityType === "RegScan"), "");
check("قيد تدقيق لكل تحليل", audits.filter((a) => a.entityType === "RegUpdate").length === 2, "");

// ---------- الفحص الثاني: منع التكرار ----------
const second = await regintel.runScan({ trigger: "MANUAL", deps: { fetcher } });
check("الفحص المتكرر لا ينشئ مستجدات مكررة", second.created === 0, `${second.created} مستجد جديد`);
check("عدد المستجدات ثابت بعد إعادة الفحص", (await db.collection("regUpdates").get()).size === 2, "");

// ---------- القفل: منع تشغيل فحصين معاً ----------
let locked = false;
const slowFetcher = async () => {
  await new Promise((r) => setTimeout(r, 1200));
  return fetcher();
};
const running = regintel.runScan({ trigger: "SCHEDULE", deps: { fetcher: slowFetcher } });
await new Promise((r) => setTimeout(r, 250));
try {
  await regintel.runScan({ trigger: "MANUAL", deps: { fetcher } });
} catch (e) {
  locked = e.code === "LOCKED";
}
await running;
check("القفل يمنع تشغيل فحصين متزامنين", locked, "");
const lockDoc = (await db.doc("appConfig/regintelScanLock").get()).data();
check("تحرير القفل بعد انتهاء الفحص", !lockDoc.holder, JSON.stringify(lockDoc.holder));

// ---------- فشل المصدر يُسجَّل ولا يُسقط الفحص ----------
const failing = async () => { throw new Error("استجابة غير ناجحة من المصدر (HTTP 503)"); };
const third = await regintel.runScan({ trigger: "MANUAL", deps: { fetcher: failing } });
check("فشل المصدر يُسجَّل كخطأ لا كانهيار", third.errors.length === 1, third.status);
const srcAfter = (await db.doc("regSources/src-feed").get()).data();
check("تسجيل خطأ المصدر على سجله", srcAfter.lastStatus === "ERROR" && !!srcAfter.lastError, srcAfter.lastStatus);

// ---------- التقرير الأسبوعي في الخادم ----------
const report = await regintel.generateWeeklyReport({ trigger: "SCHEDULE", email: false });
check("توليد التقرير الأسبوعي في الخادم", report.total === 2, `${report.total} مستجد`);
const savedReport = (await db.doc(`regReports/${report.id}`).get()).data();
check("حفظ التقرير الأسبوعي", !!savedReport && savedReport.trigger === "SCHEDULE", report.id);

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} فحصاً ناجحاً`);
if (failed.length) for (const f of failed) console.log(` - ${f.name}: ${f.detail}`);
process.exit(failed.length ? 1 : 0);
