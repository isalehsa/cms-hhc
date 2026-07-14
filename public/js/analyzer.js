// تحليل نص النظام/اللائحة: استخراج المواد والبنود وتصنيفها — يعمل بالكامل في المتصفح
// المسار الأساسي: Claude API مباشرة من المتصفح (مخرجات مقيدة بمخطط JSON عبر استدعاء أداة إجباري)
// المسار الاحتياطي: محلّل نصي بالأنماط عند عدم توفر مفتاح API
import { DEPARTMENTS, RISK_LEVELS, APPLICABILITY } from "./meta.js";

export const DEFAULT_MODEL = "claude-opus-4-8";

const ARTICLES_SCHEMA = {
  type: "object",
  properties: {
    articles: {
      type: "array",
      items: {
        type: "object",
        properties: {
          number: {
            type: "string",
            description: "رقم المادة أو البند كما ورد في النص (مثل: المادة الأولى، البند 3-2)",
          },
          title: { type: "string", description: "عنوان مختصر للمادة" },
          text: { type: "string", description: "النص الكامل للمادة أو البند دون اختصار" },
          applicability: {
            type: "string",
            enum: APPLICABILITY,
            description: "هل تنطبق هذه المادة على المنشأة",
          },
          risk_level: {
            type: "string",
            enum: RISK_LEVELS,
            description: "درجة الخطر المترتبة على عدم الالتزام بهذه المادة",
          },
          owning_department: {
            type: "string",
            enum: DEPARTMENTS,
            description: "الإدارة المالكة المسؤولة عن تطبيق هذه المادة",
          },
          rationale: {
            type: "string",
            description: "مبرر مختصر للتصنيف (سبب الانطباق ودرجة الخطر واختيار الإدارة)",
          },
          penalty: {
            type: "string",
            description:
              "نص الغرامة أو العقوبة أو الجزاء المنصوص عليه عند مخالفة هذه المادة كما ورد في النظام (المبلغ ونوع العقوبة)، أو سلسلة فارغة إن لم تُذكر عقوبة",
          },
        },
        required: [
          "number",
          "title",
          "text",
          "applicability",
          "risk_level",
          "owning_department",
          "rationale",
          "penalty",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["articles"],
  additionalProperties: false,
};

// حدود التقسيم: المخرجات بحجم النص تقريباً (نسخ نص المواد)، لذا تُقسَّم النصوص
// الطويلة عند بدايات المواد إلى أجزاء يُحلَّل كل منها في طلب مستقل ثم تُدمج النتائج
const MAX_OUTPUT_TOKENS = 64000;
const CHUNK_CHARS = 28000;

function systemPrompt(orgContext, part, total) {
  return `أنت محلل التزام تنظيمي خبير في الأنظمة واللوائح السعودية والخليجية.
${total > 1 ? `النص المعطى هو الجزء ${part} من ${total} من وثيقة واحدة قُسّمت لطولها — استخرج جميع المواد والبنود الواردة في هذا الجزء فقط كاملةً.` : ""}
مهمتك: استخراج جميع مواد وبنود النظام أو اللائحة المعطاة كاملةً دون إسقاط أي مادة، ثم تصنيف كل مادة:

1. applicability: هل تنطبق المادة على المنشأة أم لا. المواد التعريفية (التعريفات، النطاق، تاريخ النفاذ، أحكام تخص جهات أخرى) غالباً "لا تنطبق" كمتطلب تشغيلي.
2. risk_level: درجة الخطر المترتبة على عدم الالتزام (عالي/متوسط/منخفض) بحسب العقوبات المحتملة والأثر التنظيمي والمالي والسمعة.
3. owning_department: الإدارة المالكة الأنسب من القائمة المسموحة فقط.
4. rationale: مبرر مختصر بجملة أو جملتين.
5. penalty: انقل نص الغرامة/العقوبة/الجزاء المرتبط بالمادة إن وُجد (المبلغ ونوع العقوبة كما وردا في النص أو في باب العقوبات)، وإلا اتركه فارغاً — يُستخدم لاشتقاق سجل المخاطر آلياً.

قواعد صارمة:
- استخرج كل مادة وبند على حدة، والتزم بترقيم النص الأصلي في حقل number.
- انسخ نص المادة كاملاً في حقل text دون تلخيص أو حذف.
- لا تدمج مادتين في عنصر واحد.
- سجّل النتيجة كاملة عبر أداة record_articles.
${orgContext ? `\nسياق المنشأة (استخدمه لتحديد الانطباق والإدارة المالكة):\n${orgContext}` : ""}`;
}

// استدعاء Claude API من المتصفح مع بث الاستجابة (الطلبات الطويلة تتطلب البث)
// المخرجات مقيدة بالمخطط عبر إجبار النموذج على استدعاء أداة record_articles
async function analyzeWithClaude(regulationText, orgContext, { apiKey, model }, onProgress, part = 1, total = 1) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: model || DEFAULT_MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      stream: true,
      system: systemPrompt(orgContext, part, total),
      tools: [
        {
          name: "record_articles",
          description: "تسجيل جميع مواد النظام المستخرجة مع تصنيفها",
          input_schema: ARTICLES_SCHEMA,
        },
      ],
      tool_choice: { type: "tool", name: "record_articles" },
      messages: [
        {
          role: "user",
          content: `حلّل النظام/اللائحة التالية واستخرج جميع موادها وبنودها مصنّفة:\n\n${regulationText}`,
        },
      ],
    }),
  });
  const partLabel = total > 1 ? ` — الجزء ${part} من ${total}` : "";

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = err?.error?.message || `HTTP ${res.status}`;
    if (res.status === 401) throw new Error("مفتاح API غير صحيح — راجع الإعدادات ⚙");
    if (res.status === 429) throw new Error("تجاوزت حد الاستخدام المسموح لمفتاح API — أعد المحاولة لاحقاً");
    throw new Error(msg);
  }

  // قراءة بث SSE وتجميع مدخلات الأداة (input_json_delta)
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let json = "";
  let stopReason = null;

  const handleEvent = (data) => {
    if (data.type === "content_block_delta" && data.delta?.type === "input_json_delta") {
      json += data.delta.partial_json;
      if (onProgress) {
        onProgress(`جاري التحليل بالذكاء الاصطناعي${partLabel}… (~${Math.round(json.length / 1024)} ك.ب)`);
      }
    } else if (data.type === "message_delta" && data.delta?.stop_reason) {
      stopReason = data.delta.stop_reason;
    } else if (data.type === "error") {
      throw new Error(data.error?.message || "خطأ في بث الاستجابة");
    }
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop(); // آخر سطر قد يكون غير مكتمل
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      handleEvent(JSON.parse(payload));
    }
  }

  if (stopReason === "refusal") throw new Error("رفض النموذج معالجة هذا النص");
  if (stopReason === "max_tokens") {
    const err = new Error("النص طويل جداً — تجاوز حد المخرجات");
    err.code = "max_tokens";
    throw err;
  }
  const parsed = JSON.parse(json || "{}");
  return (parsed.articles || []).map((a) => ({ ...a, needs_review: false }));
}

// ---------- تقسيم النصوص الطويلة ----------

// تقسيم النص إلى أجزاء عند بدايات المواد قدر الإمكان
function splitIntoChunks(text, target = CHUNK_CHARS) {
  if (text.length <= target * 1.3) return [text];
  const lines = text.split(/\r?\n/);
  const chunks = [];
  let current = [];
  let size = 0;
  for (const line of lines) {
    // القطع المفضل: عند بداية مادة جديدة بعد بلوغ الحجم المستهدف
    if (size >= target && HEADING_RE.test(line) && current.length) {
      chunks.push(current.join("\n"));
      current = [];
      size = 0;
    }
    current.push(line);
    size += line.length + 1;
    // قطع اضطراري إذا لم تظهر عناوين مواد إطلاقاً
    if (size >= target * 1.7) {
      chunks.push(current.join("\n"));
      current = [];
      size = 0;
    }
  }
  if (current.length) chunks.push(current.join("\n"));
  return chunks.filter((c) => c.trim());
}

// شطر جزء إلى نصفين عند أقرب بداية مادة لمنتصفه (لإعادة المحاولة بعد تجاوز الحد)
function splitInHalf(text) {
  const lines = text.split(/\r?\n/);
  if (lines.length < 4) return null;
  const mid = Math.floor(lines.length / 2);
  let cut = mid;
  for (let offset = 0; offset < mid; offset++) {
    if (mid + offset < lines.length && HEADING_RE.test(lines[mid + offset])) { cut = mid + offset; break; }
    if (mid - offset > 0 && HEADING_RE.test(lines[mid - offset])) { cut = mid - offset; break; }
  }
  const a = lines.slice(0, cut).join("\n").trim();
  const b = lines.slice(cut).join("\n").trim();
  return a && b ? [a, b] : null;
}

// تحليل جزء واحد مع إعادة المحاولة بالشطر عند تجاوز حد المخرجات
async function analyzeChunk(text, orgContext, settings, onProgress, part, total, depth = 0) {
  try {
    return await analyzeWithClaude(text, orgContext, settings, onProgress, part, total);
  } catch (err) {
    if (err.code === "max_tokens" && depth < 2) {
      const halves = splitInHalf(text);
      if (halves) {
        if (onProgress) onProgress(`الجزء ${part} أطول من الحد — يُقسَّم ويُعاد تحليله…`);
        const a = await analyzeChunk(halves[0], orgContext, settings, onProgress, part, total, depth + 1);
        const b = await analyzeChunk(halves[1], orgContext, settings, onProgress, part, total, depth + 1);
        return [...a, ...b];
      }
    }
    throw err;
  }
}

// محلّل احتياطي بالأنماط: يستخرج المواد ويترك التصنيف بقيم افتراضية للمراجعة اليدوية
const HEADING_RE =
  /^\s*(?:(المادة|مادة|البند|بند|الفصل|الباب)\s*[:\-()]?\s*([٠-٩\d]+(?:[\/\-.][٠-٩\d]+)*|ال[أا]ولى|الثانية|الثالثة|الرابعة|الخامسة|السادسة|السابعة|الثامنة|التاسعة|العاشرة|[ء-ي]+\s+عشرة?|العشرون|الثلاثون|[ء-ي]+\s+وال[ء-ي]+)|([٠-٩\d]+(?:[\-.][٠-٩\d]+)*)\s*[-–.)])/;

export function analyzeHeuristically(regulationText) {
  const lines = regulationText.split(/\r?\n/);
  const articles = [];
  let current = null;

  const push = () => {
    if (current && current.body.join("\n").trim()) {
      articles.push({
        number: current.number,
        title: current.body[0]?.trim().slice(0, 80) || current.number,
        text: current.body.join("\n").trim(),
        applicability: "تنطبق",
        risk_level: "متوسط",
        owning_department: "الالتزام",
        rationale: "تصنيف مبدئي آلي (بدون ذكاء اصطناعي) — بحاجة إلى مراجعة مدير الالتزام",
        penalty: "",
        needs_review: true,
      });
    }
  };

  for (const line of lines) {
    const m = line.match(HEADING_RE);
    if (m) {
      push();
      const label = m[1] ? `${m[1]} ${m[2]}` : `البند ${m[3]}`;
      const rest = line.slice(m[0].length).replace(/^[:\-–.)\s]+/, "");
      current = { number: label.trim(), body: rest ? [rest] : [] };
    } else if (current) {
      current.body.push(line);
    } else if (line.trim()) {
      current = { number: "تمهيد", body: [line] };
    }
  }
  push();

  if (articles.length === 0 && regulationText.trim()) {
    articles.push({
      number: "1",
      title: "النص الكامل",
      text: regulationText.trim(),
      applicability: "تنطبق",
      risk_level: "متوسط",
      owning_department: "الالتزام",
      rationale: "تعذّر تقسيم النص إلى مواد — بحاجة إلى مراجعة يدوية",
      penalty: "",
      needs_review: true,
    });
  }
  return articles;
}

// settings: { apiKey, model } — بدون مفتاح يعمل المحلل الاحتياطي مباشرة
// onProgress(message): رسالة حالة عربية جاهزة للعرض
// النصوص الطويلة تُقسَّم تلقائياً إلى أجزاء تُحلَّل تباعاً ثم تُدمج نتائجها
export async function analyzeRegulation(regulationText, orgContext, settings, onProgress) {
  if (settings?.apiKey) {
    try {
      const chunks = splitIntoChunks(regulationText);
      const articles = [];
      for (let i = 0; i < chunks.length; i++) {
        if (onProgress && chunks.length > 1) {
          onProgress(`جاري التحليل بالذكاء الاصطناعي — الجزء ${i + 1} من ${chunks.length}…`);
        }
        const part = await analyzeChunk(
          chunks[i], orgContext, settings, onProgress, i + 1, chunks.length
        );
        articles.push(...part);
      }
      if (articles.length > 0) {
        return {
          method: "ai",
          articles,
          warning: chunks.length > 1
            ? `النص طويل فقُسّم آلياً إلى ${chunks.length} أجزاء ودُمجت النتائج (${articles.length} مادة) — تحقق من عدم تكرار المواد عند حدود الأجزاء`
            : null,
        };
      }
      // مخرجات فارغة من النموذج — نلجأ للمحلل الاحتياطي
      return { method: "heuristic", articles: analyzeHeuristically(regulationText) };
    } catch (err) {
      console.error("AI analysis failed, falling back to heuristic:", err);
      return {
        method: "heuristic",
        articles: analyzeHeuristically(regulationText),
        warning: `تعذّر التحليل بالذكاء الاصطناعي (${err.message}) — تم استخدام المحلل الاحتياطي`,
      };
    }
  }
  return { method: "heuristic", articles: analyzeHeuristically(regulationText) };
}
