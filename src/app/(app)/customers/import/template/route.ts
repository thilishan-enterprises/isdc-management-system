import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { getActiveSession } from "@/lib/auth-guards";

export async function GET() {
  const session = await getActiveSession();
  if (!session) {
    return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ISDC Manager";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("Customers", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  const headers = [
    "Full Name",
    "NIC Number",
    "Primary Mobile",
    "Additional Mobile",
    "Address",
    "Collection Area",
    "Guarantor Information",
    "Notes",
  ];
  sheet.addRow(headers);
  sheet.columns = [
    { width: 26 },
    { width: 18, style: { numFmt: "@" } },
    { width: 18, style: { numFmt: "@" } },
    { width: 20, style: { numFmt: "@" } },
    { width: 38 },
    { width: 22 },
    { width: 36 },
    { width: 40 },
  ];
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2563EB" } };
  header.alignment = { vertical: "middle" };
  header.height = 24;
  sheet.autoFilter = { from: "A1", to: "H1" };

  const instructions = workbook.addWorksheet("Instructions");
  instructions.columns = [{ width: 24 }, { width: 90 }];
  instructions.addRows([
    ["Column", "Requirement"],
    ["Full Name", "Required. 2–150 characters."],
    ["NIC Number", "Required. Exactly 9 or 12 digits. Store as text to preserve leading zeros."],
    ["Primary Mobile", "Required. 10 digits with an allowed Sri Lankan mobile prefix."],
    ["Additional Mobile", "Optional. Valid 10-digit Sri Lankan mobile, or 11–15 digits."],
    ["Address", "Required. 3–500 characters."],
    ["Collection Area", "Optional. Maximum 150 characters."],
    ["Guarantor Information", "Optional. Maximum 2,000 characters."],
    ["Notes", "Optional. Maximum 2,000 characters."],
    ["Safety", "Use plain text values only. Formulas are rejected. Do not add IDs or timestamps."],
  ]);
  instructions.getRow(1).font = { bold: true };

  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="customer-import-template.xlsx"',
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
