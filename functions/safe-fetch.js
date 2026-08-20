// جلب آمن للمصادر الخارجية — الحماية من هجمات SSRF
//
// طبقات الحماية:
//   1) فحص شكل الرابط: HTTPS فقط، بلا بيانات دخول، بمنفذ 443 وحده.
//   2) تحليل DNS ورفض أي عنوان يقع في نطاق داخلي/خاص/محلي (IPv4 و IPv6).
//   3) متابعة التحويلات يدوياً مع إعادة الفحص الكامل لكل قفزة (حد أقصى 3).
//   4) مهلة زمنية صارمة وسقف لحجم الاستجابة ولنوع المحتوى المقبول.
//
// حد معروف: بين فحص DNS وبدء الاتصال توجد نافذة إعادة ربط DNS نظرياً
// (DNS rebinding) لأن fetch يعيد التحليل بنفسه؛ تقليصها يتطلب وكيل خروج
// مقيّداً بقائمة عناوين — موثّق في README ضمن حدود التطبيق.
const dnsPromises = require("node:dns").promises;
const net = require("node:net");

const DEFAULTS = { maxBytes: 2 * 1024 * 1024, timeoutMs: 15000, maxRedirects: 3 };

const ipv4ToLong = (ip) =>
  ip.split(".").reduce((acc, o) => (acc << 8) + (Number(o) & 255), 0) >>> 0;

// النطاقات المحجوبة في IPv4 (بادئة/طول)
const V4_BLOCKED = [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
  ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24],
  ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
  ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
];

function isPrivateIpv4(ip) {
  if (net.isIPv4(ip) !== true) return false;
  const value = ipv4ToLong(ip);
  return V4_BLOCKED.some(([base, bits]) => {
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return (value & mask) >>> 0 === (ipv4ToLong(base) & mask) >>> 0;
  });
}

function isPrivateIpv6(ip) {
  if (net.isIPv6(ip) !== true) return false;
  const norm = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (norm === "::" || norm === "::1") return true;
  // عناوين IPv4 المُسقطة داخل IPv6 تُفحص بقواعد IPv4
  const mapped = norm.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIpv4(mapped[1]);
  if (/^::ffff:/.test(norm) || /^64:ff9b:/.test(norm)) return true;
  if (/^f[cd][0-9a-f]{2}:/.test(norm)) return true; // unique local fc00::/7
  if (/^fe[89ab][0-9a-f]:/.test(norm)) return true; // link local fe80::/10
  if (/^ff[0-9a-f]{2}:/.test(norm)) return true; // multicast
  if (/^2001:0?db8:/.test(norm)) return true; // documentation
  return false;
}

const isPrivateIp = (ip) => isPrivateIpv4(ip) || isPrivateIpv6(ip);

const BLOCKED_HOST_NAMES = /^(localhost|.*\.localhost|.*\.local|.*\.internal|metadata\.google\.internal)$/i;

// فحص شكل الرابط قبل أي اتصال
function checkUrlShape(raw) {
  let u;
  try {
    u = new URL(String(raw || ""));
  } catch {
    return { ok: false, reason: "صيغة الرابط غير صحيحة" };
  }
  if (u.protocol !== "https:") return { ok: false, reason: "يُسمح ببروتوكول HTTPS فقط" };
  if (u.username || u.password) return { ok: false, reason: "لا يُسمح بتضمين بيانات دخول في الرابط" };
  if (u.port && u.port !== "443") return { ok: false, reason: "لا يُسمح إلا بالمنفذ 443" };
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (BLOCKED_HOST_NAMES.test(host)) return { ok: false, reason: "اسم مضيف محلي غير مسموح" };
  if (net.isIP(host) && isPrivateIp(host)) return { ok: false, reason: "عنوان شبكة داخلية غير مسموح" };
  if (!net.isIP(host) && !host.includes(".")) return { ok: false, reason: "اسم النطاق غير صالح" };
  return { ok: true, url: u.toString(), host };
}

// تحليل DNS ورفض المضيف إن أشار أي عنوان من عناوينه إلى شبكة داخلية
async function assertPublicHost(host, lookup = dnsPromises.lookup) {
  if (net.isIP(host)) {
    if (isPrivateIp(host)) throw new Error("عنوان شبكة داخلية غير مسموح");
    return [host];
  }
  let addrs;
  try {
    addrs = await lookup(host, { all: true });
  } catch {
    throw new Error(`تعذّر تحليل اسم النطاق (${host})`);
  }
  if (!addrs || !addrs.length) throw new Error(`لا توجد عناوين لاسم النطاق (${host})`);
  for (const a of addrs) {
    if (isPrivateIp(a.address)) throw new Error(`اسم النطاق يشير إلى شبكة داخلية (${a.address})`);
  }
  return addrs.map((a) => a.address);
}

// سلسلة أسباب الخطأ: undici يغلّف السبب الحقيقي داخل cause فيظهر "fetch failed" وحده،
// وهو لا يدل على شيء. نجمع الرموز والرسائل من السلسلة كاملة لتشخيص قابل للتصرّف.
function causeChain(err) {
  const parts = [];
  const seen = new Set();
  let cur = err;
  while (cur && typeof cur === "object" && !seen.has(cur)) {
    seen.add(cur);
    const bit = cur.code || cur.message;
    if (bit && !parts.includes(bit)) parts.push(String(bit));
    cur = cur.cause;
  }
  return parts.join(" ← ") || "سبب غير معروف";
}

// قراءة الجسم بسقف حجم صارم
async function readCapped(res, maxBytes) {
  const declared = Number(res.headers.get("content-length") || 0);
  if (declared && declared > maxBytes) throw new Error(`حجم الاستجابة يتجاوز الحد (${declared} بايت)`);
  if (!res.body) return "";
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let out = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new Error("حجم الاستجابة يتجاوز الحد المسموح");
    }
    out += decoder.decode(value, { stream: true });
  }
  return out + decoder.decode();
}

// جلب آمن مع متابعة التحويلات يدوياً وإعادة الفحص لكل قفزة
async function safeFetch(rawUrl, options = {}) {
  const { maxBytes, timeoutMs, maxRedirects } = { ...DEFAULTS, ...options };
  let current = rawUrl;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const shape = checkUrlShape(current);
    if (!shape.ok) throw new Error(shape.reason);
    await assertPublicHost(shape.host, options.lookup);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res;
    try {
      res = await (options.fetchImpl || fetch)(shape.url, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "user-agent": "CMS-HHC-RegulatoryIntelligence/1.0 (+compliance monitoring)",
          accept: "application/rss+xml, application/atom+xml, application/xml, application/json, text/html;q=0.8, */*;q=0.5",
          "accept-language": "ar,en;q=0.8",
        },
      });
    } catch (e) {
      throw new Error(
        e.name === "AbortError"
          ? `انتهت المهلة (${timeoutMs} م.ث) قبل استجابة المصدر ${shape.host}`
          : `تعذّر الاتصال بالمصدر ${shape.host}: ${causeChain(e)}`,
        { cause: e }
      );
    } finally {
      clearTimeout(timer);
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) throw new Error(`تحويل بلا وجهة (HTTP ${res.status})`);
      if (hop === maxRedirects) throw new Error("تجاوز عدد التحويلات المسموح");
      current = new URL(location, shape.url).toString();
      continue;
    }
    if (!res.ok) throw new Error(`استجابة غير ناجحة من ${shape.host} (HTTP ${res.status})`);

    const contentType = (res.headers.get("content-type") || "").toLowerCase();
    const body = await readCapped(res, maxBytes);
    return { url: shape.url, status: res.status, contentType, body };
  }
  throw new Error("تجاوز عدد التحويلات المسموح");
}

module.exports = {
  DEFAULTS, isPrivateIp, isPrivateIpv4, isPrivateIpv6,
  checkUrlShape, assertPublicHost, safeFetch, causeChain,
};
