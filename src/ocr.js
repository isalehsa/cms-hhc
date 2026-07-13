// OCR لملفات PDF الممسوحة ضوئياً — يعتمد tesseract.js (عربي + إنجليزي)
// بيانات اللغة تُنزَّل مرة واحدة وتُحفظ في مجلد البيانات؛ ثم يعمل دون اتصال
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { PDFParse } from "pdf-parse";
import { createWorker } from "tesseract.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.CHCC_DATA_DIR || path.join(__dirname, "..", "data");
const OCR_CACHE = path.join(DATA_DIR, "ocr-lang");
const MAX_OCR_PAGES = Number(process.env.CHCC_OCR_MAX_PAGES || 40);

export const OCR_LANGS = process.env.CHCC_OCR_LANGS || "ara+eng";

// مصادر تنزيل بيانات اللغة بالترتيب (الأولى قد تكون محجوبة خلف بعض الجدران النارية)
const LANG_SOURCES = [
  (lang) => `https://cdn.jsdelivr.net/npm/@tesseract.js-data/${lang}/4.0.0_best_int/${lang}.traineddata.gz`,
  (lang) => `https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/main/${lang}.traineddata`,
];

async function ensureLangData() {
  fs.mkdirSync(OCR_CACHE, { recursive: true });
  for (const lang of OCR_LANGS.split("+")) {
    const target = path.join(OCR_CACHE, `${lang}.traineddata`);
    if (fs.existsSync(target) && fs.statSync(target).size > 0) continue;

    let lastError = null;
    let done = false;
    for (const source of LANG_SOURCES) {
      const url = source(lang);
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        let buf = Buffer.from(await res.arrayBuffer());
        // فك الضغط إن كان الملف gzip (يبدأ بـ 0x1f8b)
        if (buf[0] === 0x1f && buf[1] === 0x8b) {
          const { gunzipSync } = await import("zlib");
          buf = gunzipSync(buf);
        }
        if (buf.length < 100000) throw new Error("ملف بيانات اللغة غير مكتمل");
        fs.writeFileSync(target + ".tmp", buf);
        fs.renameSync(target + ".tmp", target);
        done = true;
        break;
      } catch (err) {
        lastError = err;
      }
    }
    if (!done) {
      throw new Error(
        `تعذّر تنزيل بيانات لغة OCR (${lang}) — يتطلب أول استخدام اتصالاً بالإنترنت: ${lastError?.message}`
      );
    }
  }
}

let workerPromise = null;

async function getWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      await ensureLangData();
      // errorHandler يمنع أخطاء عامل tesseract من إسقاط العملية بأكملها
      let workerError = null;
      const worker = await createWorker(OCR_LANGS.split("+"), 1, {
        cachePath: OCR_CACHE,
        gzip: false,
        logger: () => {},
        errorHandler: (err) => {
          workerError = err instanceof Error ? err : new Error(String(err));
        },
      });
      if (workerError) throw workerError;
      return worker;
    })().catch((err) => {
      workerPromise = null;
      throw new Error(`تعذّرت تهيئة محرك OCR: ${err.message}`);
    });
  }
  return workerPromise;
}

// يحوّل صفحات PDF إلى صور ثم يستخرج النص منها
export async function ocrPdf(buffer) {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  let shots;
  try {
    shots = await parser.getScreenshot({ first: MAX_OCR_PAGES, scale: 2 });
  } finally {
    await parser.destroy().catch(() => {});
  }
  if (!shots.pages.length) throw new Error("تعذّر تحويل صفحات الملف إلى صور للمعالجة");

  const worker = await getWorker();
  const parts = [];
  for (const page of shots.pages) {
    const { data } = await worker.recognize(Buffer.from(page.data));
    parts.push(data.text || "");
  }
  const truncated = shots.total > shots.pages.length;
  return {
    text: parts.join("\n\n").trim(),
    pages_processed: shots.pages.length,
    total_pages: shots.total,
    truncated,
  };
}

export async function shutdownOcr() {
  if (workerPromise) {
    const w = await workerPromise.catch(() => null);
    await w?.terminate().catch(() => {});
    workerPromise = null;
  }
}
