"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePathname } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  Download,
  FileSpreadsheet,
  Loader2,
  RefreshCcw,
  Search,
  Upload,
  History,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AppSelect } from "@/components/common/app-select";
import { ConfirmationDialog } from "@/components/common/confirmation-dialog";
import { notify } from "@/lib/notify";
import { parseImportFile } from "@/lib/import/parse-file";
import {
  suggestColumnMapping,
  validateColumnMapping,
} from "@/lib/import/column-mapping";
import { createCsv, downloadCsv } from "@/lib/import/csv-export";
import type {
  ImportColumnMapping,
  ParsedImportFile,
} from "@/lib/import/types";
import {
  CUSTOMER_IMPORT_FIELDS,
  type CustomerImportField,
} from "./config";
import {
  commitCustomerImport,
  downloadCustomerImportExcelReport,
  validateCustomerImport,
  type CustomerImportFinalResult,
  type CustomerImportSummary,
} from "./actions";
import type { CustomerImportPreviewRow } from "./validation";

type PreviewFilter = "all" | "valid" | "issues";

function StepIndicator({ step }: { step: 1 | 2 | 3 }) {
  const labels = ["Upload File", "Validate & Preview", "Import Results"];

  return (
    <ol className="grid shrink-0 grid-cols-3 gap-2" aria-label="Import progress">
      {labels.map((label, index) => {
        const number = index + 1;
        const active = number === step;
        const complete = number < step;

        return (
          <li
            key={label}
            className={`flex min-w-0 items-center gap-2 rounded-lg border px-3 py-2 text-xs sm:text-sm ${
              active
                ? "border-primary/40 bg-primary/5 text-foreground"
                : "border-border/70 text-muted-foreground"
            }`}
          >
            <span
              className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                active || complete
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted"
              }`}
            >
              {complete ? <CheckCircle2 className="size-3.5" /> : number}
            </span>
            <span className="truncate">{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

function errorReportRows(rows: CustomerImportPreviewRow[]) {
  return rows
    .filter((row) => row.status !== "valid" || row.issues.length > 0)
    .map((row) => [
      row.rowNumber,
      row.data.fullName,
      row.data.nic,
      row.data.mobile,
      row.data.additionalMobile,
      row.data.address,
      row.data.area,
      row.data.guarantorDetails,
      row.data.notes,
      row.status,
      row.issues.map((issue) => issue.message).join(" | "),
    ]);
}

function downloadErrorReport(rows: CustomerImportPreviewRow[]) {
  downloadCsv(
    "customer-import-errors.csv",
    createCsv(
      [
        "Spreadsheet Row",
        "Full Name",
        "NIC Number",
        "Primary Mobile",
        "Additional Mobile",
        "Address",
        "Collection Area",
        "Guarantor Information",
        "Notes",
        "Status",
        "Validation Issues",
      ],
      errorReportRows(rows),
    ),
  );
}

function issueCellClass(row: CustomerImportPreviewRow, field: CustomerImportField) {
  return row.issues.some((issue) => issue.field === field)
    ? "bg-destructive/5 text-destructive"
    : "";
}

function previewStatusClass(status: CustomerImportPreviewRow["status"]) {
  if (status === "valid") return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400";
  if (status === "invalid" || status === "database-error") return "bg-destructive/10 text-destructive";
  return "bg-amber-500/10 text-amber-700 dark:text-amber-400";
}

function resultStatusClass(status?: string) {
  if (status === "COMPLETED") return "border-emerald-500/20 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400";
  if (status === "FAILED") return "border-destructive/20 bg-destructive/5 text-destructive";
  if (status === "PARTIAL" || status === "PROCESSING") return "border-amber-500/20 bg-amber-500/5 text-amber-700 dark:text-amber-400";
  return "border-border bg-muted/30 text-foreground";
}

export default function CustomerImportPage() {
  const pathname = usePathname();
  const inputRef = useRef<HTMLInputElement>(null);
  const leftImportRouteRef = useRef(false);
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedImportFile | null>(null);
  const [mapping, setMapping] = useState<
    ImportColumnMapping<CustomerImportField>
  >({});
  const [previewRows, setPreviewRows] = useState<CustomerImportPreviewRow[]>([]);
  const [summary, setSummary] = useState<CustomerImportSummary | null>(null);
  const [token, setToken] = useState("");
  const [sessionKey, setSessionKey] = useState("");
  const [reportToken, setReportToken] = useState("");
  const [result, setResult] = useState<CustomerImportFinalResult | null>(null);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [filter, setFilter] = useState<PreviewFilter>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pending, startTransition] = useTransition();
  const [parsing, setParsing] = useState(false);
  const [dialog, setDialog] = useState<"reset" | "import" | null>(null);
  const step: 1 | 2 | 3 = result ? 3 : previewRows.length > 0 ? 2 : 1;
  const previewActive = !result && previewRows.length > 0 && Boolean(summary);

  const visibleRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return previewRows.filter((row) => {
      if (filter === "valid" && row.status !== "valid") return false;
      if (filter === "issues" && row.status === "valid") return false;
      if (!query) return true;
      return [row.data.fullName, row.data.nic, row.data.mobile]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [filter, previewRows, search]);
  const pageSize = 25;
  const totalPages = Math.max(1, Math.ceil(visibleRows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedRows = visibleRows.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  async function selectFile(nextFile: File) {
    setError("");
    setResult(null);
    setPreviewRows([]);
    setSummary(null);
    setToken("");
    setReportToken("");
    setSessionKey(crypto.randomUUID());

    setParsing(true);
    try {
      const nextParsed = await parseImportFile(nextFile);
      setFile(nextFile);
      setParsed(nextParsed);
      setMapping(
        suggestColumnMapping(nextParsed.headers, CUSTOMER_IMPORT_FIELDS),
      );
      notify.success("File uploaded successfully", {
        description: `${nextParsed.rows.length} data rows are ready for column mapping.`,
      });
    } catch (cause) {
      setFile(null);
      setParsed(null);
      setMapping({});
      const message = cause instanceof Error ? cause.message : "Unable to read the selected file.";
      setError(message);
      notify.error("File parsing failed", { description: message });
    } finally {
      setParsing(false);
    }
  }

  function resetWorkflow() {
    setFile(null);
    setParsed(null);
    setMapping({});
    setPreviewRows([]);
    setSummary(null);
    setToken("");
    setSessionKey("");
    setReportToken("");
    setResult(null);
    setError("");
    setSearch("");
    setFilter("all");
    setPage(1);
    if (inputRef.current) inputRef.current.value = "";
  }

  useEffect(() => {
    if (pathname !== "/customers/import") {
      leftImportRouteRef.current = true;
      return;
    }

    if (leftImportRouteRef.current) {
      leftImportRouteRef.current = false;
      resetWorkflow();
    }
  }, [pathname]);

  function clearCompletedImportBeforeNavigation() {
    if (result) resetWorkflow();
  }

  function requestReset() {
    if (file && (previewRows.length > 0 || Object.values(mapping).some(Boolean))) {
      setDialog("reset");
      return;
    }
    resetWorkflow();
  }

  function handleValidate() {
    if (!parsed || !file || !sessionKey || pending) return;
    const mappingErrors = validateColumnMapping(
      parsed.headers,
      mapping,
      CUSTOMER_IMPORT_FIELDS,
    );
    if (mappingErrors.length > 0) {
      const message = mappingErrors.join(" ");
      setError(message);
      notify.error("Column mapping is incomplete", { description: message });
      return;
    }

    setError("");
    startTransition(async () => {
      const response = await validateCustomerImport({
        originalFilename: file.name,
        sessionKey,
        headers: parsed.headers,
        rows: parsed.rows,
        mapping,
      });
      if (!response.success || !response.rows || !response.summary || !response.token) {
        const message = response.error ?? "Unable to validate this import.";
        setError(message);
        notify.error("Import validation failed", { description: message });
        return;
      }
      setPreviewRows(response.rows);
      setSummary(response.summary);
      setToken(response.token);
      setReportToken(response.reportToken ?? "");
      setPage(1);
      if (response.summary.invalid > 0 || response.summary.duplicate > 0) {
        notify.warning("Validation completed with issues", {
          description: `${response.summary.valid} rows can be imported; ${response.summary.invalid + response.summary.duplicate} will be skipped.`,
        });
      } else {
        notify.success("File validation completed", {
          description: `All ${response.summary.valid} rows are ready to import.`,
        });
      }
    });
  }

  function handleImport() {
    if (!token || pending) return;
    setError("");
    startTransition(async () => {
      const response = await commitCustomerImport(token);
      setResult(response);
      setReportToken(response.reportToken ?? "");
      if (!response.success && response.error) setError(response.error);
      if (response.inProgress || response.status === "PROCESSING") {
        notify.warning("Import is still processing", { description: response.error });
      } else if (response.status === "FAILED" || !response.success) {
        notify.error("Import could not be completed", { description: response.error });
      } else if (response.status === "PARTIAL") {
        notify.warning("Import completed with skipped records", { description: `${response.imported} customers were imported successfully.` });
      } else if (response.status === "NO_CHANGES") {
        notify.warning("No customers were imported", { description: response.error });
      } else {
        notify.success("Customers imported successfully", { description: `${response.imported} customer${response.imported === 1 ? "" : "s"} added.` });
      }
    });
  }

  function requestImport() {
    if (!summary || summary.valid === 0 || pending) return;
    if (summary.invalid > 0 || summary.duplicate > 0) {
      setDialog("import");
      return;
    }
    handleImport();
  }

  const claimedFields = new Set(
    Object.values(mapping).filter((field): field is CustomerImportField => Boolean(field)),
  );

  function downloadExcelReport() {
    if (!reportToken || pending) return;
    startTransition(async () => {
      const response = await downloadCustomerImportExcelReport(reportToken);
      if (!response.success) {
        setError(response.error);
        notify.error("Error report generation failed", { description: response.error });
        return;
      }
      const bytes = Uint8Array.from(atob(response.base64), (character) => character.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = response.filename;
      anchor.click();
      URL.revokeObjectURL(url);
      notify.success("Excel error report downloaded");
    });
  }

  function downloadCsvReport(rows: CustomerImportPreviewRow[]) {
    downloadErrorReport(rows);
    notify.success("CSV error report downloaded");
  }

  return (
    <div className={`mx-auto w-full max-w-[1440px] ${previewActive ? "flex min-h-0 flex-col gap-3 md:h-full" : "space-y-4 md:h-full md:min-h-0 md:overflow-y-auto md:overscroll-contain"}`}>
      <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Button nativeButton={false} variant="outline" onClick={clearCompletedImportBeforeNavigation} render={<Link href="/customers" />}>
          <ArrowLeft className="size-4" /> Back to Customers
        </Button>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Button nativeButton={false} variant="outline" onClick={clearCompletedImportBeforeNavigation} render={<Link href="/customers/import/history" />}>
            <History className="size-4" /> Import History
          </Button>
          <Button nativeButton={false} variant="outline" render={<a href="/customers/import/template" />}>
            <Download className="size-4" /> Download Template
          </Button>
        </div>
      </div>

      <StepIndicator step={step} />

      {!result && previewRows.length === 0 && (
        <Card className="border-border/70 shadow-sm">
          <CardContent className="space-y-5 p-4 sm:p-5">
            <div
              onDragEnter={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                const dropped = event.dataTransfer.files[0];
                if (dropped) void selectFile(dropped);
              }}
              className={`flex min-h-48 flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
                dragging ? "border-primary bg-primary/5" : "border-border bg-muted/10 hover:border-primary/50 hover:bg-muted/20"
              }`}
            >
              <div className="mb-3 flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                {parsing ? <Loader2 className="size-5 animate-spin" /> : <Upload className="size-5" />}
              </div>
              <p className="text-sm font-medium">Drop an Excel or CSV file here</p>
              <p className="mt-1 text-xs text-muted-foreground">
                .xlsx or .csv · maximum 5 MB · maximum 2,000 data rows
              </p>
              <Button
                type="button"
                variant="outline"
                className="mt-4"
                disabled={parsing}
                onClick={() => inputRef.current?.click()}
              >
                {parsing ? "Reading file..." : "Choose File"}
              </Button>
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx,.csv"
                className="sr-only"
                onChange={(event) => {
                  const selected = event.target.files?.[0];
                  if (selected) void selectFile(selected);
                }}
              />
            </div>

            {file && parsed && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/70 bg-muted/20 p-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <FileSpreadsheet className="size-5 shrink-0 text-primary" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{file.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {(file.size / 1024).toFixed(1)} KB · {parsed.rows.length} rows · {parsed.headers.length} columns
                      </p>
                    </div>
                  </div>
                  <Button type="button" variant="ghost" size="sm" onClick={requestReset}>
                    <X className="size-4" /> Remove
                  </Button>
                </div>

                <div>
                  <h2 className="text-sm font-semibold">Column Mapping</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Required fields are marked with *. Unknown columns may remain ignored.
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {parsed.headers.map((header, index) => (
                    <div key={`${header}-${index}`} className={`space-y-1.5 rounded-lg border p-2.5 ${mapping[index] ? "border-primary/20 bg-primary/[0.03]" : "border-border/70 bg-muted/10"}`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-xs font-medium" title={header}>{header}</span>
                        <span className={`text-[10px] font-medium uppercase tracking-wide ${mapping[index] ? "text-primary" : "text-muted-foreground"}`}>{mapping[index] ? "Mapped" : "Ignored"}</span>
                      </div>
                      <AppSelect
                        value={mapping[index] || "IGNORE"}
                        onValueChange={(value) => {
                          setError("");
                          setMapping((current) => ({
                            ...current,
                            [index]: value === "IGNORE" ? "" : value as CustomerImportField,
                          }));
                        }}
                        options={[
                          { value: "IGNORE", label: "Ignore this column" },
                          ...CUSTOMER_IMPORT_FIELDS.map((field) => ({
                            value: field.field,
                            label: `${field.label}${field.required ? " *" : ""}`,
                            disabled:
                              claimedFields.has(field.field) &&
                              mapping[index] !== field.field,
                          })),
                        ]}
                      />
                    </div>
                  ))}
                </div>

                <div className="flex justify-end">
                  <Button type="button" size="lg" disabled={pending} onClick={handleValidate}>
                    {pending ? "Validating..." : "Validate & Preview"}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {!result && previewRows.length > 0 && summary && (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <div className="flex shrink-0 flex-col gap-2 rounded-xl border border-border/70 bg-card px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><FileSpreadsheet className="size-4" /></span>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium" title={file?.name}>{file?.name ?? "Selected import file"}</p>
                <p className="text-xs text-muted-foreground">{file ? `${(file.size / 1024).toFixed(1)} KB · ` : ""}{summary.uploaded} data rows validated</p>
              </div>
            </div>
            {(summary.invalid > 0 || summary.duplicate > 0) && (
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => downloadCsvReport(previewRows)}><Download className="size-3.5" /> CSV Report</Button>
                <Button type="button" size="sm" variant="outline" disabled={!reportToken || pending} onClick={downloadExcelReport}><FileSpreadsheet className="size-3.5" /> Excel Report</Button>
              </div>
            )}
          </div>

          <div className="grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
            {[
              { label: "Total rows", value: summary.uploaded, tone: "bg-primary/5" },
              { label: "Valid", value: summary.valid, tone: "bg-emerald-500/5" },
              { label: "Invalid", value: summary.invalid, tone: "bg-destructive/5" },
              { label: "Duplicates", value: summary.duplicate, tone: "bg-amber-500/5" },
              { label: "Importable", value: summary.valid, tone: "bg-emerald-500/5" },
            ].map(({ label, value, tone }) => (
              <Card key={label} size="sm" className={`shadow-sm ${tone}`}>
                <CardContent className="px-3 py-2.5">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="mt-0.5 text-lg font-semibold tabular-nums">{value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="min-h-[24rem] gap-0 overflow-hidden border-border/70 py-0 shadow-sm md:min-h-0 md:flex-1">
            <div className="flex shrink-0 flex-col gap-2 border-b border-border/70 p-3 sm:flex-row sm:items-center">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setPage(1);
                  }}
                  placeholder="Search preview..."
                  aria-label="Search import preview"
                  className="h-9 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
              <div className="w-full sm:w-44">
                <AppSelect
                  value={filter}
                  options={[{ value: "all", label: "All rows" }, { value: "valid", label: "Valid rows" }, { value: "issues", label: "Rows with issues" }]}
                  onValueChange={(value) => {
                    setFilter(value as PreviewFilter);
                    setPage(1);
                  }}
                />
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-auto overscroll-contain max-md:max-h-[55vh]">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="sticky top-0 z-10 bg-muted text-xs text-muted-foreground shadow-[0_1px_0_var(--border)]">
                  <tr>
                    {[
                      "Row",
                      "Customer Name",
                      "NIC",
                      "Primary Mobile",
                      "Additional Mobile",
                      "Status",
                      "Validation Issues",
                    ].map((header) => (
                      <th key={header} className="px-3 py-2.5 font-medium">{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {pagedRows.map((row) => (
                    <tr key={row.rowNumber} className="transition-colors hover:bg-muted/20">
                      <td className="px-3 py-2.5 tabular-nums">{row.rowNumber}</td>
                      <td className={`px-3 py-2.5 font-medium ${issueCellClass(row, "fullName")}`}>{row.data.fullName || "—"}</td>
                      <td className={`px-3 py-2.5 font-mono text-xs ${issueCellClass(row, "nic")}`}>{row.data.nic || "—"}</td>
                      <td className={`px-3 py-2.5 ${issueCellClass(row, "mobile")}`}>{row.data.mobile || "—"}</td>
                      <td className={`px-3 py-2.5 ${issueCellClass(row, "additionalMobile")}`}>{row.data.additionalMobile || "—"}</td>
                      <td className="px-3 py-2.5"><span className={`inline-flex rounded-full px-2 py-1 text-[11px] font-medium capitalize ${previewStatusClass(row.status)}`}>{row.status.replace("-", " ")}</span></td>
                      <td className="max-w-md px-3 py-2.5 text-xs text-muted-foreground">
                        {row.issues.map((issue) => issue.message).join(" · ") || <span className="text-emerald-700 dark:text-emerald-400">Ready to import</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border/70 bg-card p-2.5 text-xs text-muted-foreground">
              <span>{visibleRows.length} matching rows</span>
              <div className="flex items-center gap-2">
                <Button type="button" size="sm" variant="outline" disabled={currentPage <= 1} onClick={() => setPage((value) => value - 1)}>Previous</Button>
                <span>Page {currentPage} of {totalPages}</span>
                <Button type="button" size="sm" variant="outline" disabled={currentPage >= totalPages} onClick={() => setPage((value) => value + 1)}>Next</Button>
              </div>
            </div>
          </Card>

          <div className="flex shrink-0 flex-col gap-3 rounded-xl border border-border/70 bg-card p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" variant="outline" onClick={requestReset}>
                <ArrowLeft className="size-4" /> Previous
              </Button>
              <div className="flex items-center gap-3 text-xs">
                <span><strong className="text-emerald-700 dark:text-emerald-400">{summary.valid}</strong> ready</span>
                <span className="text-muted-foreground"><strong className="text-amber-700 dark:text-amber-400">{summary.invalid + summary.duplicate}</strong> skipped</span>
              </div>
            </div>
            <Button type="button" size="lg" disabled={pending || summary.valid === 0} onClick={requestImport}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              {pending ? "Importing..." : `Import ${summary.valid} Valid Customer${summary.valid === 1 ? "" : "s"}`}
            </Button>
          </div>
        </div>
      )}

      {result && (
        <Card className="border-border/70 shadow-sm">
          <CardContent className="space-y-5 p-5">
            <div className={`rounded-lg border px-4 py-3 ${resultStatusClass(result.status)}`}>
              <div className="flex items-center gap-2">
                {result.status === "FAILED" ? <AlertTriangle className="size-5" /> : <CheckCircle2 className="size-5" />}
                <span className="text-xs font-semibold tracking-wide">{(result.status ?? "RESULT").replaceAll("_", " ")}</span>
              </div>
              <h2 className="mt-2 text-lg font-semibold text-foreground">
                {result.imported > 0
                  ? `${result.imported} customer${result.imported === 1 ? "" : "s"} imported successfully.`
                  : "No customers were imported."}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Uploaded: {result.uploaded} · Imported: {result.imported} · Skipped: {result.uploaded - result.imported}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {[
                ["Imported", result.imported],
                ["Skipped", result.uploaded - result.imported],
                ["Invalid", result.invalid],
                ["Duplicates", result.duplicate],
                ["Failed", result.databaseSkipped],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-border/70 bg-muted/15 p-3">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {result.rows.length > 0 && (
                <>
                  <Button type="button" variant="outline" onClick={() => downloadCsvReport(result.rows)}><Download className="size-4" /> CSV Error Report</Button>
                  <Button type="button" variant="outline" disabled={!reportToken || pending} onClick={downloadExcelReport}><FileSpreadsheet className="size-4" /> Excel Error Report</Button>
                </>
              )}
              <Button type="button" variant="outline" onClick={resetWorkflow}>
                <RefreshCcw className="size-4" /> Import Another File
              </Button>
              <Button nativeButton={false} variant="outline" onClick={clearCompletedImportBeforeNavigation} render={<Link href="/customers/import/history" />}><History className="size-4" /> View Import History</Button>
              <Button nativeButton={false} onClick={clearCompletedImportBeforeNavigation} render={<Link href="/customers" />}>Back to Customers</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {error && (
        <p role="alert" className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      )}

      <ConfirmationDialog
        open={dialog === "reset"}
        title="Replace Import File?"
        description="The selected file, column mapping, and current validation preview will be cleared."
        confirmLabel="Replace File"
        pending={pending}
        onCancel={() => setDialog(null)}
        onConfirm={() => {
          setDialog(null);
          resetWorkflow();
        }}
      />

      <ConfirmationDialog
        open={dialog === "import"}
        title="Import Valid Customers?"
        description="Only eligible records will be imported. Invalid and duplicate rows will be skipped."
        confirmLabel="Start Import"
        pending={pending}
        confirmDisabled={!summary || summary.valid === 0}
        onCancel={() => setDialog(null)}
        onConfirm={() => {
          setDialog(null);
          handleImport();
        }}
      >
        {summary && (
          <div className="grid grid-cols-3 gap-2 rounded-lg border border-border/70 bg-muted/20 p-3 text-center">
            <div><p className="text-lg font-semibold tabular-nums">{summary.uploaded}</p><p className="text-xs text-muted-foreground">Total</p></div>
            <div><p className="text-lg font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">{summary.valid}</p><p className="text-xs text-muted-foreground">To import</p></div>
            <div><p className="text-lg font-semibold tabular-nums text-amber-700 dark:text-amber-400">{summary.invalid + summary.duplicate}</p><p className="text-xs text-muted-foreground">To skip</p></div>
          </div>
        )}
      </ConfirmationDialog>
    </div>
  );
}
