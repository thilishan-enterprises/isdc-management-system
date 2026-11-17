import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft, Eye, FileSpreadsheet } from "lucide-react";
import { connection } from "next/server";
import { ImportJobStatus } from "@/generated/prisma/enums";
import { Button } from "@/components/ui/button";
import {
  DataTable,
  type DataTableColumn,
  type DataTableRow,
} from "@/components/common/data-table";
import { DataTableToolbar } from "@/components/common/data-table-toolbar";
import { PageWorkspace } from "@/components/layout/page-workspace";
import { requireUser } from "@/lib/auth-guards";
import { prisma } from "@/lib/prisma";
import { reconcileStaleCustomerImportJobs } from "@/lib/import/reconcile-jobs";

const DEFAULT_PAGE_SIZE = 20;
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

type CustomerImportHistoryPageProps = {
  searchParams: Promise<{
    page?: string;
    q?: string;
    status?: string;
    size?: string;
  }>;
};

const columns: DataTableColumn[] = [
  { key: "filename", header: "Filename", className: "min-w-64" },
  { key: "user", header: "Imported by", className: "min-w-40" },
  { key: "date", header: "Date & time", className: "min-w-48" },
  { key: "uploaded", header: "Uploaded", align: "right" },
  { key: "imported", header: "Imported", align: "right" },
  { key: "skipped", header: "Skipped", align: "right" },
  { key: "status", header: "Status", className: "min-w-32" },
  { key: "actions", header: "", align: "right", className: "w-24" },
];

function ImportHistoryFallback() {
  return (
    <div
      className="mx-auto flex min-h-0 w-full max-w-[1440px] flex-1 flex-col gap-3"
      role="status"
    >
      <div className="h-12 shrink-0 animate-pulse rounded-xl bg-muted" />
      <div className="min-h-0 flex-1 animate-pulse rounded-xl bg-muted" />
      <span className="sr-only">Loading customer import history...</span>
    </div>
  );
}

function statusClass(status: ImportJobStatus) {
  if (status === "COMPLETED") {
    return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400";
  }
  if (status === "FAILED") return "bg-destructive/10 text-destructive";
  if (status === "PARTIAL" || status === "PROCESSING") {
    return "bg-amber-500/10 text-amber-700 dark:text-amber-400";
  }
  if (status === "NO_CHANGES") {
    return "bg-amber-500/10 text-amber-700 dark:text-amber-400";
  }
  return "bg-muted text-muted-foreground";
}

function buildHistoryUrl(input: {
  page: number;
  pageSize: number;
  q: string;
  status?: ImportJobStatus;
}) {
  const params = new URLSearchParams();
  if (input.page > 1) params.set("page", String(input.page));
  if (input.pageSize !== DEFAULT_PAGE_SIZE) {
    params.set("size", String(input.pageSize));
  }
  if (input.q) params.set("q", input.q);
  if (input.status) params.set("status", input.status);
  const query = params.toString();
  return query
    ? `/customers/import/history?${query}`
    : "/customers/import/history";
}

export default function CustomerImportHistoryPage({
  searchParams,
}: CustomerImportHistoryPageProps) {
  return (
    <Suspense fallback={<ImportHistoryFallback />}>
      <CustomerImportHistoryContent searchParams={searchParams} />
    </Suspense>
  );
}

async function CustomerImportHistoryContent({
  searchParams,
}: CustomerImportHistoryPageProps) {
  await connection();
  await requireUser();
  await reconcileStaleCustomerImportJobs();

  const query = await searchParams;
  const requestedPage = Number.parseInt(query.page ?? "1", 10);
  const requestedSize = Number.parseInt(query.size ?? String(DEFAULT_PAGE_SIZE), 10);
  const pageSize = PAGE_SIZE_OPTIONS.includes(requestedSize)
    ? requestedSize
    : DEFAULT_PAGE_SIZE;
  const q = typeof query.q === "string" ? query.q.trim().slice(0, 255) : "";
  const status = Object.values(ImportJobStatus).includes(
    query.status as ImportJobStatus,
  )
    ? (query.status as ImportJobStatus)
    : undefined;
  const where = {
    module: "CUSTOMERS" as const,
    ...(q
      ? { originalFilename: { contains: q, mode: "insensitive" as const } }
      : {}),
    ...(status ? { status } : {}),
  };

  const totalRows = await prisma.importJob.count({ where });
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const page = Number.isFinite(requestedPage)
    ? Math.min(Math.max(1, requestedPage), totalPages)
    : 1;
  const jobs = await prisma.importJob.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * pageSize,
    take: pageSize,
    include: { initiatedBy: { select: { username: true } } },
  });

  const rows: DataTableRow[] = jobs.map((job) => ({
    id: job.id,
    cells: {
      filename: (
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <FileSpreadsheet className="size-4" />
          </span>
          <span className="truncate font-medium" title={job.originalFilename}>
            {job.originalFilename}
          </span>
        </div>
      ),
      user: (
        <div className="flex items-center gap-2">
          <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
            {job.initiatedBy.username.charAt(0).toUpperCase()}
          </span>
          <span className="truncate">{job.initiatedBy.username}</span>
        </div>
      ),
      date: (
        <span className="whitespace-nowrap text-muted-foreground">
          {job.createdAt.toLocaleString("en-LK", {
            dateStyle: "medium",
            timeStyle: "short",
          })}
        </span>
      ),
      uploaded: (
        <span className="tabular-nums">{job.uploadedRowCount}</span>
      ),
      imported: <span className="tabular-nums">{job.importedCount}</span>,
      skipped: <span className="tabular-nums">{job.skippedCount}</span>,
      status: (
        <span
          className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${statusClass(job.status)}`}
        >
          {job.status.replaceAll("_", " ")}
        </span>
      ),
      actions: (
        <Button
          nativeButton={false}
          size="sm"
          variant="ghost"
          render={<Link href={`/customers/import/history/${job.id}`} />}
        >
          <Eye className="size-4" /> Details
        </Button>
      ),
    },
  }));

  const filters = [
    {
      name: "status",
      label: "Status",
      placeholder: "All statuses",
      value: status,
      options: Object.values(ImportJobStatus).map((value) => ({
        value,
        label: value.replaceAll("_", " "),
      })),
    },
  ];

  return (
    <PageWorkspace
      className="mx-auto w-full max-w-[1440px]"
      scrollMode="table"
      toolbar={
        <div className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-sm [&>div]:border-b-0">
          <DataTableToolbar
            searchPlaceholder="Search by filename..."
            filters={filters}
            actions={
              <Button
                nativeButton={false}
                variant="outline"
                render={<Link href="/customers/import" />}
              >
                <ArrowLeft className="size-4" /> Back to Import
              </Button>
            }
          />
        </div>
      }
    >
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <DataTable
          fillHeight
          columns={columns}
          rows={rows}
          page={page}
          pageSize={pageSize}
          totalRows={totalRows}
          pageHref={(nextPage) =>
            buildHistoryUrl({ page: nextPage, pageSize, q, status })
          }
          pageSizeOptions={PAGE_SIZE_OPTIONS}
          pageSizeHref={(size) =>
            buildHistoryUrl({ page: 1, pageSize: size, q, status })
          }
          emptyTitle="No import history found"
          emptyDescription="Try adjusting the filename search or status filter."
        />
      </div>
    </PageWorkspace>
  );
}
