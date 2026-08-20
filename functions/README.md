# طبقة التكامل والـ API — Cloud Functions

خدمات خادمية تكمّل تطبيق العميل الثابت (لا يمكن أداؤها من المتصفح وحده).

## الوظائف

| الوظيفة | النوع | الغرض |
|---|---|---|
| `sendDailyDigest` | مجدولة (يومياً 07:00 الرياض) | يحسب الاستحقاقات المتأخرة/القريبة ويكتب ملخّصاً بريدياً في مجموعة `mail` لكل مدير التزام. |
| `escalateWorkflows` | مجدولة (كل ساعة) | يصعّد مسارات الاعتماد المتجاوزة لـ SLA وينشئ تنبيهات — حتى دون دخول أحد. |
| `ingestAuthorityFeed` | مجدولة (يومياً 06:00) | يسحب مستجدات الجهات الرقابية من `appConfig/integration.feedUrl` وينشئ تغييرات تنظيمية. |
| `api` | HTTPS (Express) | واجهة REST آمنة بمفتاح للأنظمة المؤسسية. |

## واجهة REST

الأساس بعد النشر: `https://<region>-<project>.cloudfunctions.net/api` أو عبر الاستضافة `https://<site>/api` (مُعاد توجيهه في `firebase.json`).

المصادقة: ترويسة `x-api-key` تطابق `appConfig/integration.apiKey` في Firestore.

| المسار | الوصف |
|---|---|
| `GET /api/health` | فحص التوفّر (بلا مفتاح). |
| `GET /api/metrics` | آخر لقطة مؤشرات أداء. |
| `GET /api/obligations` | قائمة المتطلبات (الالتزامات) النشطة. |
| `POST /api/regulatory-change` | دفع تغيّر تنظيمي `{title, summary, effectiveDate, authority, changeType, url, externalId}`. |

## الإعداد

1. في Firestore أنشئ وثيقة `appConfig/integration` بالحقول:
   - `apiKey` — مفتاح سرّي لواجهة REST.
   - `feedUrl` — رابط تغذية الجهات الرقابية (JSON) — اختياري.
   - `feedHeaders` — ترويسات الطلب للتغذية — اختياري.
   (يمكن ضبطها من شاشة الإدارة ← «إعداد التكامل».)
2. لتفعيل البريد: ثبّت إضافة **Firebase «Trigger Email»** واضبطها لتقرأ مجموعة `mail`،
   وفعّل `appConfig/reminders.emailEnabled = true`.

## النشر

```bash
cd functions && npm install
firebase deploy --only functions
# أو الكل: firebase deploy
```

> ملاحظة: الوظائف المجدولة تتطلب خطة Blaze (الدفع حسب الاستخدام) في Firebase.
