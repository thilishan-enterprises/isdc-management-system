"use client";

import { useState, type ReactNode } from "react";
import { Download } from "lucide-react";
import {
  DataTableSelectionToolbar,
  type DataTableSelectionAction,
} from "@/components/common/data-table-selection-toolbar";
import { CustomerSelectionActions } from "@/components/customers/customer-selection-actions";

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
  exportFilename?: string;
  selectionActions?: DataTableSelectionAction[];
  showExportSelected?: boolean;
  fillHeight?: boolean;
  emptyTitle: string;
  emptyDescription: string;
  customerManagementRole?: "ADMIN" | "STAFF";
};

function escapeCsv(value: string | number | null | undefined) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

export function DataTableRows({
  columns,
  rows,
  selectable = false,
  exportRows,
  exportAllHref,
  exportFilename = "records.csv",
  selectionActions = [],
  showExportSelected = true,
  fillHeight = false,
  customerManagementRole,
  emptyTitle,
  emptyDescription,
}: Props) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const currentIds = rows.map((row) => row.id);
  const currentIdSet = new Set(currentIds);

  const selectedOnPage = selectedIds.filter((id) => currentIdSet.has(id));

  const selectedSet = new Set(selectedOnPage);

  const allSelected =
    currentIds.length > 0 && selectedOnPage.length === currentIds.length;

  function toggleRow(id: string, checked: boolean) {
    setSelectedIds((previous) =>
      checked
        ? [...new Set([...previous, id])]
        : previous.filter((value) => value !== id),
    );
  }

  function toggleAll(checked: boolean) {
    setSelectedIds((previous) =>
      checked
        ? [...new Set([...previous, ...currentIds])]
        : previous.filter((id) => !currentIdSet.has(id)),
    );
  }

  function clearSelection() {
    setSelectedIds([]);
  }

  function exportCsv(selectedOnly: boolean) {
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

    const blob = new Blob(["\uFEFF", csv], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = exportFilename;

    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div
      className={[
        "flex min-w-0 flex-col",
        fillHeight ? "min-h-0 flex-1" : "",
      ].join(" ")}
    >
      {selectable && (
        <DataTableSelectionToolbar
          selectedIds={selectedOnPage}
          actions={selectionActions}
          canExport={showExportSelected && Boolean(exportRows?.length)}
          onExport={() => exportCsv(true)}
          onClear={clearSelection}
        >
          {customerManagementRole && (
            <CustomerSelectionActions
              selectedIds={selectedOnPage}
              role={customerManagementRole}
              onClear={clearSelection}
            />
          )}
        </DataTableSelectionToolbar>
      )}

      {!selectable && (exportAllHref || exportRows) && (
        <div className="flex shrink-0 items-center gap-2 border-b border-border/70 px-4 py-2.5 sm:px-5">
          {exportAllHref ? (
            <a
              href={exportAllHref}
              download
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-input bg-background px-3 text-xs font-medium hover:bg-muted"
            >
              <Download className="size-3.5" />
              Export All
            </a>
          ) : (
            <button
              type="button"
              disabled={!exportRows?.length}
              onClick={() => exportCsv(false)}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-input bg-background px-3 text-xs font-medium hover:bg-muted disabled:opacity-40"
            >
              <Download className="size-3.5" />
              Export Page
            </button>
          )}
        </div>
      )}

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
                    onChange={(event) => toggleAll(event.target.checked)}
                    className="size-4 accent-primary"
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
                        className="size-4 accent-primary"
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
