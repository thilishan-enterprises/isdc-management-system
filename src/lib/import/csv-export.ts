function safeCsvCell(value: string | number | null | undefined) {
  let text = String(value ?? "");

  if (/^\s*[=+\-@\t\r]/.test(text)) {
    text = `'${text}`;
  }

  return `"${text.replace(/"/g, '""')}"`;
}

export function createCsv(headers: string[], rows: Array<Array<string | number>>) {
  return `\uFEFF${[
    headers.map(safeCsvCell).join(","),
    ...rows.map((row) => row.map(safeCsvCell).join(",")),
  ].join("\r\n")}`;
}

export function downloadCsv(filename: string, csv: string) {
  const url = URL.createObjectURL(
    new Blob([csv], { type: "text/csv;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
