// استخراج نص النظام/اللائحة من ملفات PDF و Word (docx) — يعمل بالكامل في المتصفح
// ملفات PDF بلا طبقة نصية (ممسوحة ضوئياً) تُعالج تلقائياً بتقنية OCR (tesseract.js)
// المكتبات: pdf.js (تُحمَّل عند الحاجة) + mammoth و Tesseract (سكربتات عامة من index.html)

const PDFJS_URL = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs";
const PDFJS_WORKER_URL =
  "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs";

const MAX_OCR_PAGES = 40;
const OCR_LANGS = ["ara", "eng"];

let pdfjsPromise = null;
function getPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import(PDFJS_URL).then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
      return pdfjs;
    });
  }
  return pdfjsPromise;
}

function normalize(text) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// طبقة النص في PDF: نجمع عناصر كل صفحة أسطراً حسب موضعها الرأسي
function pageText(content) {
  const lines = [];
  let lastY = null;
  let line = [];
  for (const item of content.items) {
    if (!("str" in item)) continue;
    const y = item.transform?.[5];
    if (lastY !== null && y !== undefined && Math.abs(y - lastY) > 2) {
      lines.push(line.join(" "));
      line = [];
    }
    if (item.str) line.push(item.str);
    if (y !== undefined) lastY = y;
  }
  if (line.length) lines.push(line.join(" "));
  return lines.join("\n");
}

// OCR: تحويل صفحات PDF إلى صور ثم التعرف الضوئي على الحروف (عربي + إنجليزي)
// بيانات اللغة (~15MB) تُنزَّل في متصفح المستخدم عند أول استخدام وتُخزَّن مؤقتاً
async function ocrPdf(pdf, onProgress) {
  if (typeof Tesseract === "undefined") {
    throw new Error("مكتبة OCR لم تُحمَّل — تحقق من اتصالك بالإنترنت وأعد تحميل الصفحة");
  }
  const total = pdf.numPages;
  const pages = Math.min(total, MAX_OCR_PAGES);
  if (onProgress) onProgress("جاري تهيئة محرك OCR (تنزيل بيانات اللغة عند أول استخدام)…");
  const worker = await Tesseract.createWorker(OCR_LANGS);
  try {
    const parts = [];
    for (let i = 1; i <= pages; i++) {
      if (onProgress) onProgress(`معالجة OCR — صفحة ${i} من ${pages}…`);
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
      const { data } = await worker.recognize(canvas);
      parts.push(data.text || "");
      canvas.width = canvas.height = 0; // تحرير الذاكرة
    }
    return {
      text: parts.join("\n\n").trim(),
      pages_processed: pages,
      total_pages: total,
      truncated: total > pages,
    };
  } finally {
    await worker.terminate().catch(() => {});
  }
}

// onProgress(message): تحديث حالة الاستخراج في الواجهة (خصوصاً أثناء OCR)
export async function extractText(file, onProgress) {
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  if (file.size > 25 * 1024 * 1024) {
    throw new Error("حجم الملف يتجاوز الحد المسموح (25 م.ب)");
  }
  const buffer = await file.arrayBuffer();

  if (ext === "pdf" || file.type === "application/pdf") {
    const pdfjs = await getPdfjs();
    const pdf = await pdfjs
      .getDocument({ data: new Uint8Array(buffer) })
      .promise.catch(() => {
        throw new Error("تعذّرت قراءة ملف PDF — قد يكون تالفاً أو محمياً بكلمة مرور");
      });
    try {
      const parts = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        parts.push(pageText(await page.getTextContent()));
      }
      const text = normalize(parts.join("\n\n"));
      if (text) return { text };

      // لا توجد طبقة نصية — ملف ممسوح ضوئياً: نعالجه بالتعرف الضوئي على الحروف
      const ocr = await ocrPdf(pdf, onProgress);
      const ocrText = normalize(ocr.text);
      if (!ocrText) {
        throw new Error(
          "تعذّر استخراج نص من الملف حتى بعد المعالجة الضوئية (OCR) — جودة المسح منخفضة جداً"
        );
      }
      return {
        text: ocrText,
        ocr: true,
        note: ocr.truncated
          ? `عولج ${ocr.pages_processed} من أصل ${ocr.total_pages} صفحة بتقنية OCR — راجع النص ودقّقه`
          : `استُخرج النص بتقنية OCR (${ocr.pages_processed} صفحة) — راجع النص ودقّقه قبل التحليل`,
      };
    } finally {
      await pdf.destroy().catch(() => {});
    }
  }

  if (
    ext === "docx" ||
    file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    if (typeof mammoth === "undefined") {
      throw new Error("مكتبة قراءة Word لم تُحمَّل — تحقق من اتصالك بالإنترنت وأعد تحميل الصفحة");
    }
    const { value } = await mammoth.extractRawText({ arrayBuffer: buffer });
    const text = normalize(value || "");
    if (!text) throw new Error("ملف Word فارغ أو تعذّرت قراءته");
    return { text };
  }

  if (ext === "doc") {
    throw new Error("صيغة .doc القديمة غير مدعومة — احفظ الملف بصيغة .docx أو PDF ثم أعد المحاولة");
  }

  throw new Error("صيغة الملف غير مدعومة — الصيغ المسموحة: PDF أو Word (.docx)");
}
