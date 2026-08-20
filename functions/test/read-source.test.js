// اختبار قراءة المصادر: اختيار المحلل الصحيح حسب النوع ونوع المحتوى
const test = require("node:test");
const assert = require("node:assert/strict");
const { readSource } = require("../regintel");

const fetcherFor = (body, contentType, url = "https://x.gov.sa/feed") => async () => ({
  url, status: 200, contentType, body,
});

test("مصدر RSS يُقرأ بمحلل التغذية", async () => {
  const rss = `<rss><channel><item><title>تعميم</title><link>https://x.gov.sa/1</link>
    <guid>G1</guid><description>نص</description></item></channel></rss>`;
  const items = await readSource({ type: "RSS", url: "https://x.gov.sa/feed" }, 10, {
    fetcher: fetcherFor(rss, "application/rss+xml"),
  });
  assert.equal(items.length, 1);
  assert.equal(items[0].title, "تعميم");
});

test("مصدر JSON يُقرأ بمحلل JSON", async () => {
  const payload = JSON.stringify({ items: [{ id: 7, title: "قرار", url: "https://x.gov.sa/7" }] });
  const items = await readSource({ type: "JSON", url: "https://x.gov.sa/api" }, 10, {
    fetcher: fetcherFor(payload, "application/json"),
  });
  assert.equal(items[0].externalId, "7");
  assert.equal(items[0].title, "قرار");
});

test("مصدر JSON غير صالح يرفع خطأً واضحاً", async () => {
  await assert.rejects(
    () => readSource({ type: "JSON", url: "https://x.gov.sa/api" }, 10, { fetcher: fetcherFor("<html>", "application/json") }),
    /JSON/
  );
});

test("مصدر HTML يُستخرج منه الروابط مع تصفية النمط", async () => {
  const html = `<a href="/ar/regulations/12">لائحة المنشآت الصحية الجديدة</a>
    <a href="/ar/sports/3">فعالية رياضية بالمنطقة</a>`;
  const items = await readSource(
    { type: "HTML", url: "https://x.gov.sa/ar/", linkPattern: "regulations" },
    10,
    { fetcher: fetcherFor(html, "text/html", "https://x.gov.sa/ar/") }
  );
  assert.equal(items.length, 1);
  assert.equal(items[0].url, "https://x.gov.sa/ar/regulations/12");
});

test("مصدر معلن كـ RSS لكنه يعيد صفحة يعود لاستخراج الروابط", async () => {
  const html = `<html><a href="https://x.gov.sa/ar/news/9">تعميم بشأن التراخيص الصحية</a></html>`;
  const items = await readSource({ type: "RSS", url: "https://x.gov.sa/feed" }, 10, {
    fetcher: fetcherFor(html, "application/xml"),
  });
  assert.equal(items.length, 1);
  assert.equal(items[0].url, "https://x.gov.sa/ar/news/9");
});
