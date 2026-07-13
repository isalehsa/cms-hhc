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
        },
        required: [
          "number",
          "title",
          "text",
          "applicability",
          "risk_level",
          "owning_department",
          "rationale",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["articles"],
  additionalProperties: false,
};

function systemPrompt(orgContext) {
  return `أنت محلل التزام تنظيمي خبير في الأنظمة واللوائح السعودية والخليجية.
مهمتك: استخراج جميع مواد وبنود النظام أو اللائحة المعطاة كاملةً دون إسقاط أي مادة، ثم تصنيف كل مادة:

1. applicability: هل تنطبق المادة على المنشأة أم لا. المواد التعريفية (التعريفات، النطاق، تاريخ النفاذ، أحكام تخص جهات أخرى) غالباً "لا تنطبق" كمتطلب تشغيلي.
2. risk_level: درجة الخطر المترتبة على عدم الالتزام (عالي/متوسط/منخفض) بحسب العقوبات المحتملة والأثر التنظيمي والمالي والسمعة.
3. owning_department: الإدارة المالكة الأنسب من القائمة المسموحة فقط.
4. rationale: مبرر مختصر بجملة أو جملتين.

قواعد صارمة:
- استخرج كل مادة وبند على حدة، والتزم بترقيم النص الأصلي في حقل number.
- انسخ نص المادة كاملاً في حقل text دون تلخيص أو حذف.
- لا تدمج مادتين في عنصر واحد.
- سجّل النتيجة كاملة عبر أداة record_articles.
${orgContext ? `\nسياق المنشأة (استخدمه لتحديد الانطباق والإدارة المالكة):\n${orgContext}` : ""}`;
}

// استدعاء Claude API من المتصفح مع بث الاستجابة (الطلبات الطويلة تتطلب البث)
// المخرجات مقيدة بالمخطط عبر إجبار النموذج على استدعاء أداة record_articles
async function analyzeWithClaude(regulationText, orgContext, { apiKey, model }, onProgress) {
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
      max_tokens: 32000,
      stream: true,
      system: systemPrompt(orgContext),
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
      if (onProgress) onProgress(json.length);
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
    throw new Error("النص طويل جداً — تجاوز حد المخرجات، جرّب تقسيم اللائحة");
  }
  const parsed = JSON.parse(json || "{}");
  return (parsed.articles || []).map((a) => ({ ...a, needs_review: false }));
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
      needs_review: true,
    });
  }
  return articles;
}

// settings: { apiKey, model } — بدون مفتاح يعمل المحلل الاحتياطي مباشرة
export async function analyzeRegulation(regulationText, orgContext, settings, onProgress) {
  if (settings?.apiKey) {
    try {
      const articles = await analyzeWithClaude(regulationText, orgContext, settings, onProgress);
      if (articles.length > 0) return { method: "ai", articles };
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
