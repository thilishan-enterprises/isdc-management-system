import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft, CalendarClock, FileSpreadsheet, UserRound } from "lucide-react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth-guards";
import { prisma } from "@/lib/prisma";
import { importFailureMessage } from "@/lib/import/job-state";
import { reconcileStaleCustomerImportJobs } from "@/lib/import/reconcile-jobs";

type CustomerImportDetailsPageProps = {
  params: Promise<{ id: string }>;
};

function ImportDetailsFallback() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-4" role="status">
      <div className="h-12 animate-pulse rounded-xl bg-muted" />
      <div className="h-72 animate-pulse rounded-xl bg-muted" />
      <span className="sr-only">Loading import details...</span>
    </div>
  );
}

function statusClass(status: string) {
  if (status === "COMPLETED") return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400";
  if (status === "FAILED") return "bg-destructive/10 text-destructive";
  if (status === "PARTIAL" || status === "PROCESSING") return "bg-amber-500/10 text-amber-700 dark:text-amber-400";
  return "bg-muted text-muted-foreground";
}

export default function CustomerImportDetailsPage({ params }: CustomerImportDetailsPageProps) {
  return (
    <Suspense fallback={<ImportDetailsFallback />}>
      <CustomerImportDetailsContent params={params} />
    </Suspense>
  );
}

async function CustomerImportDetailsContent({ params }: CustomerImportDetailsPageProps) {
  await connection();

  await requireUser();
  await reconcileStaleCustomerImportJobs();
  const { id } = await params;
  const job = await prisma.importJob.findFirst({ where: { id, module: "CUSTOMERS" }, include: { initiatedBy: { select: { username: true } } } });
  if (!job) notFound();
  const counts = [
    ["Uploaded", job.uploadedRowCount, "bg-primary/5"], ["Imported", job.importedCount, "bg-emerald-500/5"], ["Skipped", job.skippedCount, "bg-amber-500/5"], ["Invalid", job.invalidCount, "bg-destructive/5"], ["Duplicates", job.duplicateCount, "bg-amber-500/5"], ["Failed", job.failedCount, "bg-destructive/5"],
  ];
  return <div className="mx-auto w-full max-w-3xl space-y-4">
    <div className="flex justify-end"><Button nativeButton={false} variant="outline" render={<Link href="/customers/import/history" />}><ArrowLeft className="size-4" /> Import History</Button></div>
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="flex flex-col gap-4 border-b p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="flex min-w-0 items-center gap-3"><span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><FileSpreadsheet className="size-5" /></span><div className="min-w-0"><h2 className="truncate font-semibold" title={job.originalFilename}>{job.originalFilename}</h2><p className="mt-1 text-xs text-muted-foreground">Read-only import job details</p></div></div>
        <span className={`w-fit rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(job.status)}`}>{job.status.replaceAll("_", " ")}</span>
      </div>
      <div className="grid gap-3 p-4 sm:grid-cols-3 sm:p-5">{counts.map(([label, value, tone]) => <div key={label} className={`rounded-lg border border-border/60 p-3 ${tone}`}><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-xl font-semibold tabular-nums">{value}</p></div>)}</div>
      <dl className="grid gap-4 border-t p-4 sm:grid-cols-2 sm:p-5">
        <div className="flex gap-3"><UserRound className="mt-0.5 size-4 text-muted-foreground" /><div><dt className="text-xs text-muted-foreground">Imported by</dt><dd className="mt-1 text-sm font-medium">{job.initiatedBy.username}</dd></div></div>
        <div className="flex gap-3"><CalendarClock className="mt-0.5 size-4 text-muted-foreground" /><div><dt className="text-xs text-muted-foreground">Started</dt><dd className="mt-1 text-sm font-medium">{job.startedAt?.toLocaleString("en-LK", { dateStyle: "medium", timeStyle: "short" }) ?? "Not started"}</dd></div></div>
        <div className="flex gap-3"><CalendarClock className="mt-0.5 size-4 text-muted-foreground" /><div><dt className="text-xs text-muted-foreground">Completed</dt><dd className="mt-1 text-sm font-medium">{job.completedAt?.toLocaleString("en-LK", { dateStyle: "medium", timeStyle: "short" }) ?? "Not completed"}</dd></div></div>
        <div><dt className="text-xs text-muted-foreground">Processing attempts</dt><dd className="mt-1 text-sm font-medium tabular-nums">{job.attemptCount}</dd></div>
      </dl>
      {job.failureCode && <p className="m-4 mt-0 rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive sm:mx-5 sm:mb-5">{importFailureMessage(job.failureCode, job.importedCount)}</p>}
    </div>
  </div>;
}
