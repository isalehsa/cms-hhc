// الرصد التنظيمي — المنطق الخالص (بلا اعتماد على Firestore أو DOM)
// يُستخدم من محرك المتصفح ومن الاختبارات الآلية على حدٍ سواء.

// ---------- تجزئة نصية ثابتة (FNV-1a 32-bit) لمفاتيح منع التكرار ----------
export function hashString(input) {
  let h = 0x811c9dc5;
  const s = String(input || "");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

// ---------- تطبيع الروابط ----------
// يزيل معاملات التتبّع والشظية ويوحّد الصيغة ليصير الرابط مفتاح هوية مستقراً
const TRACKING_PARAMS = /^(utm_|fbclid$|gclid$|mc_cid$|mc_eid$|ref$|source$)/i;

export function normalizeUrl(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  let u;
  try {
    u = new URL(s);
  } catch {
    return s;
  }
  u.hash = "";
  const keep = [];
  for (const [k, v] of u.searchParams) if (!TRACKING_PARAMS.test(k)) keep.push([k, v]);
  u.search = "";
  for (const [k, v] of keep.sort((a, b) => a[0].localeCompare(b[0]))) u.searchParams.append(k, v);
  u.hostname = u.hostname.toLowerCase();
  if ((u.protocol === "https:" && u.port === "443") || (u.protocol === "http:" && u.port === "80")) u.port = "";
  return u.toString().replace(/\/$/, "");
}

// ---------- التحقق من صلاحية رابط المصدر (الطبقة الأولى ضد SSRF) ----------
// الفحص العميق (تحليل DNS ومنع نطاقات الشبكة الداخلية) يجري في الخادم قبل الجلب،
// وهذه الطبقة تمنع حفظ روابط غير صالحة أصلاً من الواجهة.
const PRIVATE_HOST_RE =
  /^(localhost$|localhost\.|127\.|0\.|10\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$|\[?f[cd][0-9a-f]{2}:|metadata\.google\.internal$)/i;

export function validateSourceUrl(raw) {
  const s = String(raw || "").trim();
  if (!s) return { ok: false, reason: "الرابط مطلوب" };
  let u;
  try {
    u = new URL(s);
  } catch {
    return { ok: false, reason: "صيغة الرابط غير صحيحة" };
  }
  if (u.protocol !== "https:") return { ok: false, reason: "يُسمح ببروتوكول HTTPS فقط" };
  if (u.username || u.password) return { ok: false, reason: "لا يُسمح بتضمين بيانات دخول في الرابط" };
  if (PRIVATE_HOST_RE.test(u.hostname)) return { ok: false, reason: "لا يُسمح بعناوين الشبكة الداخلية" };
  if (!u.hostname.includes(".")) return { ok: false, reason: "اسم النطاق غير صالح" };
  if (u.port && u.port !== "443") return { ok: false, reason: "لا يُسمح إلا بالمنفذ 443" };
  return { ok: true, url: normalizeUrl(s), host: u.hostname };
}

// ---------- مفتاح منع التكرار لكل مستجد تنظيمي ----------
export function updateKey(sourceId, item) {
  const ext = String(item?.externalId || "").trim();
  const url = normalizeUrl(item?.url || "");
  const basis = ext || url || `${item?.title || ""}|${item?.publishedAt || ""}`;
  return `${sourceId || "manual"}::${hashString(basis)}`;
}

// ---------- عزل حقن التعليمات: تحويل المحتوى الخارجي إلى بيانات صرفة ----------
// يزيل المحارف الخفية ووسوم الأدوار المزيّفة وأسوار الشيفرة، ويقصّ الطول،
// ثم يُغلَّف النص بين حدّين ليُقدَّم للنموذج كبيانات لا كتعليمات.
const ROLE_TAG_RE = /<\/?(?:system|assistant|user|human)\b[^>]*>|\[\/?INST\]|<\|[^|>]{0,40}\|>/gi;
const FENCE_RE = /`{3,}/g;
// المحارف غير المرئية والتحكّم في الاتجاه — تُبنى بمُنشئ RegExp لتبقى الشيفرة نصاً مرئياً
const INVISIBLE_RE = new RegExp(
  "[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F-\\u009F\\u00AD" +
    "\\u200B-\\u200F\\u202A-\\u202E\\u2060-\\u2064\\u2066-\\u206F\\uFEFF]",
  "g"
);

export function sanitizeForPrompt(text, maxChars = 20000) {
  let t = String(text || "")
    .replace(INVISIBLE_RE, "")
    .replace(ROLE_TAG_RE, " ")
    .replace(FENCE_RE, " ")
    .replace(/\r\n?/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
  if (t.length > maxChars) t = `${t.slice(0, maxChars)}\n…(اقتُطع النص)`;
  return t;
}

export function wrapUntrusted(text, label = "محتوى_مصدر_خارجي") {
  return `<<<${label}>>>\n${sanitizeForPrompt(text)}\n<<<نهاية_${label}>>>`;
}

// ---------- تقدير الانطباق مبدئياً (يُستخدم عند غياب الذكاء الاصطناعي) ----------
export const DEFAULT_KEYWORDS = [
  "صحي", "صحة", "مستشفى", "مستشفيات", "رعاية", "طبي", "طبية", "مرضى", "منشأة صحية",
  "تجمع صحي", "ترخيص", "تراخيص", "دواء", "أدوية", "أجهزة طبية", "ممارس صحي",
  "بيانات شخصية", "خصوصية", "أمن سيبراني", "حوكمة", "التزام", "امتثال", "إفصاح",
  "مشتريات", "منافسات", "عقود", "زكاة", "ضريبة", "فوترة", "موارد بشرية", "توطين",
  "سلامة", "جودة", "اعتماد", "تأمين صحي", "ضمان صحي",
];

const HIGH_IMPACT_RE =
  /(غرامة|غرامات|عقوبة|عقوبات|جزاء|جزاءات|سجن|حبس|إلغاء الترخيص|سحب الترخيص|إيقاف النشاط|إغلاق)/;
const MED_IMPACT_RE = /(يلتزم|يجب على|تلتزم|إلزامي|وجوب|يُحظر|يحظر|اشتراط|متطلب)/;

export function scoreApplicability(text, keywords = DEFAULT_KEYWORDS) {
  const t = String(text || "");
  if (!t.trim()) return { applicability: "UNKNOWN", impact: "LOW", score: 0, matched: [] };
  const matched = [];
  for (const k of keywords) if (k && t.includes(k)) matched.push(k);
  const score = Math.min(1, matched.length / 6);
  const impact = HIGH_IMPACT_RE.test(t) ? "HIGH" : MED_IMPACT_RE.test(t) ? "MEDIUM" : "LOW";
  const applicability = matched.length >= 3 ? "APPLICABLE" : matched.length >= 1 ? "PARTIAL" : "NOT_APPLICABLE";
  return { applicability, impact, score: Math.round(score * 100) / 100, matched };
}

// ---------- استخراج المواعيد التنظيمية من النص ----------
const AR_DIGITS = { "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4", "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9" };
const toEn = (s) => String(s || "").replace(/[٠-٩]/g, (c) => AR_DIGITS[c]);

const MONTHS_AR = {
  "يناير": 1, "فبراير": 2, "مارس": 3, "أبريل": 4, "ابريل": 4, "مايو": 5, "يونيو": 6,
  "يوليو": 7, "أغسطس": 8, "اغسطس": 8, "سبتمبر": 9, "أكتوبر": 10, "اكتوبر": 10,
  "نوفمبر": 11, "ديسمبر": 12,
};

const pad = (n) => String(n).padStart(2, "0");
const isoDate = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const validYMD = (y, m, d) => y >= 2000 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31;

export function extractDeadlines(text, baseDateISO = null) {
  const t = toEn(String(text || ""));
  if (!t.trim()) return [];
  const out = [];
  const push = (date, label, kind) => {
    if (!date) return;
    if (out.some((x) => x.date === date && x.kind === kind)) return;
    out.push({ date, label: String(label || "").trim().slice(0, 160), kind });
  };

  // 1) تواريخ ميلادية رقمية: 2026-04-01 أو 01/04/2026
  for (const m of t.matchAll(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/g)) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (validYMD(y, mo, d)) push(isoDate(y, mo, d), m[0], "EXPLICIT");
  }
  for (const m of t.matchAll(/(\d{1,2})[-/](\d{1,2})[-/](\d{4})/g)) {
    const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (validYMD(y, mo, d)) push(isoDate(y, mo, d), m[0], "EXPLICIT");
  }
  // 2) تواريخ بأسماء الأشهر العربية: 1 أبريل 2026
  const monthNames = Object.keys(MONTHS_AR).join("|");
  for (const m of t.matchAll(new RegExp(`(\\d{1,2})\\s*(${monthNames})\\s*(\\d{4})`, "g"))) {
    const [d, mo, y] = [Number(m[1]), MONTHS_AR[m[2]], Number(m[3])];
    if (validYMD(y, mo, d)) push(isoDate(y, mo, d), m[0], "EXPLICIT");
  }
  // 3) مهل نسبية من تاريخ النشر: «خلال 90 يوماً» / «بعد 6 أشهر»
  const base = baseDateISO ? new Date(baseDateISO) : null;
  if (base && !isNaN(base)) {
    for (const m of t.matchAll(/(?:خلال|بعد|في مدة|مهلة)\s*(\d{1,4})\s*(يوم|يوماً|يوما|أيام|شهر|شهراً|شهرا|أشهر|سنة|سنوات)/g)) {
      const n = Number(m[1]);
      const unit = m[2];
      const days = /يوم|أيام/.test(unit) ? n : /شهر|أشهر/.test(unit) ? n * 30 : n * 365;
      const dt = new Date(base.getTime() + days * 86400000);
      push(dt.toISOString().slice(0, 10), m[0], "RELATIVE");
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 12);
}

// ---------- تحليل تغذية RSS / Atom (بلا مكتبات خارجية) ----------
export function decodeXml(s) {
  return String(s || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

const tagValue = (block, ...names) => {
  for (const name of names) {
    const re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i");
    const m = block.match(re);
    if (m) return decodeXml(m[1]);
    const selfClosing = block.match(new RegExp(`<${name}[^>]*\\bhref="([^"]+)"[^>]*/?>`, "i"));
    if (selfClosing) return decodeXml(selfClosing[1]);
  }
  return "";
};

export function parseFeed(xml, { limit = 40 } = {}) {
  const text = String(xml || "");
  const blocks = [...text.matchAll(/<(item|entry)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi)].map((m) => m[2]);
  const items = [];
  for (const b of blocks.slice(0, limit)) {
    const title = tagValue(b, "title");
    const link = tagValue(b, "link", "guid", "id");
    const published = tagValue(b, "pubDate", "published", "updated", "dc:date");
    const summary = tagValue(b, "description", "summary", "content:encoded", "content");
    if (!title && !link) continue;
    const d = published ? new Date(published) : null;
    items.push({
      externalId: tagValue(b, "guid", "id") || normalizeUrl(link),
      title: title || link,
      url: /^https?:\/\//i.test(link) ? link : "",
      publishedAt: d && !isNaN(d) ? d.toISOString() : null,
      summary: summary.slice(0, 4000),
    });
  }
  return items;
}

// ---------- تحليل استجابة JSON عامة ----------
export function parseJsonFeed(payload, { limit = 40 } = {}) {
  const arr = Array.isArray(payload)
    ? payload
    : payload?.items || payload?.data || payload?.results || payload?.entries || [];
  if (!Array.isArray(arr)) return [];
  return arr
    .slice(0, limit)
    .map((it) => {
      const url = it.url || it.link || it.href || it.permalink || "";
      const published = it.publishedAt || it.published || it.date || it.pubDate || it.created_at || null;
      const d = published ? new Date(published) : null;
      return {
        externalId: String(it.externalId ?? it.id ?? it.guid ?? url ?? it.title ?? ""),
        title: String(it.title || it.name || it.subject || "").slice(0, 400) || String(url),
        url: /^https?:\/\//i.test(url) ? url : "",
        publishedAt: d && !isNaN(d) ? d.toISOString() : null,
        summary: String(it.summary || it.description || it.body || it.content || "").slice(0, 4000),
      };
    })
    .filter((x) => x.title || x.url);
}

// ---------- استخراج روابط المستجدات من صفحة HTML ----------
export function parseHtmlLinks(html, baseUrl, { limit = 40, pattern = null } = {}) {
  const text = String(html || "");
  const out = [];
  const seen = new Set();
  const re = pattern ? new RegExp(pattern, "i") : null;
  for (const m of text.matchAll(/<a\b[^>]*href="([^"#][^"]*)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    let href = m[1];
    const label = decodeXml(m[2]).slice(0, 300);
    if (!label || label.length < 8) continue;
    try {
      href = new URL(href, baseUrl).toString();
    } catch {
      continue;
    }
    if (!/^https:/i.test(href)) continue;
    if (re && !re.test(href) && !re.test(label)) continue;
    const key = normalizeUrl(href);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ externalId: key, title: label, url: href, publishedAt: null, summary: "" });
    if (out.length >= limit) break;
  }
  return out;
}

// ---------- نطاق الأسبوع والملخّص الأسبوعي ----------
export function weekRange(refISO) {
  const ref = refISO ? new Date(refISO) : new Date();
  const end = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate(), 23, 59, 59));
  const start = new Date(end.getTime() - 6 * 86400000);
  start.setUTCHours(0, 0, 0, 0);
  return { from: start.toISOString(), to: end.toISOString() };
}

export function summarizeWeek(updates, { from, to }) {
  const inRange = (u) => {
    const d = u.detectedAt || u.createdAt || u.publishedAt;
    return d && d >= from && d <= to;
  };
  const week = (updates || []).filter(inRange);
  const by = (key) =>
    week.reduce((acc, u) => ((acc[u[key] || "UNKNOWN"] = (acc[u[key] || "UNKNOWN"] || 0) + 1), acc), {});
  return {
    from,
    to,
    total: week.length,
    byStatus: by("status"),
    byApplicability: by("applicability"),
    byImpact: by("impact"),
    approved: week.filter((u) => u.status === "APPROVED").length,
    pending: week.filter((u) => u.status === "ANALYZED" || u.status === "DETECTED").length,
    rejected: week.filter((u) => u.status === "REJECTED").length,
    highImpact: week.filter((u) => u.impact === "HIGH").length,
    generatedRequirements: week.reduce((s, u) => s + (u.generated?.requirementIds?.length || 0), 0),
    generatedRisks: week.reduce((s, u) => s + (u.generated?.riskIds?.length || 0), 0),
    generatedActions: week.reduce((s, u) => s + (u.generated?.findingIds?.length || 0), 0),
    items: week
      .slice()
      .sort((a, b) => String(b.detectedAt || "").localeCompare(String(a.detectedAt || "")))
      .map((u) => ({
        id: u.id, code: u.code || null, title: u.title, url: u.url || null,
        status: u.status, applicability: u.applicability || "UNKNOWN", impact: u.impact || "LOW",
        sourceName: u.sourceName || null, publishedAt: u.publishedAt || null, detectedAt: u.detectedAt || null,
      })),
  };
}

// ---------- كشف القفل المعلّق (منع تشغيل فحصين معاً) ----------
export const SCAN_LOCK_TTL_MS = 30 * 60 * 1000;
export function isLockStale(startedAt, nowMs = Date.now()) {
  if (!startedAt) return true;
  const t = new Date(startedAt).getTime();
  return isNaN(t) || nowMs - t > SCAN_LOCK_TTL_MS;
}
