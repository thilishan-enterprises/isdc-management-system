export const IMPORT_LIMITS = {
  maxFileBytes: 5 * 1024 * 1024,
  maxRows: 2000,
  maxColumns: 50,
  maxCanonicalBytes: 3_500_000,
} as const;

export type ImportSourceRow = {
  rowNumber: number;
  values: string[];
  formulaColumns: number[];
  numericColumns?: number[];
};

export type ParsedImportFile = {
  headers: string[];
  rows: ImportSourceRow[];
};

export type ImportFieldDefinition<Field extends string> = {
  field: Field;
  label: string;
  required: boolean;
  aliases: readonly string[];
};

export type ImportColumnMapping<Field extends string> = Record<
  number,
  Field | ""
>;
