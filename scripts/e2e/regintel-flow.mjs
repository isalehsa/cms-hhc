// اختبار المسار الكامل لوحدة الرصد التنظيمي في متصفح حقيقي مقابل محاكيات Firebase
// يغطي: الدخول ← الوصول للوحدة ← تسجيل مستجد ← تحليله ← اعتماده ودمجه
// ← التحقق من السجلات المولّدة في مكتبة الالتزام والمخاطر والمراقبة والملاحظات والخطة
// ← التنبيهات ← سجل التدقيق ← التقرير الأسبوعي
import { chromium } from "playwright";

process.env.FIRESTORE_EMULATOR_HOST ||= "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= "127.0.0.1:9099";
const { createRequire } = await import("node:module");
const require = createRequire(import.meta.url + "/../../../functions/");
const admin = require("firebase-admin");
if (!admin.apps.length) admin.initializeApp({ projectId: "cms-hhc" });
const db = admin.firestore();

const BASE = process.env.E2E_BASE || "http://127.0.0.1:5000";
const EMAIL = "manager@cms.test";
const PASSWORD = "Test1234!";

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
};

const SAMPLE = {
  title: "تعديل لائحة المنشآت الصحية الخاصة — اشتراطات حماية بيانات المرضى",
  text: `صدر قرار وزاري بتعديل لائحة المنشآت الصحية الخاصة، ويشمل التعديل ما يلي:
المادة الثالثة: يلتزم كل مرفق صحي بتعيين مسؤول حماية بيانات معتمد وتوثيق سجل معالجة البيانات الشخصية للمرضى.
المادة الرابعة: يجب على المنشأة الصحية إجراء تقييم أثر الخصوصية لكل نظام معلومات صحي جديد قبل تشغيله.
المادة الخامسة: تلتزم المنشأة بالإبلاغ عن أي حادثة تسريب بيانات خلال 72 ساعة من اكتشافها.
المادة السادسة: على جميع المنشآت الصحية التوفيق خلال 90 يوماً من تاريخ النشر.
المادة السابعة: يعاقب المخالف بغرامة مالية لا تتجاوز خمسة ملايين ريال، ويجوز إيقاف الترخيص.
تاريخ النفاذ 2026-12-01.`,
};

const browser = await chromium.launch({ args: ["--no-sandbox"] });
const page = await browser.newPage({ locale: "ar-SA", viewport: { width: 1500, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

// الشريط العلوي يخفي عناصر المجموعات داخل قوائم منسدلة — ننتقل عبر مسار التوجيه نفسه
const goto = async (view) => {
  await page.evaluate((v) => { window.location.hash = v; }, view);
  await page.waitForTimeout(700);
};

try {
  // ---------- 1) الدخول ----------
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.fill("#login-email", EMAIL);
  await page.fill("#login-pass", PASSWORD);
  await page.click("#login-btn");
  await page.waitForSelector("#side-nav [data-view]", { timeout: 30000 });
  check("تسجيل الدخول وتحميل الهيكل", true);

  // ---------- 2) ظهور الوحدة في القائمة بلغة التصميم نفسها ----------
  const navItem = page.locator('#side-nav [data-view="regintel"]');
  check("ظهور «الرصد التنظيمي» في القائمة الجانبية", (await navItem.count()) === 1);
  await goto("regintel");
  await page.waitForSelector('[data-tab="dashboard"]');
  const tabs = await page.locator("#app .subtab").count();
  check("لوحة الرصد بثمانية تبويبات", tabs === 8, `${tabs} تبويب`);

  // ---------- 3) الوحدات القائمة ما زالت تعمل (فحص انحدار) ----------
  for (const [view, marker] of [
    ["dashboard", "الالتزام"], ["library", "مكتبة الالتزام"], ["risks", "سجل المخاطر"],
    ["monitoring", "برنامج المراقبة"], ["plan", "الخطة السنوية"], ["findings", "الملاحظات والتصحيح"],
    ["regchange", "سجل التغيّر التنظيمي"], ["reports", "التقارير"], ["assessments", "الفحص الذاتي"],
  ]) {
    await goto(view);
    const html = await page.locator("#app").innerText();
    check(`الوحدة القائمة تعمل: ${marker}`, html.includes(marker.split(" ")[0]), view);
  }

  // ---------- 4) تسجيل مستجد تنظيمي يدوياً ----------
  await goto("regintel");
  await page.waitForSelector("#ri-manual");
  await page.click("#ri-manual");
  await page.waitForSelector("#m-title");
  await page.fill("#m-title", SAMPLE.title);
  await page.fill("#m-text", SAMPLE.text);
  await page.fill("#m-pub", "2026-08-01");
  await page.selectOption("#m-auth", { label: "وزارة الصحة" });
  await page.click("#m-save"); // حفظ وتحليل
  await page.waitForSelector(".modal-overlay", { state: "detached", timeout: 40000 });

  const updSnap = await db.collection("regUpdates").get();
  const update = updSnap.docs.map((d) => ({ id: d.id, ...d.data() }))[0];
  check("تخزين المستجد في قاعدة البيانات", !!update, update?.code);
  check("تحليل المستجد وتحديد حالته", update?.status === "ANALYZED", `${update?.status} / ${update?.analysisMethod}`);
  check("تقدير الانطباق على المنشأة", update?.applicability === "APPLICABLE", update?.applicability);
  check("تقدير الأثر من العقوبات المذكورة", update?.impact === "HIGH", update?.impact);
  check(
    "استخراج المواعيد التنظيمية (نفاذ + مهلة 90 يوماً)",
    (update?.deadlines || []).some((d) => d.date === "2026-12-01") && (update?.deadlines || []).some((d) => d.date === "2026-10-30"),
    JSON.stringify(update?.deadlines?.map((d) => d.date))
  );

  // ---------- 5) إضافة التزامات للمراجعة (محاكاة مخرجات التحليل الذكي) ----------
  // بدون مفتاح Claude يعمل التحليل النصي المبدئي بلا اشتقاق التزامات؛ نحقن هنا
  // مخرجات تحليل مطابقة للمخطط لاختبار مسار الاعتماد والدمج كاملاً.
  await db.doc(`regUpdates/${update.id}`).update({
    "analysis.obligations": [
      { title: "تعيين مسؤول حماية بيانات معتمد وتوثيق سجل المعالجة", description: "المادة الثالثة من اللائحة المعدّلة",
        ownerDepartment: "الأمن السيبراني", criticality: "HIGH", category: "PRIVACY",
        dueDate: "2026-10-30", evidenceNeeded: "قرار التعيين وسجل معالجة البيانات", gapExpected: true },
      { title: "إجراء تقييم أثر الخصوصية لكل نظام معلومات صحي جديد", description: "المادة الرابعة",
        ownerDepartment: "الأمن السيبراني", criticality: "MEDIUM", category: "PRIVACY",
        dueDate: "2026-12-01", evidenceNeeded: "تقارير تقييم أثر الخصوصية", gapExpected: false },
    ],
    "analysis.risks": [
      { title: "عدم تعيين مسؤول حماية بيانات خلال المهلة النظامية", description: "قد يعرّض المنشأة لغرامة",
        cause: "عدم جاهزية الهيكل", likelihood: 4, impact: 5, penalty: "غرامة مالية لا تتجاوز خمسة ملايين ريال",
        controls: [{ name: "قرار تعيين مسؤول حماية البيانات", type: "وقائي" }, { name: "مراجعة دورية لسجل المعالجة", type: "كشفي" }],
        obligationIndex: 0 },
    ],
    "analysis.recommendedActions": ["إصدار قرار التعيين", "بناء سجل معالجة البيانات الشخصية", "تحديث سياسة الخصوصية"],
    "analysis.monitoringSuggestion": "فحص مستندي ربع سنوي لسجل معالجة البيانات وقرار التعيين",
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("#side-nav [data-view]", { timeout: 30000 });
  await goto("regintel");
  await page.waitForSelector('[data-tab="pending"]');

  // ---------- 6) مراجعة الالتزام واعتماد المستجد ----------
  await page.click('[data-tab="pending"]');
  await page.waitForSelector("tr.rowlink");
  await page.click("tr.rowlink");
  await page.waitForSelector("#u-approve", { timeout: 15000 });
  const detail = await page.locator(".modal").innerText();
  check("عرض تفاصيل المستجد والالتزامات المقترحة", detail.includes("مسؤول حماية بيانات"), "");
  await page.click("#u-approve");
  await page.waitForSelector("#ap-asmt");
  await page.check("#ap-asmt");
  await page.click("#ap-go");
  await page.waitForSelector(".modal-overlay", { state: "detached", timeout: 60000 });
  check("اعتماد المستجد ودمجه دون خطأ", true);

  // ---------- 7) التحقق من السجلات المولّدة في الوحدات القائمة ----------
  const after = (await db.doc(`regUpdates/${update.id}`).get()).data();
  check("تحديث حالة المستجد إلى معتمد", after.status === "APPROVED", after.status);

  const g = after.generated || {};
  const reqs = (await db.collection("requirements").where("regUpdateId", "==", update.id).get()).docs.map((d) => d.data());
  const risks = (await db.collection("risks").where("regUpdateId", "==", update.id).get()).docs.map((d) => d.data());
  const mons = (await db.collection("monitoring").where("regUpdateId", "==", update.id).get()).docs.map((d) => d.data());
  const finds = (await db.collection("findings").where("regUpdateId", "==", update.id).get()).docs.map((d) => d.data());
  const plans = (await db.collection("planItems").where("regUpdateId", "==", update.id).get()).docs.map((d) => d.data());
  const asmts = (await db.collection("assessments").where("regUpdateId", "==", update.id).get()).docs.map((d) => d.data());
  const changes = (await db.collection("regChanges").where("regUpdateId", "==", update.id).get()).docs.map((d) => d.data());

  check("إنشاء سجل في سجل التغيّر التنظيمي القائم", changes.length === 1, changes[0]?.code);
  check("ربط التغيّر بالمتطلبات القائمة المتأثرة", (changes[0]?.affected || []).some((a) => a.code === "REQ-9001"),
    `${(changes[0]?.affected || []).length} متطلب متأثر`);
  check("توليد التزامات في مكتبة الالتزام", reqs.length === 2, `${reqs.length} متطلب`);
  check("إسناد الإدارة المالكة من اسم الإدارة", reqs.every((r) => r.ownerDeptId === "dept-cyber"), reqs.map((r) => r.ownerDeptId).join(","));
  check("حفظ الدليل المطلوب على الالتزام", reqs.every((r) => !!r.evidenceRequired), "");
  check("اشتقاق مخاطر مرتبطة بالالتزامات", risks.length === 2, `${risks.length} خطر`);
  check("تسجيل الضوابط المقترحة على الخطر", (risks.find((r) => (r.controls || []).length)?.controls || []).length === 2, "");
  check("تقدير الغرامة مالياً من نص العقوبة", risks.some((r) => r.fineAmount === 5000000), String(risks.map((r) => r.fineAmount)));
  check("ربط كل خطر بمتطلبه", risks.every((r) => reqs.some((q) => q.code === r.requirementId)), "");
  check("توليد أنشطة مراقبة للتحقق", mons.length === 2, `${mons.length} نشاط`);
  check("ربط نشاط المراقبة بالمتطلب والخطر", mons.every((m) => m.requirementId && m.riskId), "");
  check("فتح فجوة امتثال لالتزام gapExpected فقط", finds.length === 1, `${finds.length} ملاحظة`);
  check("توليد إجراءات تصحيحية داخل الفجوة", (finds[0]?.actions || []).length === 3, `${(finds[0]?.actions || []).length} إجراء`);
  check("إضافة مبادرة إلى الخطة السنوية", plans.length === 1, plans[0]?.title?.slice(0, 40));
  check("إرسال نموذج فحص ذاتي للإدارة", asmts.length === 1 && asmts[0].status === "SENT", `${asmts[0]?.questions?.length} سؤال`);
  check("تسجيل ملخّص الأثر على المستجد", g.requirementIds?.length === 2 && g.riskIds?.length === 2, JSON.stringify(g).slice(0, 90));

  // ---------- 8) سجل التدقيق والتنبيهات ----------
  const audits = (await db.collection("auditLog").get()).docs.map((d) => d.data());
  check("سجل التدقيق يوثّق الاعتماد", audits.some((a) => a.action === "APPROVE" && a.entityType === "RegUpdate"), "");
  check("سجل التدقيق يوثّق كل سجل مولّد", audits.filter((a) => String(a.details || "").includes(update.code)).length >= 4,
    `${audits.filter((a) => String(a.details || "").includes(update.code)).length} قيد`);
  const notifs = (await db.collection("notifications").get()).docs.map((d) => d.data());
  check("إنشاء تنبيه اعتماد المستجد", notifs.some((n) => n.type === "REGINTEL_APPROVED"), "");
  check("إنشاء تنبيه الفحص الذاتي للإدارة", notifs.some((n) => n.type === "ASSESSMENT_SENT"), "");

  // ---------- 9) التنقّل بين السجلات المرتبطة في الواجهة ----------
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("#side-nav [data-view]", { timeout: 30000 });
  await goto("library");
  await page.click('[data-tab="reqs"]');
  await page.waitForTimeout(500);
  const libText = await page.locator("#app").innerText();
  check("ظهور الالتزامات المولّدة في مكتبة الالتزام", libText.includes("مسؤول حماية بيانات"), "");
  check("وسم «رصد تنظيمي» على الالتزام المولّد", libText.includes("رصد تنظيمي"), "");

  await goto("regintel");
  await page.waitForSelector('[data-tab="obligations"]');
  await page.click('[data-tab="obligations"]');
  await page.waitForTimeout(400);
  check("تبويب الالتزامات المولّدة يعرض الروابط", (await page.locator("#app table tbody tr").count()) === 2, "");

  await page.click('[data-tab="deadlines"]');
  await page.waitForTimeout(400);
  const dlText = await page.locator("#app").innerText();
  check("تبويب المواعيد التنظيمية يجمع المواعيد", dlText.includes("2026-12-01"), "");

  await page.click('[data-tab="actions"]');
  await page.waitForTimeout(400);
  check("تبويب الإجراءات يعرض إجراءات الفجوة والخطة", (await page.locator("#app table tbody tr").count()) >= 4, "");

  // ---------- 10) التقرير الأسبوعي ----------
  await page.click('[data-tab="reports"]');
  await page.waitForSelector("#rep-save");
  await page.click("#rep-save");
  await page.waitForTimeout(2500);
  const reports = (await db.collection("regReports").get()).docs.map((d) => d.data());
  check("توليد التقرير الأسبوعي وحفظه", reports.length === 1 && reports[0].total === 1, JSON.stringify({ total: reports[0]?.total, approved: reports[0]?.approved }));
  check("التقرير يحصي السجلات المولّدة", reports[0]?.generatedRequirements === 2, String(reports[0]?.generatedRequirements));

  // ---------- 11) تقرير الرصد في وحدة التقارير القائمة ----------
  await goto("reports");
  const repText = await page.locator("#app").innerText();
  check("إدراج تقرير الرصد التنظيمي في وحدة التقارير", repText.includes("تقرير الرصد التنظيمي"), "");

  // ---------- 12) لوحة التحكم الرئيسية ----------
  await goto("dashboard");
  const dashText = await page.locator("#app").innerText();
  check("لوحة التحكم الرئيسية تعرض تنبيهات تنظيمية", dashText.includes("موعد تنظيمي") || dashText.includes("مستجد تنظيمي"), "");

  // ---------- 13) صلاحيات: المراجع لا يرى أزرار التحرير ----------
  await db.doc(`users/${(await admin.auth().getUserByEmail(EMAIL)).uid}`).update({ role: "AUDITOR" });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("#side-nav [data-view]", { timeout: 30000 });
  await goto("regintel");
  await page.waitForSelector('[data-tab="dashboard"]');
  check("المراجع لا يرى زر تشغيل الفحص", (await page.locator("#ri-scan").count()) === 0);
  check("المراجع لا يرى زر التسجيل اليدوي", (await page.locator("#ri-manual").count()) === 0);
  await page.click('[data-tab="sources"]');
  await page.waitForTimeout(400);
  check("المراجع لا يرى أزرار إدارة المصادر", (await page.locator("#src-add").count()) === 0);
  await db.doc(`users/${(await admin.auth().getUserByEmail(EMAIL)).uid}`).update({ role: "COMPLIANCE_MANAGER" });

  // ---------- 14) خلوّ الصفحة من أخطاء التشغيل ----------
  const realErrors = errors.filter((e) => !/favicon|manifest|gstatic.*404|Failed to load resource.*(icon|manifest)/i.test(e));
  check("لا أخطاء تشغيل حرجة في المتصفح", realErrors.length === 0, realErrors.slice(0, 3).join(" | "));

  await page.screenshot({ path: "/tmp/regintel-dashboard.png", fullPage: true });
} catch (e) {
  check("اكتمال المسار دون استثناء", false, String(e.message).slice(0, 300));
  await page.screenshot({ path: "/tmp/regintel-failure.png", fullPage: true }).catch(() => {});
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} فحصاً ناجحاً`);
if (failed.length) {
  console.log("الفاشلة:");
  for (const f of failed) console.log(` - ${f.name}: ${f.detail}`);
}
process.exit(failed.length ? 1 : 0);
