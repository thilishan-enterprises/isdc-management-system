import ExcelJS from "exceljs";
import type { CustomerImportField } from "./config";
import type { CustomerImportPreviewRow } from "./validation";

const columns: Array<{ key: CustomerImportField | "rowNumber" | "status" | "issues"; label: string; width: number }> = [
  { key: "rowNumber", label: "Spreadsheet Row", width: 16 },
  { key: "fullName", label: "Full Name", width: 28 },
  { key: "nic", label: "NIC Number", width: 20 },
  { key: "mobile", label: "Primary Mobile", width: 18 },
  { key: "additionalMobile", label: "Additional Mobile", width: 20 },
  { key: "address", label: "Address", width: 34 },
  { key: "area", label: "Collection Area", width: 22 },
  { key: "guarantorDetails", label: "Guarantor Information", width: 34 },
  { key: "notes", label: "Notes", width: 30 },
  { key: "status", label: "Status", width: 16 },
  { key: "issues", label: "Validation Issues", width: 52 },
];

function safeSpreadsheetText(value: string) {
  return /^\s*[=+\-@]/.test(value) ? `'${value}` : value;
}

export async function buildCustomerImportErrorWorkbook(rows: CustomerImportPreviewRow[]) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ISDC Manager";
  const sheet = workbook.addWorksheet("Import Errors", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  sheet.columns = columns.map((column) => ({ key: column.key, header: column.label, width: column.width }));
  sheet.autoFilter = { from: "A1", to: "K1" };
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF334155" } };

  for (const source of rows.filter((row) => row.status !== "valid" || row.issues.length > 0)) {
    const row = sheet.addRow({
      rowNumber: source.rowNumber,
      ...Object.fromEntries(
        (columns.filter((column) => !["rowNumber", "status", "issues"].includes(column.key)) as Array<{ key: CustomerImportField }>).map(
          ({ key }) => [key, safeSpreadsheetText(source.data[key])],
        ),
      ),
      status: source.status,
      issues: safeSpreadsheetText(source.issues.map((issue) => issue.message).join(" | ")),
    });
    row.getCell("nic").numFmt = "@";
    row.getCell("mobile").numFmt = "@";
    row.getCell("additionalMobile").numFmt = "@";
    const fields = new Set(source.issues.map((issue) => issue.field ?? "issues"));
    for (const field of fields) {
      const cell = row.getCell(field);
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFDE8E8" } };
      cell.font = { color: { argb: "FF991B1B" } };
    }
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
