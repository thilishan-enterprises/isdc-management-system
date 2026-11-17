"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Download } from "lucide-react";
import {
  DataTableSelectionToolbar,
  type DataTableSelectionAction,
} from "@/components/common/data-table-selection-toolbar";
import { CustomerSelectionActions } from "@/components/customers/customer-selection-actions";
import {
  MAX_SELECTED_CUSTOMERS,
  useOptionalCustomerSelection,
} from "@/components/customers/customer-selection-provider";

type Column = {
  key: string;
  header: ReactNode;
  align?: "left" | "center" | "right";
  className?: string;
};

type Row = {
  id: string;
  cells: Record<string, ReactNode>;
};

type ExportRow = Record<string, string | number | null>;

type Props = {
  columns: Column[];
  rows: Row[];
  selectable?: boolean;
  exportRows?: ExportRow[];
  exportAllHref?: string;
  exportSelectedHref?: string;
  exportFilename?: string;
  selectionActions?: DataTableSelectionAction[];
  showExportSelected?: boolean;
  fillHeight?: boolean;
  emptyTitle: string;
  emptyDescription: string;
  customerManagementRole?: "ADMIN" | "STAFF";
};

const MAX_SELECTED_RECORDS = MAX_SELECTED_CUSTOMERS;

function escapeCsv(value: string | number | null | undefined) {
  const text = String(value ?? "");

  // Protect against CSV formula injection.
  const safeText = /^[\s]*[=+\-@\t\r]/.test(text) ? `'${text}` : text;

  return `"${safeText.replace(/"/g, '""')}"`;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;

  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}

function downloadCsv(csv: string, filename: string) {
  const blob = new Blob(["\uFEFF", csv], {
    type: "text/csv;charset=utf-8;",
  });

  downloadBlob(blob, filename);
}

function getFilenameFromDisposition(
  disposition: string | null,
  fallback: string,
) {
  if (!disposition) return fallback;

  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i);

  if (encoded) {
    try {
      return decodeURIComponent(encoded[1]);
    } catch {
      return fallback;
    }
  }

  const regular = disposition.match(/filename="?([^";]+)"?/i);

  return regular?.[1] ?? fallback;
}

export function DataTableRows({
  columns,
  rows,
  selectable = false,
  exportRows,
  exportAllHref,
  exportSelectedHref,
  exportFilename = "records.csv",
  selectionActions = [],
  showExportSelected = true,
  fillHeight = false,
  customerManagementRole,
  emptyTitle,
  emptyDescription,
}: Props) {
  /*
   * Customers use the persistent selection provider.
   * Other tables continue using local selection.
   */
  const customerSelection = useOptionalCustomerSelection();

  const useCustomerProvider =
    selectable && Boolean(customerManagementRole) && customerSelection !== null;

  const [localSelectedIds, setLocalSelectedIds] = useState<string[]>([]);

  const selectedIds = useCustomerProvider
    ? customerSelection!.selectedIds
    : localSelectedIds;

  const [isExporting, setIsExporting] = useState(false);

  const [exportError, setExportError] = useState<string | null>(null);

  const exportControllerRef = useRef<AbortController | null>(null);

  /*
   * Only abort unfinished exports on unmount.
   *
   * Do not clear selections here:
   * the Customers provider owns their lifetime.
   */
  useEffect(() => {
    return () => {
      exportControllerRef.current?.abort();
    };
  }, []);

  const currentIds = rows.map((row) => row.id);

  const currentIdSet = new Set(currentIds);

  const selectedOnPage = selectedIds.filter((id) => currentIdSet.has(id));

  const selectedSet = new Set(selectedOnPage);

  const allSelected =
    currentIds.length > 0 && currentIds.every((id) => selectedSet.has(id));

  const someSelected = selectedOnPage.length > 0 && !allSelected;

  function clearSelection() {
    if (useCustomerProvider) {
      customerSelection!.clearSelection();
    } else {
      setLocalSelectedIds([]);
    }

    setExportError(null);
  }

  function toggleRow(id: string, checked: boolean) {
    setExportError(null);

    if (useCustomerProvider) {
      if (checked) {
        if (
          !selectedIds.includes(id) &&
          selectedIds.length >= MAX_SELECTED_RECORDS
        ) {
          setExportError(
            `You can select up to ${MAX_SELECTED_RECORDS.toLocaleString("en-LK")} records.`,
          );

          return;
        }

        customerSelection!.select(id);
      } else {
        customerSelection!.deselect(id);
      }

      return;
    }

    if (
      checked &&
      !selectedIds.includes(id) &&
      selectedIds.length >= MAX_SELECTED_RECORDS
    ) {
      setExportError(
        `You can select up to ${MAX_SELECTED_RECORDS.toLocaleString("en-LK")} records.`,
      );

      return;
    }

    setLocalSelectedIds((previous) => {
      if (!checked) {
        return previous.filter((value) => value !== id);
      }

      if (previous.includes(id)) return previous;

      if (previous.length >= MAX_SELECTED_RECORDS) {
        return previous;
      }

      return [...previous, id];
    });
  }

  function toggleAll(checked: boolean) {
    setExportError(null);

    if (useCustomerProvider) {
      if (checked) {
        const existing = new Set(selectedIds);

        const newIds = currentIds.filter((id) => !existing.has(id));

        const remainingCapacity = MAX_SELECTED_RECORDS - selectedIds.length;

        if (newIds.length > remainingCapacity) {
          setExportError(
            `You can select up to ${MAX_SELECTED_RECORDS.toLocaleString("en-LK")} records.`,
          );

          return;
        }

        customerSelection!.selectMany(currentIds);
      } else {
        customerSelection!.deselectMany(currentIds);
      }

      return;
    }

    if (checked) {
      const existing = new Set(selectedIds);

      const newIds = currentIds.filter((id) => !existing.has(id));

      if (selectedIds.length + newIds.length > MAX_SELECTED_RECORDS) {
        setExportError(
          `You can select up to ${MAX_SELECTED_RECORDS.toLocaleString("en-LK")} records.`,
        );

        return;
      }
    }

    setLocalSelectedIds((previous) => {
      if (!checked) {
        return previous.filter((id) => !currentIdSet.has(id));
      }

      const existing = new Set(previous);

      const additions = currentIds.filter((id) => !existing.has(id));

      if (previous.length + additions.length > MAX_SELECTED_RECORDS) {
        return previous;
      }

      return [...previous, ...additions];
    });
  }

  /*
   * Local CSV export for tables that already
   * provide exportRows.
   */
  function exportPageCsv(selectedOnly: boolean) {
    if (!exportRows?.length) return;

    const data = exportRows.filter((_, index) =>
      selectedOnly ? selectedSet.has(rows[index]?.id) : true,
    );

    if (!data.length) return;

    const headers = Object.keys(data[0]);

    const csv = [
      headers.map(escapeCsv).join(","),
      ...data.map((row) =>
        headers.map((header) => escapeCsv(row[header])).join(","),
      ),
    ].join("\r\n");

    downloadCsv(csv, exportFilename);

    if (selectedOnly) {
      clearSelection();
    }
  }

  /*
   * Export selected records across multiple pages.
   *
   * Selected IDs are sent to the server endpoint.
   * The server retrieves the actual records.
   */
  async function exportSelectedRecords() {
    if (selectedIds.length === 0 || isExporting) {
      return;
    }

    if (!exportSelectedHref) {
      if (selectedIds.length !== selectedOnPage.length) {
        setExportError("Cross-page export requires a server export endpoint.");

        return;
      }

      exportPageCsv(true);
      return;
    }

    const controller = new AbortController();

    exportControllerRef.current = controller;

    setIsExporting(true);
    setExportError(null);

    const idsToExport = [...selectedIds];

    try {
      const response = await fetch(exportSelectedHref, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "same-origin",
        body: JSON.stringify({
          ids: idsToExport,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        let message = "Unable to export selected records.";

        try {
          const result: unknown = await response.json();

          if (
            typeof result === "object" &&
            result !== null &&
            "error" in result &&
            typeof result.error === "string"
          ) {
            message = result.error;
          }
        } catch {
          // Keep the default message.
        }

        throw new Error(message);
      }

      const blob = await response.blob();

      if (blob.size === 0) {
        throw new Error("The exported file is empty.");
      }

      const filename = getFilenameFromDisposition(
        response.headers.get("Content-Disposition"),
        exportFilename,
      );

      downloadBlob(blob, filename);

      /*
       * Clear only the IDs that were exported.
       *
       * This avoids removing newer selections made
       * while the export request was running.
       */
      if (useCustomerProvider) {
        customerSelection!.deselectMany(idsToExport);
      } else {
        const exportedSet = new Set(idsToExport);

        setLocalSelectedIds((previous) =>
          previous.filter((id) => !exportedSet.has(id)),
        );
      }

      setExportError(null);
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }

      setExportError(
        error instanceof Error
          ? error.message
          : "Unable to export selected records.",
      );
    } finally {
      if (exportControllerRef.current === controller) {
        exportControllerRef.current = null;
      }

      if (!controller.signal.aborted) {
        setIsExporting(false);
      }
    }
  }

  return (
    <div
      className={[
        "flex min-w-0 flex-col",
        fillHeight ? "min-h-0 flex-1" : "",
      ].join(" ")}
    >
      {/* Selection toolbar */}
      {selectable && (
        <DataTableSelectionToolbar
          selectedIds={selectedIds}
          selectedOnPageCount={selectedOnPage.length}
          actions={selectionActions}
          canExport={
            showExportSelected &&
            Boolean(exportSelectedHref || exportRows?.length)
          }
          onExport={exportSelectedRecords}
          onClear={clearSelection}
        >
          {customerManagementRole && (
            <CustomerSelectionActions
              selectedIds={selectedIds}
              role={customerManagementRole}
              onClear={clearSelection}
            />
          )}
        </DataTableSelectionToolbar>
      )}

      {/* Export error */}
      {exportError && (
        <div
          role="alert"
          className="border-b border-destructive/20 bg-destructive/5 px-4 py-2 text-xs text-destructive sm:px-5"
        >
          {exportError}
        </div>
      )}

      {/* Export progress */}
      {isExporting && (
        <div
          role="status"
          className="border-b border-border/70 bg-muted/30 px-4 py-2 text-xs text-muted-foreground sm:px-5"
        >
          Preparing selected records for export...
        </div>
      )}

      {/* Export controls for non-selectable tables */}
      {!selectable && (exportAllHref || exportRows) && (
        <div className="flex shrink-0 items-center gap-2 border-b border-border/70 px-4 py-2.5 sm:px-5">
          {exportAllHref ? (
            <a
              href={exportAllHref}
              download
              className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-input bg-background px-3 text-xs font-medium hover:bg-muted"
            >
              <Download className="size-3.5" />
              Export All
            </a>
          ) : (
            <button
              type="button"
              disabled={!exportRows?.length}
              onClick={() => exportPageCsv(false)}
              className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-input bg-background px-3 text-xs font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Download className="size-3.5" />
              Export Page
            </button>
          )}
        </div>
      )}

      {/* Table */}
      <div
        className={[
          "w-full min-w-0 overflow-x-auto",
          fillHeight ? "min-h-0 flex-1 overflow-y-auto overscroll-contain" : "",
        ].join(" ")}
      >
        <table className="w-full border-collapse text-left text-sm">
          <thead
            className={
              fillHeight ? "sticky top-0 z-10 bg-muted" : "bg-muted/40"
            }
          >
            <tr className="border-b border-border/70">
              {selectable && (
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    aria-label="Select all rows on this page"
                    checked={allSelected}
                    ref={(element) => {
                      if (element) {
                        element.indeterminate = someSelected;
                      }
                    }}
                    onChange={(event) => toggleAll(event.target.checked)}
                    className="size-4 cursor-pointer accent-primary"
                  />
                </th>
              )}

              {columns.map((column) => (
                <th
                  key={column.key}
                  className={[
                    "px-4 py-3 text-xs font-semibold text-muted-foreground",
                    column.align === "right"
                      ? "text-right"
                      : column.align === "center"
                        ? "text-center"
                        : "text-left",
                    column.className ?? "",
                  ].join(" ")}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>

          <tbody className="divide-y divide-border/60">
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + (selectable ? 1 : 0)}
                  className="px-4 py-14 text-center"
                >
                  <p className="text-sm font-semibold">{emptyTitle}</p>

                  <p className="mt-1 text-xs text-muted-foreground">
                    {emptyDescription}
                  </p>
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={row.id}
                  className={[
                    "transition-colors hover:bg-muted/25",
                    selectedSet.has(row.id) ? "bg-primary/5" : "",
                  ].join(" ")}
                >
                  {selectable && (
                    <td className="px-4 py-3.5">
                      <input
                        type="checkbox"
                        checked={selectedSet.has(row.id)}
                        aria-label={`Select row ${row.id}`}
                        onChange={(event) =>
                          toggleRow(row.id, event.target.checked)
                        }
                        className="size-4 cursor-pointer accent-primary"
                      />
                    </td>
                  )}

                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={[
                        "px-4 py-3.5 align-middle",
                        column.align === "right"
                          ? "text-right"
                          : column.align === "center"
                            ? "text-center"
                            : "text-left",
                        column.className ?? "",
                      ].join(" ")}
                    >
                      {row.cells[column.key] ?? "—"}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
