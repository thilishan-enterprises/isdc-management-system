import { parse } from "csv-parse/browser/esm/sync";
import type { CellValue } from "exceljs";
import { IMPORT_LIMITS, type ParsedImportFile } from "@/lib/import/types";

function ensureLimits(parsed: ParsedImportFile) {
  if (parsed.headers.length === 0) throw new Error("The file has no headers.");
  if (parsed.headers.length > IMPORT_LIMITS.maxColumns) {
    throw new Error(`Files may contain at most ${IMPORT_LIMITS.maxColumns} columns.`);
  }
  if (parsed.rows.length === 0) throw new Error("The file has no data rows.");
  if (parsed.rows.length > IMPORT_LIMITS.maxRows) {
    throw new Error(`Files may contain at most ${IMPORT_LIMITS.maxRows} data rows.`);
  }
  if (parsed.headers.some((header) => !header.trim())) {
    throw new Error("Every source column must have a heading.");
  }

  return parsed;
}

function excelCellText(
  value: CellValue,
  displayText?: string,
  numberFormat?: string,
): { text: string; formula: boolean } {
  if (value === null || value === undefined) return { text: "", formula: false };
  if (typeof value === "string") {
    return { text: value, formula: false };
  }
  if (typeof value === "number") {
    // Identifier columns are often numeric cells with an all-zero display
    // format. Reproduce that format so leading zeroes are not silently lost.
    if (
      Number.isSafeInteger(value) &&
      value >= 0 &&
      numberFormat &&
      /^0+$/.test(numberFormat)
    ) {
      return {
        text: String(value).padStart(numberFormat.length, "0"),
        formula: false,
      };
    }
    return { text: displayText || String(value), formula: false };
  }
  if (typeof value === "boolean") return { text: String(value), formula: false };
  if (value instanceof Date) return { text: value.toISOString(), formula: false };
  if ("formula" in value || "sharedFormula" in value) {
    return { text: "", formula: true };
  }
  if ("richText" in value) {
    return {
      text: value.richText.map((part) => part.text).join(""),
      formula: false,
    };
  }
  if ("text" in value) return { text: value.text, formula: false };
  if ("error" in value) return { text: "", formula: false };

  return { text: String(value), formula: false };
}

async function parseXlsx(buffer: ArrayBuffer): Promise<ParsedImportFile> {
  try {
    const { default: ExcelJS } = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(
      buffer as unknown as Parameters<typeof workbook.xlsx.load>[0],
    );
    const worksheet = workbook.worksheets[0];

    if (!worksheet) throw new Error("The workbook contains no worksheets.");

    const columnCount = worksheet.columnCount;
    const headers = Array.from({ length: columnCount }, (_, index) =>
      excelCellText(
        worksheet.getCell(1, index + 1).value,
        worksheet.getCell(1, index + 1).text,
        worksheet.getCell(1, index + 1).numFmt,
      ).text.trim(),
    );
    const rows = [];

    for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
      const values: string[] = [];
      const formulaColumns: number[] = [];
      const numericColumns: number[] = [];

      for (let index = 0; index < columnCount; index += 1) {
        const cell = worksheet.getCell(rowNumber, index + 1);
        const converted = excelCellText(cell.value, cell.text, cell.numFmt);
        values.push(converted.text);
        if (converted.formula) formulaColumns.push(index);
        if (typeof cell.value === "number") numericColumns.push(index);
      }

      if (values.some((value) => value.trim()) || formulaColumns.length > 0) {
        rows.push({ rowNumber, values, formulaColumns, numericColumns });
      }
    }

    return ensureLimits({ headers, rows });
  } catch (error) {
    if (
      error instanceof Error &&
      /^(The file|Files may|Every source)/.test(error.message)
    ) {
      throw error;
    }
    if (error instanceof Error && /password|encrypt/i.test(error.message)) {
      throw new Error("Password-protected Excel files are not supported.");
    }
    throw new Error("The Excel file is corrupted or cannot be read.");
  }
}

function parseCsv(buffer: ArrayBuffer): ParsedImportFile {
  let text: string;

  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    throw new Error("The CSV file must use UTF-8 text encoding.");
  }

  if (!text.trim() || /\0/.test(text)) throw new Error("The CSV file is empty or invalid.");

  try {
    const records = parse(text, {
      bom: true,
      skip_empty_lines: true,
      relax_column_count: false,
      max_record_size: 100_000,
    }) as string[][];
    if (records.length < 2) throw new Error("The file has no data rows.");

    return ensureLimits({
      headers: records[0].map((value) => String(value).trim()),
      rows: records.slice(1).map((values, index) => ({
        rowNumber: index + 2,
        values: values.map(String),
        formulaColumns: [],
        numericColumns: [],
      })),
    });
  } catch (error) {
    if (error instanceof Error && /^(The file|Files may|Every source)/.test(error.message)) {
      throw error;
    }
    throw new Error("The CSV file is malformed and cannot be read.");
  }
}

export async function parseImportFile(file: File) {
  if (file.size === 0) throw new Error("The selected file is empty.");
  if (file.size > IMPORT_LIMITS.maxFileBytes) throw new Error("Files may not exceed 5 MB.");

  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer.slice(0, 4));
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  const isCompoundDocument =
    bytes[0] === 0xd0 &&
    bytes[1] === 0xcf &&
    bytes[2] === 0x11 &&
    bytes[3] === 0xe0;
  const extension = file.name.split(".").pop()?.toLowerCase();

  if (extension === "xlsx" && isZip) return parseXlsx(buffer);
  if (extension === "xlsx" && isCompoundDocument) {
    throw new Error(
      "Password-protected or legacy Excel files are not supported. Save the file as an unprotected .xlsx file.",
    );
  }
  if (extension === "csv" && !isZip) return parseCsv(buffer);

  throw new Error("Select a valid .xlsx or .csv file. The file contents do not match its extension.");
}
