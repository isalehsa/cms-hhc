// تصدير سجل الالتزام إلى Excel (xlsx) — نظام واحد أو مكتبة الالتزام كاملة
import ExcelJS from "exceljs";

const HEADER = [
  { header: "النظام / اللائحة", key: "regulation", width: 30 },
  { header: "المادة / البند", key: "number", width: 16 },
  { header: "العنوان", key: "title", width: 30 },
  { header: "نص المادة", key: "text", width: 60 },
  { header: "الانطباق", key: "applicability", width: 12 },
  { header: "درجة الخطر", key: "risk_level", width: 12 },
  { header: "الإدارة المالكة", key: "owning_department", width: 20 },
  { header: "المبرر", key: "rationale", width: 40 },
  { header: "بحاجة لمراجعة", key: "needs_review", width: 14 },
  { header: "المواد المرتبطة", key: "links", width: 40 },
  { header: "آخر تعديل بواسطة", key: "edited_by", width: 18 },
];

const RISK_COLORS = { "عالي": "FFF4CCCC", "متوسط": "FFFFF2CC", "منخفض": "FFD9EAD3" };

function addSheet(wb, name, rows) {
  // اسم الورقة في Excel لا يتجاوز 31 حرفاً ولا يحوي رموزاً محجوزة
  const safe = name.replace(/[\\/*?:\[\]]/g, "-").slice(0, 31) || "سجل";
  const ws = wb.addWorksheet(safe, { views: [{ rightToLeft: true }] });
  ws.columns = HEADER;
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8F0EC" } };
  for (const r of rows) {
    const row = ws.addRow(r);
    row.alignment = { wrapText: true, vertical: "top", horizontal: "right" };
    const riskCell = row.getCell("risk_level");
    const color = RISK_COLORS[r.risk_level];
    if (color) riskCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: color } };
  }
  ws.autoFilter = { from: "A1", to: { row: 1, column: HEADER.length } };
  return ws;
}

function articleRow(reg, a, regNameById) {
  return {
    regulation: reg.name,
    number: a.number,
    title: a.title,
    text: a.text,
    applicability: a.applicability,
    risk_level: a.risk_level,
    owning_department: a.owning_department,
    rationale: a.rationale,
    needs_review: a.needs_review ? "نعم" : "لا",
    links: (a.links || [])
      .map((l) => `${regNameById.get(l.regulation_id) || "؟"} — ${l.number}`)
      .join(" | "),
    edited_by: a.edited_by || "",
  };
}

export async function exportWorkbook(regulations, single = false) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "CHCC نظام إدارة الالتزام";
  wb.created = new Date();
  const regNameById = new Map(regulations.map((r) => [r.id, r.name]));

  if (single && regulations.length === 1) {
    const reg = regulations[0];
    addSheet(wb, reg.name, reg.articles.map((a) => articleRow(reg, a, regNameById)));
  } else {
    // ورقة موحدة لمكتبة الالتزام كاملة + ورقة لكل نظام
    const all = regulations.flatMap((reg) =>
      reg.articles.map((a) => articleRow(reg, a, regNameById))
    );
    addSheet(wb, "مكتبة الالتزام", all);
    for (const reg of regulations) {
      addSheet(wb, reg.name, reg.articles.map((a) => articleRow(reg, a, regNameById)));
    }
  }
  return wb.xlsx.writeBuffer();
}
