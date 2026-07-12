// استخراج نص النظام/اللائحة من ملفات PDF و Word (docx)
import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";

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
    try {
      const result = await parser.getText();
      // نجمع نصوص الصفحات مباشرة لتفادي فواصل الصفحات (-- N of M --) التي يضيفها pdf-parse
      const raw = result.pages?.length
        ? result.pages.map((p) => p.text || "").join("\n\n")
        : result.text || "";
      const text = normalize(raw);
      if (!text) {
        throw new Error(
          "لم يُعثر على نص في ملف PDF — إن كان الملف ممسوحاً ضوئياً (صور) فيلزم تحويله بتقنية OCR أولاً أو لصق النص يدوياً"
        );
      }
      return text;
    } finally {
      await parser.destroy().catch(() => {});
    }
  }

  if (
    ext === "docx" ||
    mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    const { value } = await mammoth.extractRawText({ buffer });
    const text = normalize(value || "");
    if (!text) throw new Error("ملف Word فارغ أو تعذّرت قراءته");
    return text;
  }

  if (ext === "doc") {
    throw new Error("صيغة .doc القديمة غير مدعومة — احفظ الملف بصيغة .docx أو PDF ثم أعد المحاولة");
  }

  throw new Error("صيغة الملف غير مدعومة — الصيغ المسموحة: PDF أو Word (.docx)");
}
