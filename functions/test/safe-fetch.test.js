// اختبارات حماية SSRF في طبقة الجلب الآمن
const test = require("node:test");
const assert = require("node:assert/strict");
const sf = require("../safe-fetch");

test("يرفض عناوين IPv4 الداخلية والمحجوزة", () => {
  for (const ip of [
    "127.0.0.1", "10.1.2.3", "192.168.1.1", "172.16.0.1", "172.31.255.255",
    "169.254.169.254", "0.0.0.0", "100.64.0.1", "198.18.0.1", "224.0.0.1", "240.0.0.1",
  ]) {
    assert.equal(sf.isPrivateIp(ip), true, `يجب رفض ${ip}`);
  }
});

test("يقبل عناوين IPv4 العامة", () => {
  for (const ip of ["8.8.8.8", "1.1.1.1", "51.36.10.20", "172.32.0.1", "192.169.0.1"]) {
    assert.equal(sf.isPrivateIp(ip), false, `يجب قبول ${ip}`);
  }
});

test("يرفض عناوين IPv6 الداخلية بما فيها المُسقطة من IPv4", () => {
  for (const ip of ["::1", "::", "fd00::1", "fc00::abcd", "fe80::1", "ff02::1", "::ffff:127.0.0.1", "2001:db8::1"]) {
    assert.equal(sf.isPrivateIp(ip), true, `يجب رفض ${ip}`);
  }
  assert.equal(sf.isPrivateIp("2606:4700:4700::1111"), false);
});

test("فحص شكل الرابط: HTTPS فقط بلا بيانات دخول وبمنفذ قياسي", () => {
  assert.equal(sf.checkUrlShape("http://sfda.gov.sa").ok, false);
  assert.equal(sf.checkUrlShape("https://user:pass@sfda.gov.sa").ok, false);
  assert.equal(sf.checkUrlShape("https://sfda.gov.sa:8080/x").ok, false);
  assert.equal(sf.checkUrlShape("https://localhost/x").ok, false);
  assert.equal(sf.checkUrlShape("https://x.internal/x").ok, false);
  assert.equal(sf.checkUrlShape("https://169.254.169.254/latest/meta-data/").ok, false);
  assert.equal(sf.checkUrlShape("file:///etc/passwd").ok, false);
  assert.equal(sf.checkUrlShape("https://sfda.gov.sa/ar/news").ok, true);
  assert.equal(sf.checkUrlShape("https://sfda.gov.sa:443/ar/news").ok, true);
});

test("assertPublicHost يرفض النطاق الذي يُحلَّل إلى عنوان داخلي", async () => {
  const lookup = async () => [{ address: "10.0.0.5", family: 4 }];
  await assert.rejects(() => sf.assertPublicHost("evil.example.com", lookup), /شبكة داخلية/);
});

test("assertPublicHost يقبل النطاق العام", async () => {
  const lookup = async () => [{ address: "93.184.216.34", family: 4 }];
  const addrs = await sf.assertPublicHost("example.com", lookup);
  assert.deepEqual(addrs, ["93.184.216.34"]);
});

test("safeFetch يرفض التحويل إلى عنوان داخلي", async () => {
  const lookup = async (host) =>
    host === "public.example.com" ? [{ address: "93.184.216.34", family: 4 }] : [{ address: "127.0.0.1", family: 4 }];
  const fetchImpl = async () =>
    new Response(null, { status: 302, headers: { location: "https://internal.example.com/secret" } });
  await assert.rejects(
    () => sf.safeFetch("https://public.example.com/feed", { lookup, fetchImpl }),
    /شبكة داخلية/
  );
});

test("safeFetch يتبع تحويلاً عاماً واحداً ويعيد الجسم", async () => {
  const lookup = async () => [{ address: "93.184.216.34", family: 4 }];
  let hop = 0;
  const fetchImpl = async () => {
    hop++;
    if (hop === 1) return new Response(null, { status: 301, headers: { location: "https://b.example.com/feed" } });
    return new Response("<rss></rss>", { status: 200, headers: { "content-type": "application/rss+xml" } });
  };
  const res = await sf.safeFetch("https://a.example.com/feed", { lookup, fetchImpl });
  assert.equal(res.body, "<rss></rss>");
  assert.match(res.contentType, /rss/);
});

test("safeFetch يوقف الاستجابات الأكبر من الحد", async () => {
  const lookup = async () => [{ address: "93.184.216.34", family: 4 }];
  const fetchImpl = async () => new Response("x".repeat(5000), { status: 200, headers: { "content-type": "text/html" } });
  await assert.rejects(
    () => sf.safeFetch("https://a.example.com/feed", { lookup, fetchImpl, maxBytes: 1000 }),
    /الحد/
  );
});

test("safeFetch يتوقف عند تجاوز عدد التحويلات", async () => {
  const lookup = async () => [{ address: "93.184.216.34", family: 4 }];
  let n = 0;
  const fetchImpl = async () =>
    new Response(null, { status: 302, headers: { location: `https://a.example.com/${++n}` } });
  await assert.rejects(
    () => sf.safeFetch("https://a.example.com/feed", { lookup, fetchImpl, maxRedirects: 2 }),
    /التحويلات/
  );
});

test("causeChain يكشف السبب الحقيقي المخفي داخل cause", () => {
  const inner = Object.assign(new Error("connect ECONNREFUSED 1.2.3.4:443"), { code: "ECONNREFUSED" });
  const outer = Object.assign(new Error("fetch failed"), { cause: inner });
  const chain = sf.causeChain(outer);
  assert.match(chain, /fetch failed/);
  assert.match(chain, /ECONNREFUSED/);
});

test("causeChain لا يدور في حلقة عند تسلسل دائري", () => {
  const a = new Error("A");
  const b = Object.assign(new Error("B"), { cause: a });
  a.cause = b;
  assert.equal(sf.causeChain(a), "A ← B");
});

test("رسالة فشل الاتصال تذكر المضيف والسبب لا «fetch failed» وحدها", async () => {
  const lookup = async () => [{ address: "93.184.216.34", family: 4 }];
  const fetchImpl = async () => {
    throw Object.assign(new Error("fetch failed"), {
      cause: Object.assign(new Error("certificate has expired"), { code: "CERT_HAS_EXPIRED" }),
    });
  };
  await assert.rejects(
    () => sf.safeFetch("https://laws.example.gov.sa/feed", { lookup, fetchImpl }),
    (e) => /laws\.example\.gov\.sa/.test(e.message) && /CERT_HAS_EXPIRED/.test(e.message)
  );
});

test("رسالة انتهاء المهلة تذكر المدة والمضيف", async () => {
  const lookup = async () => [{ address: "93.184.216.34", family: 4 }];
  const fetchImpl = async () => { throw Object.assign(new Error("aborted"), { name: "AbortError" }); };
  await assert.rejects(
    () => sf.safeFetch("https://slow.example.gov.sa/feed", { lookup, fetchImpl, timeoutMs: 15000 }),
    (e) => /15000/.test(e.message) && /slow\.example\.gov\.sa/.test(e.message)
  );
});

test("المهلة تغطي قراءة الجسم لا فتح الاتصال وحده", async () => {
  const lookup = async () => [{ address: "93.184.216.34", family: 4 }];
  // خادم يرسل الترويسات ثم لا يُنهي الجسم — كان يُعلّق العملية إلى ما لا نهاية
  const fetchImpl = async (url, opts) =>
    new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("<rss>"));
          opts.signal.addEventListener("abort", () => controller.error(new Error("aborted")));
          // ولا يُغلق أبداً
        },
      }),
      { status: 200, headers: { "content-type": "application/rss+xml" } }
    );
  await assert.rejects(
    () => sf.safeFetch("https://slow.example.gov.sa/feed", { lookup, fetchImpl, timeoutMs: 300 }),
    (e) => /انتهت المهلة/.test(e.message) && /قراءة/.test(e.message)
  );
});
