// استخراج نص النظام/اللائحة من ملفات PDF و Word (docx)
// ملفات PDF بلا طبقة نصية (ممسوحة ضوئياً) تُعالج تلقائياً بتقنية OCR
import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";
import { ocrPdf } from "./ocr.js";

function normalize(text) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function extractText(filename, buffer, mimetype = "") {
  const ext = (filename.split(".").pop() || "").toLowerCase();

  if (ext === "pdf" || mimetype === "application/pdf") {
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    let text;
    try {
      const result = await parser.getText();
      // نجمع نصوص الصفحات مباشرة لتفادي فواصل الصفحات (-- N of M --) التي يضيفها pdf-parse
      const raw = result.pages?.length
        ? result.pages.map((p) => p.text || "").join("\n\n")
        : result.text || "";
      text = normalize(raw);
    } finally {
      await parser.destroy().catch(() => {});
    }
    if (text) return { text };

    // لا توجد طبقة نصية — ملف ممسوح ضوئياً: نعالجه بالتعرف الضوئي على الحروف
    const ocr = await ocrPdf(buffer);
    const ocrText = normalize(ocr.text);
    if (!ocrText) {
      throw new Error("تعذّر استخراج نص من الملف حتى بعد المعالجة الضوئية (OCR) — جودة المسح منخفضة جداً");
    }
    return {
      text: ocrText,
      ocr: true,
      note: ocr.truncated
        ? `عولج ${ocr.pages_processed} من أصل ${ocr.total_pages} صفحة بتقنية OCR — راجع النص ودقّقه`
        : `استُخرج النص بتقنية OCR (${ocr.pages_processed} صفحة) — راجع النص ودقّقه قبل التحليل`,
    };
  }

  if (
    ext === "docx" ||
    mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    const { value } = await mammoth.extractRawText({ buffer });
    const text = normalize(value || "");
    if (!text) throw new Error("ملف Word فارغ أو تعذّرت قراءته");
    return { text };
  }

  if (ext === "doc") {
    throw new Error("صيغة .doc القديمة غير مدعومة — احفظ الملف بصيغة .docx أو PDF ثم أعد المحاولة");
  }

  throw new Error("صيغة الملف غير مدعومة — الصيغ المسموحة: PDF أو Word (.docx)");
}
