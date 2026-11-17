import type {
  ImportColumnMapping,
  ImportFieldDefinition,
} from "@/lib/import/types";

export function normalizeColumnHeading(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function suggestColumnMapping<Field extends string>(
  headers: string[],
  fields: readonly ImportFieldDefinition<Field>[],
): ImportColumnMapping<Field> {
  const mapping: ImportColumnMapping<Field> = {};
  const claimed = new Set<Field>();

  headers.forEach((header, index) => {
    const normalized = normalizeColumnHeading(header);
    const matches = fields.filter((definition) =>
      [definition.label, ...definition.aliases]
        .map(normalizeColumnHeading)
        .includes(normalized),
    );

    if (matches.length === 1 && !claimed.has(matches[0].field)) {
      mapping[index] = matches[0].field;
      claimed.add(matches[0].field);
    } else {
      mapping[index] = "";
    }
  });

  return mapping;
}

export function validateColumnMapping<Field extends string>(
  headers: string[],
  mapping: ImportColumnMapping<Field>,
  fields: readonly ImportFieldDefinition<Field>[],
) {
  const allowed = new Set(fields.map((field) => field.field));
  const mapped = new Set<Field>();
  const errors: string[] = [];

  for (const [indexText, field] of Object.entries(mapping)) {
    const index = Number(indexText);

    if (!Number.isInteger(index) || index < 0 || index >= headers.length) {
      errors.push("The column mapping contains an invalid source column.");
      continue;
    }
    if (!field) continue;
    if (!allowed.has(field)) {
      errors.push("The column mapping contains an unsupported destination.");
      continue;
    }
    if (mapped.has(field)) {
      errors.push(`Only one source column can map to ${field}.`);
      continue;
    }
    mapped.add(field);
  }

  for (const field of fields) {
    if (field.required && !mapped.has(field.field)) {
      errors.push(`${field.label} is a required column.`);
    }
  }

  return [...new Set(errors)];
}
