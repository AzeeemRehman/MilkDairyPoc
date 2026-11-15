import "server-only";
import ExcelJS from "exceljs";
import { dec } from "./calc";
import { formatDate } from "./dates";
import type { BusinessSettings } from "./settings";
import type { SummaryFigures } from "@/components/StatementDocument";
import type { ComputedStatement, SheetRow } from "@/server/services/statements";
import type { Report } from "@/server/services/reports";

const MONEY = "#,##0.00";
const QTY = "#,##0.###";
const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(dec(v as string).toString()));

function header(ws: ExcelJS.Worksheet, values: string[]) {
  const row = ws.addRow(values);
  row.font = { bold: true };
  row.eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
    c.border = { bottom: { style: "thin" } };
  });
}

/** Generic report → workbook with real numeric cells and number formats. */
export async function reportWorkbook(report: Report, s: BusinessSettings) {
  const wb = new ExcelJS.Workbook();
  wb.creator = s.businessName;
  for (const sec of report.sections) {
    const ws = wb.addWorksheet(sec.title.replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || "Sheet");
    ws.addRow([s.businessName]).font = { bold: true, size: 14 };
    ws.addRow([`${report.title} — ${report.subtitle}`]);
    ws.addRow([]);
    header(ws, sec.columns.map((c) => c.label));
    for (const r of sec.rows) {
      const row = ws.addRow(sec.columns.map((c) => (c.type === "money" || c.type === "qty" || c.type === "number" ? num(r[c.key]) : c.type === "date" ? formatDate(String(r[c.key] ?? "")) : r[c.key])));
      sec.columns.forEach((c, i) => {
        if (c.type === "money") row.getCell(i + 1).numFmt = MONEY;
        if (c.type === "qty") row.getCell(i + 1).numFmt = QTY;
      });
    }
    if (sec.totals) {
      const row = ws.addRow(sec.columns.map((c, i) => (i === 0 ? "Total" : sec.totals![c.key] !== undefined ? num(sec.totals![c.key]) : null)));
      row.font = { bold: true };
      sec.columns.forEach((c, i) => {
        if (c.type === "money") row.getCell(i + 1).numFmt = MONEY;
      });
    }
    ws.columns.forEach((col) => (col.width = 16));
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

function sheetBlock(ws: ExcelJS.Worksheet, title: string, rows: SheetRow[], mandi: boolean) {
  ws.addRow([]);
  ws.addRow([title]).font = { bold: true, size: 12 };
  header(ws, mandi ? ["Date", "M Maan", "M KG", "E Maan", "E KG", "Rate/Maan (M)", "Rate/KG (M)", "Rate/Maan (E)", "Rate/KG (E)", "Amount"] : ["Date", "M Maan", "M KG", "E Maan", "E KG", "Rate/Maan", "Rate/KG", "Amount"]);
  for (const r of rows) {
    const base = [formatDate(r.date), num(r.morning?.maan ?? 0), num(r.morning?.kg ?? 0), num(r.evening?.maan ?? 0), num(r.evening?.kg ?? 0)];
    const rates = mandi
      ? [num(r.morning?.ratePerMaan), num(r.morning?.ratePerKg), num(r.evening?.ratePerMaan), num(r.evening?.ratePerKg)]
      : [num(r.morning?.ratePerMaan ?? r.evening?.ratePerMaan), num(r.morning?.ratePerKg ?? r.evening?.ratePerKg)];
    const row = ws.addRow([...base, ...rates, num(r.total)]);
    row.getCell(row.cellCount).numFmt = MONEY;
  }
}

export async function statementWorkbook(s: BusinessSettings, detail: ComputedStatement, summary: SummaryFigures, label: string) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Statement");
  ws.addRow([s.businessName]).font = { bold: true, size: 14 };
  ws.addRow([`Customer statement ${label}`]);
  ws.addRow([`${detail.customer.name} (${detail.customer.code})`, "", `${formatDate(detail.start)} – ${formatDate(detail.end)}`]);
  sheetBlock(ws, "BANDHI", detail.bandhi.rows, false);
  sheetBlock(ws, "MANDI", detail.mandi.rows, true);
  ws.addRow([]);
  const lines: [string, string][] = [
    ["Total Bandhi Amount", summary.totalBandhi],
    ["Total Mandi Amount", summary.totalMandi],
    ["Previous Remaining Balance", summary.openingBalance],
    ["Additional Charges", summary.additionalCharges],
    ["Less: Payments Received", summary.payments],
    ["Less: Discounts / Credits", summary.credits],
    ["Total Payable", summary.closingBalance],
  ];
  for (const [k, v] of lines) {
    const row = ws.addRow([k, num(v)]);
    row.getCell(2).numFmt = MONEY;
    if (k === "Total Payable") row.font = { bold: true };
  }
  ws.columns.forEach((c) => (c.width = 15));
  ws.getColumn(1).width = 28;
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export function xlsxResponse(buf: Buffer, filename: string) {
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename.replace(/[^\w.-]+/g, "_")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
