// المساعدة بالذكاء الاصطناعي — ربط الالتزامات، واقتراح المخاطر، وتلخيص الوثائق
// يعيد استخدام نفس مسار Claude API المستخدم في محلّل الأنظمة (استدعاء أداة إجباري + بث)
// ومفتاح API نفسه المحفوظ محلياً في إعدادات التحليل الذكي.
import { settings, aiEnabled } from "./views/regulations.js";
import { DEFAULT_MODEL } from "./analyzer.js";
import { REQ_CATEGORIES, CRITICALITY, CONTROL_TYPES } from "./meta.js";

export { aiEnabled };

const DEFAULT_API_BASE = "https://api.anthropic.com";
const apiUrl = (base) => {
  const b = (base || DEFAULT_API_BASE).replace(/\/+$/, "");
  return b.endsWith("/v1/messages") ? b : b + "/v1/messages";
};

// استدعاء عام لـ Claude يُجبر النموذج على إرجاع كائن مطابق للمخطط عبر أداة record
async function callClaudeJSON({ system, user, schema, toolName = "record", maxTokens = 4000 }, onProgress) {
  if (!aiEnabled()) throw new Error("المساعد الذكي غير مفعّل — أضف مفتاح Claude API من الإعدادات ⚙");
  const res = await fetch(apiUrl(settings.apiBase), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": settings.apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: settings.model || DEFAULT_MODEL,
      max_tokens: maxTokens,
      stream: true,
      system,
      tools: [{ name: toolName, description: "تسجيل النتيجة المنظّمة", input_schema: schema }],
      tool_choice: { type: "tool", name: toolName },
      messages: [{ role: "user", content: user }],
    }),
  }).catch(() => { throw new Error("تعذّر الاتصال بخدمة الذكاء الاصطناعي — تحقّق من الشبكة أو أضف وسيطاً من الإعدادات ⚙"); });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    if (res.status === 401) throw new Error("مفتاح API غير صحيح — راجع الإعدادات ⚙");
    if (res.status === 429) throw new Error("تجاوزت حد الاستخدام — أعد المحاولة لاحقاً");
    throw new Error(err?.error?.message || `HTTP ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "", json = "", stopReason = null;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop();
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      const data = JSON.parse(payload);
      if (data.type === "content_block_delta" && data.delta?.type === "input_json_delta") {
        json += data.delta.partial_json;
        onProgress?.(`جاري التحليل بالذكاء الاصطناعي… (~${Math.round(json.length / 1024)} ك.ب)`);
      } else if (data.type === "message_delta" && data.delta?.stop_reason) {
        stopReason = data.delta.stop_reason;
      } else if (data.type === "error") {
        throw new Error(data.error?.message || "خطأ في بث الاستجابة");
      }
    }
  }
  if (stopReason === "refusal") throw new Error("رفض النموذج معالجة هذا المحتوى");
  return JSON.parse(json || "{}");
}

const catList = Object.values(REQ_CATEGORIES).join("، ");
const critList = Object.values(CRITICALITY).join("، ");

// ---------- 1) ربط الالتزامات: اقتراح تصنيف المتطلب والالتزامات المرتبطة ----------
export function suggestClassification(text, deptNames, onProgress) {
  const schema = {
    type: "object",
    properties: {
      category: { type: "string", enum: Object.keys(REQ_CATEGORIES), description: `التصنيف الموضوعي (${catList})` },
      criticality: { type: "string", enum: Object.keys(CRITICALITY), description: `درجة الأهمية (${critList})` },
      ownerDepartment: { type: "string", description: "اسم الإدارة المالكة الأنسب من قائمة إدارات المنشأة" },
      relatedObligations: { type: "array", items: { type: "object", properties: { title: { type: "string" }, why: { type: "string" } }, required: ["title", "why"], additionalProperties: false }, description: "التزامات أو ضوابط مرتبطة يُقترح ربطها" },
      rationale: { type: "string", description: "مبرر مختصر للتصنيف" },
    },
    required: ["category", "criticality", "ownerDepartment", "relatedObligations", "rationale"],
    additionalProperties: false,
  };
  const system = `أنت خبير التزام تنظيمي في القطاع الصحي السعودي. صنّف المتطلب التنظيمي المُعطى واقترح الالتزامات المرتبطة.
اختر الإدارة المالكة من هذه القائمة فقط عند الإمكان: ${deptNames.join("، ")}.
سجّل النتيجة عبر الأداة record.`;
  return callClaudeJSON({ system, user: `المتطلب:\n${text}`, schema, toolName: "record" }, onProgress);
}

// ---------- 2) اقتراح المخاطر لالتزام/متطلب ----------
export function suggestRisks(text, onProgress) {
  const schema = {
    type: "object",
    properties: {
      risks: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string", description: "عنوان الخطر" },
            description: { type: "string" },
            cause: { type: "string", description: "السبب الجذري المحتمل" },
            likelihood: { type: "integer", minimum: 1, maximum: 5, description: "الاحتمالية 1-5" },
            impact: { type: "integer", minimum: 1, maximum: 5, description: "الأثر 1-5" },
            controls: { type: "array", items: { type: "object", properties: { name: { type: "string" }, type: { type: "string", enum: CONTROL_TYPES } }, required: ["name", "type"], additionalProperties: false } },
            kri: { type: "string", description: "مؤشر خطر رئيسي مقترح" },
          },
          required: ["title", "description", "cause", "likelihood", "impact", "controls", "kri"],
          additionalProperties: false,
        },
      },
    },
    required: ["risks"],
    additionalProperties: false,
  };
  const system = `أنت خبير إدارة مخاطر الالتزام. من نص الالتزام/المتطلب المُعطى، اقترح خطر عدم الالتزام الأبرز (خطراً إلى ثلاثة) مع تقدير الاحتمالية والأثر (1-5) وضوابط مقترحة ومؤشر خطر. سجّل النتيجة عبر الأداة record.`;
  return callClaudeJSON({ system, user: `الالتزام/المتطلب:\n${text}`, schema, toolName: "record" }, onProgress);
}

// ---------- 3) تلخيص وثيقة ----------
export function summarizeDocument(text, onProgress) {
  const schema = {
    type: "object",
    properties: {
      summary: { type: "string", description: "ملخّص تنفيذي موجز بالعربية" },
      keyObligations: { type: "array", items: { type: "string" }, description: "أبرز الالتزامات/المتطلبات" },
      penalties: { type: "array", items: { type: "string" }, description: "الغرامات والعقوبات المذكورة إن وُجدت" },
      recommendations: { type: "array", items: { type: "string" }, description: "توصيات عملية للامتثال" },
    },
    required: ["summary", "keyObligations", "penalties", "recommendations"],
    additionalProperties: false,
  };
  const system = `أنت خبير التزام. لخّص الوثيقة التنظيمية المُعطاة بالعربية تلخيصاً تنفيذياً، واستخرج أبرز الالتزامات والغرامات وتوصيات الامتثال. سجّل النتيجة عبر الأداة record.`;
  // قصّ النصوص الطويلة جداً لحدود معقولة للطلب الواحد
  const clipped = text.length > 24000 ? text.slice(0, 24000) + "\n…(اقتُطع النص)" : text;
  return callClaudeJSON({ system, user: `الوثيقة:\n${clipped}`, schema, toolName: "record", maxTokens: 2000 }, onProgress);
}
