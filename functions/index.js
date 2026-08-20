// طبقة التكامل والـ API لنظام إدارة الالتزام (CMS) — Firebase Cloud Functions (2nd gen)
// توفّر خدمات خادمية لا يمكن أداؤها من المتصفح الثابت:
//  1) sendDailyDigest   — ملخّص بريدي يومي مجدول (يكتب في مجموعة mail لإضافة Trigger Email)
//  2) escalateWorkflows — تصعيد مسارات الاعتماد المتجاوزة لـ SLA حتى دون دخول أحد
//  3) ingestAuthorityFeed — سحب مستجدات الجهات الرقابية من نقطة خارجية وإنشاء تغييرات تنظيمية
//  4) api               — واجهة REST آمنة بمفتاح للأنظمة المؤسسية (مؤشرات/التزامات/دفع تغيّر تنظيمي)
//  5) weeklyRegulatoryScan   — الفحص التنظيمي الأسبوعي المجدول (وحدة الرصد التنظيمي)
//  6) weeklyRegulatoryReport — التقرير الأسبوعي للرصد التنظيمي + إرساله بالبريد
//     ويضيف إلى api مسارَي /regintel/scan و/regintel/report بمصادقة رمز هوية Firebase ودور المستخدم
const { onRequest } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { setGlobalOptions } = require("firebase-functions/v2");
const { defineSecret } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const express = require("express");

admin.initializeApp();
const db = admin.firestore();
setGlobalOptions({ region: "us-central1", maxInstances: 10 });

const nowISO = () => new Date().toISOString();
const todayISO = () => nowISO().slice(0, 10);
const daysUntil = (iso) => (iso ? Math.ceil((new Date(iso) - Date.now()) / 86400000) : null);
const APPROVER_ROLES = ["ADMIN", "COMPLIANCE_MANAGER"];

// مفتاح Claude الخادمي — سرّ مُدار في Firebase/Secret Manager، لا يصل المتصفح إطلاقاً.
// عند غيابه يعمل الفحص بالتحليل النصي المبدئي بدل التحليل بالذكاء الاصطناعي.
const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");
// السر قد يكون غير مضبوط بعد (قيمة نائبة عند النشر الأول) — عندها يعمل التحليل
// النصي المبدئي بدل الذكاء الاصطناعي، ولا يتعطّل الفحص المجدول
function anthropicKey() {
  const v = (ANTHROPIC_API_KEY.value() || "").trim();
  return v.startsWith("sk-") ? v : null;
}
const regintel = require("./regintel");

const DUE_SOON = { requirement: 30, monitoring: 14, risk: 14, finding: 14, assessment: 7, correspondence: 7, training: 14, meeting: 3 };

async function col(name) {
  const snap = await db.collection(name).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// جمع الاستحقاقات المتأخرة/القريبة من كل الوحدات (نفس منطق العميل)
async function collectDeadlines(thresholds = DUE_SOON) {
  const [reqs, mons, risks, finds, assess, corr, trains, meets] = await Promise.all([
    col("requirements"), col("monitoring"), col("risks"), col("findings"),
    col("assessments"), col("correspondence"), col("trainings"), col("meetings"),
  ]);
  const items = [];
  const add = (kind, code, title, date) => { if (date) items.push({ kind, code: code || "", title: title || "", date: String(date).slice(0, 10) }); };
  for (const r of reqs) if (r.status !== "CANCELLED") add("requirement", r.code, `مراجعة المتطلب: ${r.title}`, r.nextReviewDate);
  for (const m of mons) if (!["COMPLETED", "CLOSED"].includes(m.status)) add("monitoring", m.code, `نهاية المراقبة: ${m.name}`, m.endDate);
  for (const r of risks) if (["OPEN", "IN_TREATMENT"].includes(r.status)) add("risk", r.code, `معالجة الخطر: ${r.title}`, r.dueDate);
  for (const f of finds) if (f.status !== "CLOSED") add("finding", f.code, `خطة تصحيح: ${f.title}`, f.dueDate);
  for (const a of assess) if (["SENT", "SUBMITTED"].includes(a.status)) add("assessment", a.code, `فحص ذاتي: ${a.title}`, a.dueDate);
  for (const c of corr) if (c.status === "OPEN") add("correspondence", c.code, `رد مراسلة: ${c.subject}`, c.dueDate);
  for (const t of trains) if (["PLANNED", "IN_PROGRESS"].includes(t.status)) add("training", t.code, `تدريب: ${t.title}`, t.dueDate || t.date);
  for (const mt of meets) if ((mt.type || "") === "DEPT" && mt.date && String(mt.date).slice(0, 10) >= todayISO()) add("meeting", mt.code, `اجتماع الالتزام: ${mt.party || mt.title || ""}`, mt.date);

  const overdue = [], soon = [];
  for (const it of items) {
    const d = daysUntil(it.date);
    if (d === null) continue;
    if (d < 0) overdue.push({ ...it, days: d });
    else if (d <= (thresholds[it.kind] ?? 14)) soon.push({ ...it, days: d });
  }
  overdue.sort((a, b) => a.days - b.days);
  soon.sort((a, b) => a.days - b.days);
  return { overdue, soon };
}

function digestHtml(overdue, soon) {
  const li = (x) => `<li>${x.code ? "<b>" + x.code + "</b> " : ""}${x.title} — ${x.days < 0 ? "متأخر " + -x.days + " يوماً" : x.days === 0 ? "يستحق اليوم" : "خلال " + x.days + " يوماً"}</li>`;
  const list = (arr) => (arr.length ? `<ul>${arr.map(li).join("")}</ul>` : "<p>لا يوجد</p>");
  return `<div dir="rtl" style="font-family:Tahoma,sans-serif;color:#14251f;max-width:640px">
    <h2 style="color:#0d5243">تنبيهات الالتزام — ${todayISO()}</h2>
    <h3 style="color:#b3402e">استحقاقات متأخرة (${overdue.length})</h3>${list(overdue)}
    <h3 style="color:#0d5243">استحقاقات قريبة (${soon.length})</h3>${list(soon)}
    <p style="color:#5d6c66;font-size:12px">رسالة آلية من نظام إدارة الالتزام (CMS).</p></div>`;
}

// ---------- 1) الملخّص البريدي اليومي المجدول (07:00 بتوقيت الرياض) ----------
exports.sendDailyDigest = onSchedule({ schedule: "0 7 * * *", timeZone: "Asia/Riyadh" }, async () => {
  const cfg = (await db.doc("appConfig/reminders").get()).data() || {};
  if (cfg.emailEnabled === false) { logger.info("digest disabled"); return; }
  const { overdue, soon } = await collectDeadlines({ ...DUE_SOON, ...(cfg.dueSoonDays || {}) });
  if (!overdue.length && !soon.length) return;
  const users = await col("users");
  const recipients = users.filter((u) => u.active !== false && u.email && APPROVER_ROLES.includes(String(u.role || "").toUpperCase()));
  const html = digestHtml(overdue, soon);
  const subject = `تنبيهات الالتزام — ${overdue.length} متأخر و${soon.length} قريب (${todayISO()})`;
  const batch = db.batch();
  for (const u of recipients) {
    batch.set(db.doc(`mail/digest_${u.id}_${todayISO()}`), {
      to: [u.email], message: { subject, html }, queuedAt: nowISO(), queuedBy: "system",
    });
  }
  await batch.commit();
  logger.info(`queued ${recipients.length} digests`);
});

// ---------- 2) تصعيد مسارات الاعتماد المتجاوزة لـ SLA (كل ساعة) ----------
exports.escalateWorkflows = onSchedule({ schedule: "0 * * * *", timeZone: "Asia/Riyadh" }, async () => {
  const wfs = await col("workflows");
  let n = 0;
  for (const wf of wfs) {
    if (["CLOSED", "REJECTED"].includes(wf.stage)) continue;
    if (!wf.dueAt || daysUntil(wf.dueAt) >= 0 || wf.escalated) continue;
    await db.doc(`workflows/${wf.id}`).update({ escalated: true, updatedAt: nowISO() });
    await db.collection("notifications").add({
      title: "⏱ تصعيد مسار اعتماد (آلي)",
      message: `${wf.code} — ${wf.title}: تجاوزت مرحلة «${wf.stage}» موعد الـ SLA`,
      type: "WF_ESCALATION", link: "workflow", roleTarget: "COMPLIANCE_MANAGER",
      userId: null, dedupeKey: `wf:esc:${wf.code}:${wf.stage}:${todayISO()}`, read: false, createdAt: nowISO(),
    });
    n++;
  }
  if (n) logger.info(`escalated ${n} workflows`);
});

// ---------- 3) سحب مستجدات الجهات الرقابية (يومياً) ----------
// يقرأ appConfig/integration.feedUrl (JSON: [{externalId,title,summary,effectiveDate,authority,url}])
exports.ingestAuthorityFeed = onSchedule({ schedule: "0 6 * * *", timeZone: "Asia/Riyadh" }, async () => {
  const cfg = (await db.doc("appConfig/integration").get()).data() || {};
  if (!cfg.feedUrl) return;
  let feed;
  try {
    const res = await fetch(cfg.feedUrl, { headers: cfg.feedHeaders || {} });
    feed = await res.json();
  } catch (e) { logger.error("feed fetch failed", e); return; }
  const items = Array.isArray(feed) ? feed : feed.items || [];
  const existing = new Set((await col("regChanges")).map((c) => c.externalId).filter(Boolean));
  let created = 0;
  for (const it of items) {
    const extId = String(it.externalId || it.id || it.url || it.title || "");
    if (!extId || existing.has(extId)) continue;
    const ref = db.doc(`regChanges/RCH-FEED-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`);
    await ref.set({
      code: ref.id, title: it.title || "تحديث تنظيمي", changeType: it.changeType || "CIRCULAR",
      authorityId: null, authorityName: it.authority || null, effectiveDate: it.effectiveDate || null,
      sourceUrl: it.url || null, summary: it.summary || it.title || "", affected: [],
      status: "NEW", reviewTasksCreated: false, externalId: extId, source: "AUTHORITY_FEED",
      createdAt: nowISO(), updatedAt: nowISO(),
    });
    await db.collection("notifications").add({
      title: "تغيّر تنظيمي من تغذية الجهات", message: `${it.title || "تحديث"} (${it.authority || "جهة رقابية"})`,
      type: "REGCHANGE_FEED", link: "regchange", roleTarget: "COMPLIANCE_MANAGER", userId: null, read: false, createdAt: nowISO(),
    });
    created++;
  }
  if (created) logger.info(`ingested ${created} regulatory changes`);
});

// ---------- 4) واجهة REST للأنظمة المؤسسية ----------
const app = express();
app.use(express.json());

// مصادقة بمفتاح: appConfig/integration.apiKey يطابق ترويسة x-api-key
async function requireApiKey(req, res, next) {
  try {
    const cfg = (await db.doc("appConfig/integration").get()).data() || {};
    const key = req.get("x-api-key");
    if (!cfg.apiKey || key !== cfg.apiKey) return res.status(401).json({ error: "unauthorized" });
    next();
  } catch (e) {
    res.status(500).json({ error: "auth check failed" });
  }
}

app.get("/health", (req, res) => res.json({ ok: true, service: "cms-hhc", time: nowISO() }));

// مؤشرات الأداء (آخر لقطة) — للوحات الأنظمة المؤسسية
app.get("/metrics", requireApiKey, async (req, res) => {
  const snap = await db.collection("metricSnapshots").orderBy("date", "desc").limit(1).get();
  const latest = snap.empty ? null : snap.docs[0].data();
  res.json({ latest });
});

// الالتزامات (المتطلبات النشطة) — لمزامنة الأنظمة الأخرى
app.get("/obligations", requireApiKey, async (req, res) => {
  const reqs = (await col("requirements")).filter((r) => r.status !== "CANCELLED")
    .map((r) => ({ code: r.code, title: r.title, category: r.category, criticality: r.criticality, status: r.status }));
  res.json({ count: reqs.length, obligations: reqs });
});

// دفع تغيّر تنظيمي من جهة خارجية إلى السجل
app.post("/regulatory-change", requireApiKey, async (req, res) => {
  const { title, summary, effectiveDate, authority, changeType, url, externalId } = req.body || {};
  if (!title) return res.status(400).json({ error: "title required" });
  const ref = db.doc(`regChanges/RCH-API-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`);
  await ref.set({
    code: ref.id, title, changeType: changeType || "CIRCULAR", authorityId: null, authorityName: authority || null,
    effectiveDate: effectiveDate || null, sourceUrl: url || null, summary: summary || title, affected: [],
    status: "NEW", reviewTasksCreated: false, externalId: externalId || null, source: "API",
    createdAt: nowISO(), updatedAt: nowISO(),
  });
  res.status(201).json({ id: ref.id });
});

// ---------- مسارات الرصد التنظيمي: مصادقة برمز هوية Firebase ودور المستخدم ----------
// لا مفتاح ثابت هنا: المستخدم نفسه هو من يستدعي الخدمة بهويته، والدور يُقرأ من users/{uid}
async function requireApprover(req, res, next) {
  try {
    const header = req.get("authorization") || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: "يلزم تسجيل الدخول" });
    const decoded = await admin.auth().verifyIdToken(token);
    const snap = await db.doc(`users/${decoded.uid}`).get();
    const data = snap.exists ? snap.data() : {};
    const role = String(data.role || "AUDITOR").toUpperCase();
    if (data.active === false) return res.status(403).json({ error: "الحساب معطَّل" });
    if (!APPROVER_ROLES.includes(role)) return res.status(403).json({ error: "هذا الإجراء مقصور على مدير الالتزام" });
    req.cmsUser = { uid: decoded.uid, role, name: data.name || decoded.email || decoded.uid };
    next();
  } catch (e) {
    logger.warn("regintel auth failed", e);
    res.status(401).json({ error: "رمز هوية غير صالح" });
  }
}

// تشغيل فحص تنظيمي فوري (زر «تشغيل الفحص الآن» في الواجهة)
app.post("/regintel/scan", requireApprover, async (req, res) => {
  try {
    const summary = await regintel.runScan({
      trigger: "MANUAL",
      triggeredBy: req.cmsUser.uid,
      triggeredByName: req.cmsUser.name,
      sourceId: req.body?.sourceId || null,
      apiKey: anthropicKey(),
    });
    res.json(summary);
  } catch (e) {
    if (e.code === "LOCKED") return res.status(409).json({ error: e.message });
    logger.error("regintel scan failed", e);
    res.status(500).json({ error: String(e.message).slice(0, 300) });
  }
});

// توليد التقرير الأسبوعي عند الطلب
app.post("/regintel/report", requireApprover, async (req, res) => {
  try {
    const report = await regintel.generateWeeklyReport({ trigger: "MANUAL", email: req.body?.email !== false });
    res.json(report);
  } catch (e) {
    logger.error("regintel report failed", e);
    res.status(500).json({ error: String(e.message).slice(0, 300) });
  }
});

exports.api = onRequest({ secrets: [ANTHROPIC_API_KEY] }, app);

// ---------- 5) الفحص التنظيمي الأسبوعي (الأحد 05:00 بتوقيت الرياض) ----------
// مرة واحدة أسبوعياً، ومحمي بقفل يمنع تداخله مع أي فحص يدوي قيد التشغيل
exports.weeklyRegulatoryScan = onSchedule(
  { schedule: "0 5 * * 0", timeZone: "Asia/Riyadh", timeoutSeconds: 540, memory: "512MiB", secrets: [ANTHROPIC_API_KEY] },
  async () => {
    try {
      const summary = await regintel.runScan({ trigger: "SCHEDULE", apiKey: anthropicKey() });
      logger.info(`weekly regulatory scan: ${summary.created} new updates from ${summary.sourcesScanned} sources`);
    } catch (e) {
      if (e.code === "LOCKED") { logger.warn("weekly scan skipped — another scan is running"); return; }
      throw e;
    }
  }
);

// ---------- 6) التقرير الأسبوعي للرصد التنظيمي (الأحد 07:30 بتوقيت الرياض) ----------
exports.weeklyRegulatoryReport = onSchedule(
  { schedule: "30 7 * * 0", timeZone: "Asia/Riyadh", timeoutSeconds: 300 },
  async () => {
    const report = await regintel.generateWeeklyReport({ trigger: "SCHEDULE" });
    logger.info(`weekly regulatory report ${report.id}: ${report.total} updates`);
  }
);
