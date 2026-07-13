// اقتراح المواد المرتبطة عبر الأنظمة المختلفة — تشابه نصي (جيب التمام على تكرار الكلمات)
// يعمل محلياً في المتصفح دون الحاجة لذكاء اصطناعي، بعد تطبيع النص العربي

const STOP_WORDS = new Set([
  "في", "من", "على", "إلى", "الى", "عن", "أن", "ان", "إن", "أو", "او", "و",
  "لا", "ما", "مع", "هذا", "هذه", "ذلك", "التي", "الذي", "كل", "بعد", "قبل",
  "عند", "غير", "بين", "كان", "يكون", "تكون", "وفق", "وفقاً", "حسب", "لدى",
  "ولا", "فيما", "كما", "إذا", "اذا", "ثم", "قد", "لم", "لن", "هو", "هي",
]);

export function normalizeArabic(text) {
  return String(text || "")
    .replace(/[ً-ٰٟ]/g, "") // إزالة التشكيل
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[^ء-يa-zA-Z0-9\s]/g, " ")
    .toLowerCase();
}

function tokens(text) {
  return normalizeArabic(text)
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w))
    .map((w) => w.replace(/^(ال|وال|بال|كال|فال|لل)/, "")) // إزالة أداة التعريف وسوابقها
    .filter((w) => w.length > 2);
}

function vectorize(text) {
  const vec = new Map();
  for (const t of tokens(text)) vec.set(t, (vec.get(t) || 0) + 1);
  return vec;
}

function cosine(a, b) {
  let dot = 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const [k, v] of small) {
    const w = large.get(k);
    if (w) dot += v * w;
  }
  if (!dot) return 0;
  const norm = (m) => Math.sqrt([...m.values()].reduce((s, v) => s + v * v, 0));
  return dot / (norm(a) * norm(b));
}

// يعيد أفضل المواد المشابهة لمادة معينة من بقية الأنظمة
export function findRelated(sourceArticle, regulations, sourceRegId, limit = 8) {
  const srcVec = vectorize(`${sourceArticle.title} ${sourceArticle.text}`);
  const scored = [];
  for (const reg of regulations) {
    if (reg.id === sourceRegId) continue;
    for (const art of reg.articles) {
      const score = cosine(srcVec, vectorize(`${art.title} ${art.text}`));
      if (score >= 0.12) {
        scored.push({
          regulation_id: reg.id,
          regulation_name: reg.name,
          article_id: art.id,
          number: art.number,
          title: art.title,
          owning_department: art.owning_department,
          risk_level: art.risk_level,
          score: Math.round(score * 100) / 100,
        });
      }
    }
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}
