#!/usr/bin/env node
// مشغّل الفحص التنظيمي خارج Cloud Functions
//
// يستدعي نفس محرك الفحص في regintel.js لكن كعملية Node عادية، فيمكن تشغيله من:
//   • مهمة مجدولة في GitHub Actions (لا تحتاج خطة Blaze)
//   • جهاز مدير الالتزام محلياً
//   • أي مجدول آخر (cron على خادم، Cloud Run، …)
//
// الهوية: حساب خدمة Firebase عبر GOOGLE_APPLICATION_CREDENTIALS، ويتجاوز
// قواعد Firestore كما تفعل دوال الخادم تماماً.
//
// الاستخدام:
//   node functions/scan-runner.js scan      # فحص المصادر المفعّلة
//   node functions/scan-runner.js report    # توليد التقرير الأسبوعي فقط
//   node functions/scan-runner.js both      # فحص ثم تقرير (الافتراضي في الجدولة)
const admin = require("firebase-admin");

const MODE = (process.argv[2] || "both").toLowerCase();
const PROJECT_ID = process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID || "cms-hhc";
const USING_EMULATOR = Boolean(process.env.FIRESTORE_EMULATOR_HOST);

// مفتاح Claude اختياري: بدونه يعمل التحليل النصي المبدئي وتبقى المستجدات للمراجعة البشرية
function anthropicKey() {
  const v = (process.env.ANTHROPIC_API_KEY || "").trim();
  return v.startsWith("sk-") ? v : null;
}

function log(msg) {
  process.stdout.write(`${msg}\n`);
}
const ghWarn = (msg) => log(`::warning::${String(msg).replace(/\r?\n/g, " ")}`);
const ghError = (msg) => log(`::error::${String(msg).replace(/\r?\n/g, " ")}`);

async function main() {
  if (!admin.apps.length) {
    admin.initializeApp(
      USING_EMULATOR
        ? { projectId: PROJECT_ID }
        : { credential: admin.credential.applicationDefault(), projectId: PROJECT_ID }
    );
  }
  // يُحمَّل بعد التهيئة لأن المحرك يقرأ admin.firestore() عند أول استعمال
  const regintel = require("./regintel");

  const key = anthropicKey();
  log(`المشروع: ${PROJECT_ID}${USING_EMULATOR ? " (محاكي)" : ""} · التحليل: ${key ? "ذكاء اصطناعي" : "نصي مبدئي"} · الوضع: ${MODE}`);

  let failed = false;

  if (MODE === "scan" || MODE === "both") {
    try {
      const s = await regintel.runScan({
        trigger: process.env.SCAN_TRIGGER === "MANUAL" ? "MANUAL" : "SCHEDULE",
        triggeredByName: process.env.SCAN_ACTOR || "الجدولة الأسبوعية (GitHub Actions)",
        apiKey: key,
      });
      log(
        `الفحص: ${s.status} · ${s.sourcesScanned} مصدر · ${s.itemsFound} عنصر · ` +
          `${s.created} مستجد جديد · ${s.analyzed} محلَّل · ${s.errors.length} خطأ`
      );
      for (const d of s.sources || []) {
        const label = `${d.name}${d.url ? ` (${d.url})` : ""}`;
        if (d.status === "ERROR") ghWarn(`✗ ${label}: ${d.error}`);
        else log(`  ${d.status === "OK" ? "✓" : "○"} ${label}: ${d.items} عنصر · ${d.created} جديد`);
      }
      if (!(s.sources || []).length) for (const e of s.errors) ghWarn(`فشل المصدر «${e.source}»: ${e.error}`);
      if (s.status === "FAILED") {
        ghError("فشل الفحص التنظيمي: لم ينجح أي مصدر");
        failed = true;
      }
    } catch (e) {
      if (e.code === "LOCKED") {
        ghWarn(`تخطّي الفحص: ${e.message}`);
      } else {
        ghError(`تعذّر تشغيل الفحص: ${e.message}`);
        failed = true;
      }
    }
  }

  if (MODE === "report" || MODE === "both") {
    try {
      const r = await regintel.generateWeeklyReport({
        trigger: process.env.SCAN_TRIGGER === "MANUAL" ? "MANUAL" : "SCHEDULE",
        email: process.env.REGINTEL_EMAIL !== "false",
      });
      log(
        `التقرير الأسبوعي ${r.id}: ${r.total} مستجد · ${r.approved} معتمد · ` +
          `${r.pending} بانتظار المراجعة · ${r.highImpact} عالي الأثر`
      );
    } catch (e) {
      ghError(`تعذّر توليد التقرير الأسبوعي: ${e.message}`);
      failed = true;
    }
  }

  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  ghError(`خطأ غير متوقع: ${e && e.stack ? e.stack : e}`);
  process.exit(1);
});
