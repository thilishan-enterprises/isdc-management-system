import type { ReactNode } from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  DataTableToolbar,
  type DataTableFilter,
} from "@/components/common/data-table-toolbar";
import { DataTableRows } from "@/components/common/data-table-rows";
import { DataTablePageSize } from "@/components/common/data-table-page-size";
import type { DataTableSelectionAction } from "@/components/common/data-table-selection-toolbar";

export type DataTableColumn = {
  key: string;
  header: string;
  className?: string;
  align?: "left" | "center" | "right";
  sortable?: boolean;
};

export type DataTableRow = {
  id: string;
  cells: Record<string, ReactNode>;
};

export type DataTableExportRow = Record<string, string | number | null>;

type DataTableProps = {
  columns: DataTableColumn[];
  rows: DataTableRow[];
  title?: string;
  description?: string;
  actions?: ReactNode;
  exportAllHref?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
  filters?: DataTableFilter[];

  page: number;
  pageSize: number;
  totalRows: number;
  pageHref: (page: number) => string;

  sort?: string;
  direction?: "asc" | "desc";
  sortHref?: (key: string, direction: "asc" | "desc") => string;

  pageSizeOptions?: number[];
  pageSizeHref?: (size: number) => string;

  selectable?: boolean;
  exportRows?: DataTableExportRow[];
  exportFilename?: string;
  selectionActions?: DataTableSelectionAction[];
  showExportSelected?: boolean;

  fillHeight?: boolean;

  emptyTitle?: string;
  emptyDescription?: string;

  customerManagementRole?: "ADMIN" | "STAFF";
};

export function DataTable({
  columns,
  rows,
  title,
  description,
  actions,
  searchable = false,
  searchPlaceholder = "Search records...",
  filters = [],
  page,
  pageSize,
  totalRows,
  pageHref,
  sort = "",
  direction = "asc",
  sortHref,
  pageSizeOptions = [10, 25, 50, 100],
  pageSizeHref,
  selectable = false,
  exportRows,
  exportAllHref,
  exportFilename = "records.csv",
  selectionActions = [],
  showExportSelected = true,
  fillHeight = false,
  emptyTitle = "No records found",
  emptyDescription = "Try changing your search or filters.",
  customerManagementRole,
}: DataTableProps) {
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));

  const currentPage = Math.min(Math.max(1, page), totalPages);

  const start = totalRows === 0 ? 0 : (currentPage - 1) * pageSize + 1;

  const end = Math.min(currentPage * pageSize, totalRows);

  const displayColumns = columns.map((column) => {
    if (!column.sortable || !sortHref) {
      return column;
    }

    const active = sort === column.key;

    const nextDirection = active && direction === "asc" ? "desc" : "asc";

    return {
      ...column,
      header: (
        <Link
          href={sortHref(column.key, nextDirection)}
          scroll={false}
          className="inline-flex items-center gap-1.5 hover:text-foreground"
        >
          {column.header}

          {active ? (
            direction === "asc" ? (
              <ArrowUp className="size-3.5" />
            ) : (
              <ArrowDown className="size-3.5" />
            )
          ) : (
            <ArrowUpDown className="size-3.5 opacity-50" />
          )}
        </Link>
      ),
    };
  });

  return (
    <div
      className={[
        "min-w-0 overflow-hidden rounded-xl border border-border/70 bg-card shadow-sm",
        fillHeight ? "flex min-h-0 flex-1 flex-col" : "",
      ].join(" ")}
    >
      {(title || description || actions) && (
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border/70 px-4 py-4 sm:px-5">
          <div className="space-y-1">
            {title && (
              <h2 className="text-base font-semibold tracking-tight">
                {title}
              </h2>
            )}

            {description && (
              <p className="text-xs text-muted-foreground">{description}</p>
            )}
          </div>

          {actions}
        </div>
      )}

      {searchable && (
        <div className="shrink-0">
          <DataTableToolbar
            searchPlaceholder={searchPlaceholder}
            filters={filters}
          />
        </div>
      )}

      <DataTableRows
        columns={displayColumns}
        rows={rows}
        selectable={selectable}
        exportRows={exportRows}
        exportAllHref={exportAllHref}
        exportFilename={exportFilename}
        selectionActions={selectionActions}
        showExportSelected={showExportSelected}
        fillHeight={fillHeight}
        customerManagementRole={customerManagementRole}
        emptyTitle={emptyTitle}
        emptyDescription={emptyDescription}
      />

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border/70 bg-muted/10 px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-center gap-4">
          <p className="text-xs text-muted-foreground">
            Showing{" "}
            <span className="font-medium text-foreground">
              {start}–{end}
            </span>{" "}
            of{" "}
            <span className="font-medium text-foreground">
              {totalRows.toLocaleString("en-LK")}
            </span>{" "}
            records
          </p>

          {pageSizeHref && (
            <DataTablePageSize
              value={pageSize}
              options={pageSizeOptions.map((size) => ({
                value: String(size),
                label: String(size),
                href: pageSizeHref(size),
              }))}
            />
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="mr-2 text-xs text-muted-foreground">
            Page {currentPage} of {totalPages}
          </span>

          {currentPage > 1 ? (
            <Link
              href={pageHref(currentPage - 1)}
              scroll={false}
              aria-label="Previous page"
              className="inline-flex size-8 items-center justify-center rounded-lg border border-input bg-background hover:bg-muted"
            >
              <ChevronLeft className="size-4" />
            </Link>
          ) : (
            <span className="inline-flex size-8 items-center justify-center rounded-lg border border-border/60 text-muted-foreground/40">
              <ChevronLeft className="size-4" />
            </span>
          )}

          {currentPage < totalPages ? (
            <Link
              href={pageHref(currentPage + 1)}
              scroll={false}
              aria-label="Next page"
              className="inline-flex size-8 items-center justify-center rounded-lg border border-input bg-background hover:bg-muted"
            >
              <ChevronRight className="size-4" />
            </Link>
          ) : (
            <span className="inline-flex size-8 items-center justify-center rounded-lg border border-border/60 text-muted-foreground/40">
              <ChevronRight className="size-4" />
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
