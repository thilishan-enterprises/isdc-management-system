import type { ImportFieldDefinition } from "@/lib/import/types";

export const CUSTOMER_IMPORT_FIELDS = [
  { field: "fullName", label: "Full Name", required: true, aliases: ["Customer Name", "Name"] },
  { field: "nic", label: "NIC Number", required: true, aliases: ["NIC", "NIC No"] },
  { field: "mobile", label: "Primary Mobile", required: true, aliases: ["Phone", "Mobile", "Mobile Number", "Primary Phone"] },
  { field: "additionalMobile", label: "Additional Mobile", required: false, aliases: ["Alternate Mobile", "Alternative Mobile", "Secondary Mobile"] },
  { field: "address", label: "Address", required: true, aliases: ["Customer Address", "Residential Address"] },
  { field: "area", label: "Collection Area", required: false, aliases: ["Area", "Route"] },
  { field: "guarantorDetails", label: "Guarantor Information", required: false, aliases: ["Guarantor", "Guarantor Details"] },
  { field: "notes", label: "Notes", required: false, aliases: ["Additional Notes", "Remarks"] },
] as const satisfies readonly ImportFieldDefinition<string>[];

export type CustomerImportField = (typeof CUSTOMER_IMPORT_FIELDS)[number]["field"];

export type CustomerImportData = Record<CustomerImportField, string>;
