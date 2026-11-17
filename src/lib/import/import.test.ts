import assert from "node:assert/strict";
import test from "node:test";
import ExcelJS from "exceljs";
import {
  normalizeColumnHeading,
  suggestColumnMapping,
  validateColumnMapping,
} from "./column-mapping";
import { createCsv } from "./csv-export";
import {
  IMPORT_PREVIEW_TTL_MS,
  IMPORT_RECOVERY_GRACE_MS,
  deriveFinalImportStatus,
  importFailureMessage,
  remainingImportCandidates,
} from "./job-state";
import {
  ADMIN_APPROVAL_ATTEMPT_LIMIT,
  ADMIN_APPROVAL_WINDOW_MS,
  approvalWindowStart,
} from "@/lib/approval-throttle";
import { parseImportFile } from "./parse-file";
import { CUSTOMER_IMPORT_FIELDS } from "@/app/(app)/customers/import/config";
import {
  applyUploadDuplicateRules,
  prepareCustomerImportRows,
  validateCustomerImportData,
  type PreparedCustomerImportRow,
} from "@/app/(app)/customers/import/validation";
import { buildCustomerImportErrorWorkbook } from "@/app/(app)/customers/import/excel-error-report";
import {
  customerOwnershipConflicts,
  customerPhoneOwnershipWhere,
} from "@/lib/customer-ownership";
import { isAccountActive } from "@/lib/account-status";

test("column aliases map deterministically and duplicate destinations are rejected", () => {
  const headers = ["Customer Name", "NIC", "Phone", "Area", "Unknown"];
  const mapping = suggestColumnMapping(headers, CUSTOMER_IMPORT_FIELDS);

  assert.equal(mapping[0], "fullName");
  assert.equal(mapping[1], "nic");
  assert.equal(mapping[2], "mobile");
  assert.equal(mapping[3], "area");
  assert.equal(mapping[4], "");
  assert.equal(normalizeColumnHeading(" Primary-Mobile "), "primary mobile");

  const errors = validateColumnMapping(
    headers,
    { ...mapping, 4: "mobile" },
    CUSTOMER_IMPORT_FIELDS,
  );
  assert.ok(errors.some((error) => error.includes("Only one source column")));
});

test("customer validation returns multiple issues and accepts supported formats", () => {
  const valid = {
    fullName: "Example Customer",
    nic: "901234567",
    mobile: "0771234567",
    additionalMobile: "94771234567",
    address: "123 Main Street",
    area: "Colombo",
    guarantorDetails: "",
    notes: "",
  };
  assert.deepEqual(validateCustomerImportData(valid), []);
  assert.deepEqual(
    validateCustomerImportData({ ...valid, nic: "001234567" }),
    [],
  );
  assert.deepEqual(
    validateCustomerImportData({ ...valid, nic: "200012345678" }),
    [],
  );

  for (const nic of ["", "901234567V", "901234567X", "12345678", "1234567890", "ABC123456789"]) {
    assert.ok(
      validateCustomerImportData({ ...valid, nic }).some(
        (issue) => issue.code === "INVALID_NIC",
      ),
    );
  }

  const invalid = validateCustomerImportData({
    ...valid,
    nic: "invalid",
    mobile: "0731234567",
    additionalMobile: "123",
    address: "",
  });
  assert.ok(invalid.length >= 4);
});

test("invalid earlier rows do not reserve identifiers for upload duplicate checks", () => {
  const base = {
    fullName: "Valid Customer",
    nic: "200012345678",
    mobile: "0771234567",
    additionalMobile: "",
    address: "Valid address",
    area: "",
    guarantorDetails: "",
    notes: "",
  };
  const prepared: Array<PreparedCustomerImportRow & { issues: ReturnType<typeof validateCustomerImportData> }> = [
    {
      rowNumber: 2,
      data: { ...base, fullName: "", nic: "200012345679" },
      sourceIssues: [],
      issues: [{ type: "invalid", code: "INVALID_FULL_NAME", field: "fullName", message: "Invalid name." }],
    },
    { rowNumber: 3, data: base, sourceIssues: [], issues: [] },
    {
      rowNumber: 4,
      data: { ...base, nic: "200012345680" },
      sourceIssues: [],
      issues: [],
    },
  ];

  applyUploadDuplicateRules(prepared);
  assert.equal(prepared[1].issues.length, 0);
  assert.equal(prepared[2].issues[0]?.type, "duplicate");
  assert.match(prepared[2].issues[0]?.message ?? "", /row 3/);
});

test("CSV parser handles valid, empty, malformed, and oversized-row files", async () => {
  const valid = new File(
    ["Full Name,NIC,Phone,Address\r\nAlice,200012345678,0771234567,Colombo"],
    "customers.csv",
    { type: "text/csv" },
  );
  const parsed = await parseImportFile(valid);
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0].rowNumber, 2);

  await assert.rejects(
    () => parseImportFile(new File([], "empty.csv")),
    /empty/i,
  );
  await assert.rejects(
    () => parseImportFile(new File(['Name,NIC\n"broken'], "broken.csv")),
    /malformed/i,
  );

  const tooMany = new File(
    [
      "Name,NIC,Phone,Address\n" +
        Array.from({ length: 2001 }, (_, index) =>
          `Customer ${index},200012345678,0771234567,Address`,
        ).join("\n"),
    ],
    "too-many.csv",
  );
  await assert.rejects(() => parseImportFile(tooMany), /2,000|2000/);

  await assert.rejects(
    () =>
      parseImportFile(
        new File([new Uint8Array(5 * 1024 * 1024 + 1)], "oversized.csv"),
      ),
    /5 MB/,
  );
  await assert.rejects(
    () => parseImportFile(new File(["plain text"], "customers.txt")),
    /valid \.xlsx or \.csv/i,
  );
  await assert.rejects(
    () =>
      parseImportFile(
        new File([new Uint8Array([0xd0, 0xcf, 0x11, 0xe0])], "locked.xlsx"),
      ),
    /Password-protected or legacy/i,
  );
});

test("XLSX parser reads plain cells and flags formulas without executing them", async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Customers");
  sheet.addRow(["Full Name", "NIC", "Phone", "Address"]);
  sheet.addRow([
    { formula: 'HYPERLINK("https://example.invalid")', result: "Click" },
    "200012345678",
    "0771234567",
    "Colombo",
  ]);
  const buffer = await workbook.xlsx.writeBuffer();
  const file = new File([new Uint8Array(buffer)], "customers.xlsx");
  const parsed = await parseImportFile(file);

  assert.deepEqual(parsed.rows[0].formulaColumns, [0]);
  assert.equal(parsed.rows[0].values[0], "");
});

test("XLSX parser preserves displayed NIC leading zeroes", async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Customers");
  sheet.addRow(["Full Name", "NIC", "Phone", "Address"]);
  const row = sheet.addRow(["Leading Zero", 1234567, "0771234567", "Colombo"]);
  row.getCell(2).numFmt = "000000000";
  const buffer = await workbook.xlsx.writeBuffer();
  const parsed = await parseImportFile(
    new File([new Uint8Array(buffer)], "customers.xlsx"),
  );

  assert.equal(parsed.rows[0].values[1], "001234567");
  assert.deepEqual(parsed.rows[0].numericColumns, [1]);
  const prepared = prepareCustomerImportRows(parsed.rows, {
    0: "fullName",
    1: "nic",
    2: "mobile",
    3: "address",
  });
  assert.equal(prepared[0].sourceIssues[0]?.code, "NIC_MUST_BE_TEXT");
});

test("CSV generation escapes formulas, commas, quotes, and newlines", () => {
  const csv = createCsv(["Value"], [["=1+1"], ['a,"b"\nline']]);
  assert.match(csv, /'\=1\+1/);
  assert.match(csv, /""b""/);
});

test("uploaded primary and additional numbers share one duplicate namespace", () => {
  const rows: Array<PreparedCustomerImportRow & { issues: ReturnType<typeof validateCustomerImportData> }> = [
    {
      rowNumber: 2,
      data: {
        fullName: "First Customer",
        nic: "200012345678",
        mobile: "0771234567",
        additionalMobile: "0711234567",
        address: "First address",
        area: "",
        guarantorDetails: "",
        notes: "",
      },
      sourceIssues: [],
      issues: [],
    },
    {
      rowNumber: 3,
      data: {
        fullName: "Second Customer",
        nic: "200012345679",
        mobile: "0711234567",
        additionalMobile: "",
        address: "Second address",
        area: "",
        guarantorDetails: "",
        notes: "",
      },
      sourceIssues: [],
      issues: [],
    },
  ];

  applyUploadDuplicateRules(rows);
  assert.equal(rows[1].issues[0]?.type, "duplicate");
  assert.match(rows[1].issues[0]?.message ?? "", /row 2/);
});

test("customer ownership checks cover both phone columns and exclude edits", () => {
  const where = customerPhoneOwnershipWhere(
    ["0771234567", "0711234567"],
    "current-customer",
  );

  assert.deepEqual(where.customerId, { not: "current-customer" });
  assert.deepEqual(where.normalizedPhone, {
    in: ["0771234567", "0711234567"],
  });
  assert.deepEqual(
    customerOwnershipConflicts(
      {
        nic: "200012345678",
        mobile: "0711234567",
        additionalMobile: "0771234567",
      },
      {
        nic: "901234567",
        mobile: "0771234567",
        additionalMobile: "0711234567",
      },
    ),
    { nic: false, mobile: true, additionalMobile: true },
  );
});

test("current account status revokes stale sessions for disabled users", () => {
  assert.equal(isAccountActive({ isActive: true, employee: null }), true);
  assert.equal(
    isAccountActive({ isActive: true, employee: { isActive: true } }),
    true,
  );
  assert.equal(isAccountActive({ isActive: false, employee: null }), false);
  assert.equal(
    isAccountActive({ isActive: true, employee: { isActive: false } }),
    false,
  );
});

test("durable import status distinguishes success, partial, no-op, and failure", () => {
  assert.equal(deriveFinalImportStatus({ imported: 10, skipped: 0, failed: 0 }), "COMPLETED");
  assert.equal(deriveFinalImportStatus({ imported: 7, skipped: 3, failed: 0 }), "PARTIAL");
  assert.equal(deriveFinalImportStatus({ imported: 0, skipped: 10, failed: 0 }), "NO_CHANGES");
  assert.equal(deriveFinalImportStatus({ imported: 0, skipped: 10, failed: 10 }), "FAILED");
});

test("recovery counts only candidates from uncommitted batches", () => {
  assert.equal(remainingImportCandidates({ candidateCount: 250, nextBatchIndex: 2, batchSize: 100 }), 50);
  assert.equal(remainingImportCandidates({ candidateCount: 100, nextBatchIndex: 1, batchSize: 100 }), 0);
  assert.equal(remainingImportCandidates({ candidateCount: 10, nextBatchIndex: 99, batchSize: 100 }), 0);
});

test("import expiry and recovery policies are bounded and user-facing", () => {
  assert.equal(IMPORT_PREVIEW_TTL_MS, 30 * 60_000);
  assert.equal(IMPORT_RECOVERY_GRACE_MS, 30 * 60_000);
  assert.match(importFailureMessage("PREVIEW_EXPIRED", 0), /expired/i);
  assert.match(importFailureMessage("IMPORT_INTERRUPTED", 3), /some customers were committed/i);
  assert.doesNotMatch(importFailureMessage("PROCESSING_ERROR", 0), /phone|nic|address/i);
});

test("administrator approval throttle uses a fixed persistent-attempt window", () => {
  const now = new Date("2026-11-18T12:00:00.000Z");
  assert.equal(ADMIN_APPROVAL_ATTEMPT_LIMIT, 5);
  assert.equal(ADMIN_APPROVAL_WINDOW_MS, 15 * 60_000);
  assert.equal(approvalWindowStart(now).toISOString(), "2026-11-18T11:45:00.000Z");
});

test("Excel error reports preserve text, neutralize formulas, and highlight only error fields", async () => {
  const buffer = await buildCustomerImportErrorWorkbook([{
    rowNumber: 7,
    data: { fullName: "=2+2", nic: "001234567V", mobile: "0771234567", additionalMobile: "", address: "Address", area: "", guarantorDetails: "", notes: "" },
    sourceIssues: [],
    status: "invalid",
    issues: [{ type: "invalid", code: "INVALID_NIC", field: "nic", message: "Invalid NIC." }],
  }]);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  const sheet = workbook.getWorksheet("Import Errors");
  assert.ok(sheet);
  assert.equal(sheet.getRow(2).getCell(2).value, "'=2+2");
  assert.equal(sheet.getRow(2).getCell(3).value, "001234567V");
  const nicFill = sheet.getRow(2).getCell(3).fill;
  const mobileFill = sheet.getRow(2).getCell(4).fill;
  assert.equal(nicFill.type, "pattern");
  assert.notEqual(mobileFill.type === "pattern" ? mobileFill.fgColor?.argb : undefined, "FFFDE8E8");
});
