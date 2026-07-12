// تحليل نص النظام/اللائحة: استخراج المواد والبنود وتصنيفها
// المسار الأساسي: Claude API (مخرجات منظمة وفق مخطط JSON)
// المسار الاحتياطي: محلّل نصي بالأنماط عند عدم توفر مفتاح API
import Anthropic from "@anthropic-ai/sdk";
import { DEPARTMENTS, RISK_LEVELS, APPLICABILITY } from "./meta.js";

const MODEL = process.env.CHCC_MODEL || "claude-opus-4-8";

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
${orgContext ? `\nسياق المنشأة (استخدمه لتحديد الانطباق والإدارة المالكة):\n${orgContext}` : ""}`;
}

async function analyzeWithClaude(regulationText, orgContext) {
  const client = new Anthropic();
  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 64000,
    thinking: { type: "adaptive" },
    system: systemPrompt(orgContext),
    output_config: { format: { type: "json_schema", schema: ARTICLES_SCHEMA } },
    messages: [
      {
        role: "user",
        content: `حلّل النظام/اللائحة التالية واستخرج جميع موادها وبنودها مصنّفة:\n\n${regulationText}`,
      },
    ],
  });
  const message = await stream.finalMessage();
  if (message.stop_reason === "refusal") {
    throw new Error("رفض النموذج معالجة هذا النص");
  }
  if (message.stop_reason === "max_tokens") {
    throw new Error("النص طويل جداً — تجاوز حد المخرجات، جرّب تقسيم اللائحة");
  }
  const text = message.content.find((b) => b.type === "text")?.text || "{}";
  const parsed = JSON.parse(text);
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

export async function analyzeRegulation(regulationText, orgContext) {
  if (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN) {
    try {
      const articles = await analyzeWithClaude(regulationText, orgContext);
      if (articles.length > 0) return { method: "ai", articles };
      // مخرجات فارغة من النموذج — نلجأ للمحلل الاحتياطي
      return { method: "heuristic", articles: analyzeHeuristically(regulationText) };
    } catch (err) {
      console.error("AI analysis failed, falling back to heuristic:", err.message);
      return {
        method: "heuristic",
        articles: analyzeHeuristically(regulationText),
        warning: `تعذّر التحليل بالذكاء الاصطناعي (${err.message}) — تم استخدام المحلل الاحتياطي`,
      };
    }
  }
  return { method: "heuristic", articles: analyzeHeuristically(regulationText) };
}
