import {
  ADDITIONAL_MOBILE_ERROR,
  isValidAdditionalMobile,
  isValidNic,
  isValidPrimaryMobile,
  NIC_ERROR,
  normalizeNic,
  normalizePhone,
  PRIMARY_MOBILE_ERROR,
} from "@/lib/customer-contact";
import type { ImportColumnMapping, ImportSourceRow } from "@/lib/import/types";
import type { CustomerImportData, CustomerImportField } from "./config";

export type CustomerImportIssue = {
  type: "invalid" | "duplicate" | "database";
  code: string;
  field?: CustomerImportField;
  message: string;
};

export type PreparedCustomerImportRow = {
  rowNumber: number;
  data: CustomerImportData;
  sourceIssues: CustomerImportIssue[];
};

export type CustomerImportPreviewRow = PreparedCustomerImportRow & {
  status: "valid" | "invalid" | "duplicate" | "database-error";
  issues: CustomerImportIssue[];
};

const EMPTY_DATA: CustomerImportData = {
  fullName: "",
  nic: "",
  mobile: "",
  additionalMobile: "",
  address: "",
  area: "",
  guarantorDetails: "",
  notes: "",
};

export function prepareCustomerImportRows(
  rows: ImportSourceRow[],
  mapping: ImportColumnMapping<CustomerImportField>,
) {
  return rows.map<PreparedCustomerImportRow>((row) => {
    const data = { ...EMPTY_DATA };
    const sourceIssues: CustomerImportIssue[] = [];

    for (const [indexText, field] of Object.entries(mapping)) {
      if (!field) continue;
      const index = Number(indexText);
      data[field] = String(row.values[index] ?? "").trim();

      if (row.formulaColumns.includes(index)) {
        sourceIssues.push({
          type: "invalid",
          code: "FORMULA_NOT_ALLOWED",
          field,
          message: `${field} contains a formula. Replace it with plain text.`,
        });
      }

      if (field === "nic" && row.numericColumns?.includes(index)) {
        sourceIssues.push({
          type: "invalid",
          code: "NIC_MUST_BE_TEXT",
          field,
          message:
            "NIC must be stored as text so Excel cannot remove leading zeros.",
        });
      }
    }

    data.nic = normalizeNic(data.nic);
    data.mobile = normalizePhone(data.mobile);
    data.additionalMobile = normalizePhone(data.additionalMobile);

    return { rowNumber: row.rowNumber, data, sourceIssues };
  });
}

export function validateCustomerImportData(data: CustomerImportData) {
  const issues: CustomerImportIssue[] = [];
  const invalid = (code: string, field: CustomerImportField, message: string) =>
    issues.push({ type: "invalid", code, field, message });

  if (data.fullName.length < 2 || data.fullName.length > 150) {
    invalid("INVALID_FULL_NAME", "fullName", "Full Name must contain 2 to 150 characters.");
  }
  if (!isValidNic(data.nic)) invalid("INVALID_NIC", "nic", NIC_ERROR);
  if (!isValidPrimaryMobile(data.mobile)) invalid("INVALID_PRIMARY_MOBILE", "mobile", PRIMARY_MOBILE_ERROR);
  if (!isValidAdditionalMobile(data.additionalMobile)) invalid("INVALID_ADDITIONAL_MOBILE", "additionalMobile", ADDITIONAL_MOBILE_ERROR);
  if (data.additionalMobile && data.additionalMobile === data.mobile) {
    invalid("MOBILE_FIELDS_MATCH", "additionalMobile", "Primary and additional mobile numbers must be different.");
  }
  if (data.address.length < 3 || data.address.length > 500) {
    invalid("INVALID_ADDRESS", "address", "Address must contain 3 to 500 characters.");
  }
  if (data.area.length > 150) invalid("INVALID_AREA", "area", "Collection Area must be 150 characters or fewer.");
  if (data.guarantorDetails.length > 2000) {
    invalid("INVALID_GUARANTOR_DETAILS", "guarantorDetails", "Guarantor Information must be 2,000 characters or fewer.");
  }
  if (data.notes.length > 2000) invalid("INVALID_NOTES", "notes", "Notes must be 2,000 characters or fewer.");

  return issues;
}

export function applyUploadDuplicateRules(
  rows: Array<PreparedCustomerImportRow & { issues: CustomerImportIssue[] }>,
) {
  const usedNics = new Map<string, number>();
  const usedPhones = new Map<string, number>();

  for (const row of rows) {
    if (row.issues.length > 0) continue;

    const duplicateIssues: CustomerImportIssue[] = [];
    const nicRow = usedNics.get(row.data.nic);
    if (nicRow) {
      duplicateIssues.push({ type: "duplicate", code: "UPLOAD_DUPLICATE_NIC", field: "nic", message: `NIC duplicates upload row ${nicRow}.` });
    }

    for (const [label, phone] of [
      ["Primary Mobile", row.data.mobile],
      ["Additional Mobile", row.data.additionalMobile],
    ] as const) {
      if (!phone) continue;
      const phoneRow = usedPhones.get(phone);
      if (phoneRow) {
        duplicateIssues.push({
          type: "duplicate",
          code: "UPLOAD_DUPLICATE_PHONE",
          field: label === "Primary Mobile" ? "mobile" : "additionalMobile",
          message: `${label} duplicates a phone number in upload row ${phoneRow}.`,
        });
      }
    }

    if (duplicateIssues.length > 0) {
      row.issues.push(...duplicateIssues);
      continue;
    }

    usedNics.set(row.data.nic, row.rowNumber);
    usedPhones.set(row.data.mobile, row.rowNumber);
    if (row.data.additionalMobile) {
      usedPhones.set(row.data.additionalMobile, row.rowNumber);
    }
  }
}
