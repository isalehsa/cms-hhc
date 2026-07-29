// استيراد وتصدير نموذج تقييم نضج الالتزام بصيغة Excel (xlsx) — كلياً في المتصفح
// يعتمد نسخة المتصفح من مكتبة ExcelJS (سكربت عام من index.html)
// التصدير: نموذج معبّأ بالقيم الحالية ليعبّئه التجمع؛ الاستيراد: عكس القيم على النظام
import { enDigits } from "./ui.js";

function requireExcel() {
  if (typeof ExcelJS === "undefined") {
    throw new Error("مكتبة Excel لم تُحمَّل — تحقق من اتصالك بالإنترنت وأعد تحميل الصفحة");
  }
}

// قراءة نص خلية أياً كان نوع قيمتها (نص، رقم، رابط تشعبي، نص منسّق، صيغة)
function cellText(v) {
  if (v == null) return "";
  if (typeof v === "object") {
    if (v.text != null) return String(v.text);
    if (v.result != null) return String(v.result);
    if (v.hyperlink) return String(v.hyperlink);
    if (Array.isArray(v.richText)) return v.richText.map((r) => r.text).join("");
    return "";
  }
  return String(v);
}

// درجة صحيحة بين 0 و3، وإلا null (خلية فارغة أو قيمة غير صالحة)
function parseScore(v) {
  const t = enDigits(cellText(v)).trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isInteger(n) && n >= 0 && n <= 3 ? n : null;
}

// تطبيع نص المعيار للمطابقة: أرقام إنجليزية، توحيد الفراغات، حذف علامات الترقيم في النهاية
const norm = (s) =>
  enDigits(String(s || "")).replace(/\s+/g, " ").replace(/[.،:؛]+$/g, "").trim();

function downloadBlob(buffer, filename) {
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// تصدير نموذج Excel معبّأ بالقيم الحالية للتقييم — يُنزَّل في المتصفح
export async function downloadMaturityTemplate(m, clusterLabel = "") {
  requireExcel();
  const wb = new ExcelJS.Workbook();
  wb.creator = "نظام إدارة الالتزام";
  wb.created = new Date();
  const ws = wb.addWorksheet("تقييم النضج", { views: [{ rightToLeft: true }] });
  ws.columns = [
    { header: "المحور", key: "domain", width: 26 },
    { header: "المعيار", key: "crit", width: 62 },
    { header: "التقييم الذاتي (0-3)", key: "self", width: 18 },
    { header: "مراجعة الشركة (0-3)", key: "review", width: 18 },
    { header: "رابط الدليل", key: "evidence", width: 42 },
  ];
  const headRow = ws.getRow(1);
  headRow.font = { bold: true };
  headRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8F0EC" } };
  headRow.alignment = { horizontal: "right", vertical: "middle", wrapText: true };

  for (const dom of m.domains || []) {
    for (const c of dom.criteria) {
      const row = ws.addRow({
        domain: dom.name,
        crit: c.text,
        self: c.selfScore || 0,
        review: c.reviewScore ?? "",
        evidence: c.evidence || "",
      });
      row.alignment = { wrapText: true, vertical: "top", horizontal: "right" };
      // تقييد قيم درجات التقييم بين 0 و3 (اختياري ولا يعطّل الاستيراد)
      for (const key of ["self", "review"]) {
        row.getCell(key).dataValidation = {
          type: "whole", operator: "between", allowBlank: true, formulae: [0, 3],
          showErrorMessage: true, error: "أدخل رقماً بين 0 و3", errorTitle: "قيمة غير صالحة",
        };
      }
    }
  }
  ws.autoFilter = { from: "A1", to: { row: 1, column: 5 } };
  const buffer = await wb.xlsx.writeBuffer();
  const safe = (clusterLabel || m.code || "تقييم-نضج").replace(/[\\/*?:\[\]]/g, "-");
  downloadBlob(buffer, `تقييم-نضج-${safe}-ر${m.quarter}-${m.year}.xlsx`);
}

// استيراد ملف Excel وعكس قيمه على نسخة من محاور التقييم
// mode: "self" لعكس التقييم الذاتي والأدلة، "review" لعكس درجات مراجعة الشركة
// يعيد { domains, applied, total } — domains نسخة محدّثة جاهزة للحفظ
export async function importMaturityExcel(file, m, mode = "self") {
  requireExcel();
  const buffer = await file.arrayBuffer();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer).catch(() => {
    throw new Error("تعذّرت قراءة الملف — تأكد أنه بصيغة Excel (.xlsx)");
  });
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("الملف لا يحتوي على أوراق عمل");

  // تحديد أعمدة النموذج من صف العناوين حسب الكلمات المفتاحية
  let cCrit = 0, cSelf = 0, cReview = 0, cEv = 0;
  ws.getRow(1).eachCell((cell, col) => {
    const t = cellText(cell.value);
    if (/معيار/.test(t)) cCrit = col;
    else if (/ذاتي/.test(t)) cSelf = col;
    else if (/مراجع|الشركة/.test(t)) cReview = col;
    else if (/دليل|رابط/.test(t)) cEv = col;
  });

  // جمع صفوف البيانات (تخطّي صف العناوين والصفوف الفارغة)
  const rows = [];
  ws.eachRow((row, rn) => {
    if (rn === 1) return;
    const crit = cCrit ? cellText(row.getCell(cCrit).value) : "";
    const self = cSelf ? parseScore(row.getCell(cSelf).value) : null;
    const review = cReview ? parseScore(row.getCell(cReview).value) : null;
    const ev = cEv ? cellText(row.getCell(cEv).value).trim() : "";
    if (!crit && self == null && review == null && !ev) return;
    rows.push({ crit, self, review, ev });
  });
  if (!rows.length) throw new Error("لم يُعثر على بيانات في الملف");

  // خريطة بنص المعيار للمطابقة الدقيقة، مع بديل حسب الترتيب عند تعذّر المطابقة
  const byText = new Map();
  for (const r of rows) if (r.crit) byText.set(norm(r.crit), r);

  const domains = JSON.parse(JSON.stringify(m.domains || []));
  let applied = 0, total = 0, k = 0;
  for (const dom of domains) {
    for (const c of dom.criteria) {
      total++;
      const r = byText.get(norm(c.text)) || rows[k];
      k++;
      if (!r) continue;
      if (mode === "review") {
        if (r.review != null) { c.reviewScore = r.review; applied++; }
      } else {
        let changed = false;
        if (r.self != null) { c.selfScore = r.self; changed = true; }
        if (r.ev) { c.evidence = r.ev; changed = true; }
        if (changed) applied++;
      }
    }
  }
  if (!applied) {
    throw new Error("لم تُطابَق أي معايير — تأكد أن الملف بنفس بنية النموذج المصدَّر");
  }
  return { domains, applied, total };
}

// استيراد قيم التقييم من «النموذج القديم» المستخدم سابقاً (ورقة «نموذج التقييم»):
// صف عناوين يحوي «المعيار» و«درجة تقييم المعيار»، والمعايير في عمود المعيار ودرجاتها
// في عمود الدرجة (0-3). تُعكس الدرجة على التقييم الذاتي، والملاحظات إن وُجدت.
// المطابقة بنص المعيار مع بديل حسب الترتيب.
export async function importLegacyMaturityExcel(file, m) {
  requireExcel();
  const buffer = await file.arrayBuffer();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer).catch(() => {
    throw new Error("تعذّرت قراءة الملف — تأكد أنه بصيغة Excel (.xlsx)");
  });
  const ws = wb.worksheets.find((w) => /نموذج|تقييم/.test(w.name)) || wb.worksheets[0];
  if (!ws) throw new Error("الملف لا يحتوي على أوراق عمل");

  // ابحث عن صف العناوين ضمن أول 15 صفاً: يحوي عمود «المعيار» وعمود «درجة تقييم المعيار»
  let headerRow = 0, cCrit = 0, cScore = 0, cNote = 0;
  const maxScan = Math.min(ws.rowCount || 15, 15);
  for (let r = 1; r <= maxScan && !headerRow; r++) {
    let crit = 0, score = 0, note = 0;
    ws.getRow(r).eachCell((cell, col) => {
      const t = cellText(cell.value).trim();
      if (!crit && /^المعيار/.test(t)) crit = col;
      if (!score && /درجة تقييم المعيار|درجة المعيار|^الدرجة/.test(t)) score = col;
      if (!note && /^الملاحظات|^ملاحظات/.test(t)) note = col;
    });
    if (crit && score) { headerRow = r; cCrit = crit; cScore = score; cNote = note; }
  }
  if (!headerRow) {
    throw new Error("تعذّر التعرّف على أعمدة النموذج القديم (المعيار / درجة تقييم المعيار)");
  }

  // اجمع صفوف المعايير (كل صف له نص معيار)، وتخطَّ صفوف الإجماليات في الأسفل
  const rows = [];
  const lastRow = ws.rowCount || headerRow;
  for (let r = headerRow + 1; r <= lastRow; r++) {
    const row = ws.getRow(r);
    const crit = cellText(row.getCell(cCrit).value).trim();
    if (!crit) continue;
    rows.push({
      crit,
      score: parseScore(row.getCell(cScore).value),
      note: cNote ? cellText(row.getCell(cNote).value).trim() : "",
    });
  }
  if (!rows.length) throw new Error("لم يُعثر على معايير في الملف");

  const byText = new Map();
  for (const r of rows) if (r.crit) byText.set(norm(r.crit), r);

  const domains = JSON.parse(JSON.stringify(m.domains || []));
  let applied = 0, total = 0, k = 0;
  for (const dom of domains) {
    for (const c of dom.criteria) {
      total++;
      const r = byText.get(norm(c.text)) || rows[k];
      k++;
      if (!r) continue;
      let changed = false;
      if (r.score != null) { c.selfScore = r.score; changed = true; }
      if (r.note) { c.note = r.note; changed = true; }
      if (changed) applied++;
    }
  }
  if (!applied) {
    throw new Error("لم تُطابَق أي معايير — تأكد أن الملف هو النموذج القديم للتقييم");
  }
  return { domains, applied, total };
}
