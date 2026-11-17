import "server-only";

import { prisma } from "@/lib/prisma";
import {
  IMPORT_PREVIEW_TTL_MS,
  IMPORT_RECOVERY_GRACE_MS,
  remainingImportCandidates,
} from "@/lib/import/job-state";

export async function reconcileStaleCustomerImportJobs(options: {
  initiatedByUserId?: string;
  now?: Date;
} = {}) {
  const now = options.now ?? new Date();
  const owner = options.initiatedByUserId
    ? { initiatedByUserId: options.initiatedByUserId }
    : {};
  const previewCutoff = new Date(now.getTime() - IMPORT_PREVIEW_TTL_MS);
  const recoveryCutoff = new Date(now.getTime() - IMPORT_RECOVERY_GRACE_MS);

  const ready = await prisma.importJob.findMany({
    where: { ...owner, module: "CUSTOMERS", status: "READY", createdAt: { lt: previewCutoff } },
    select: { id: true, uploadedRowCount: true, invalidCount: true, duplicateCount: true },
  });
  for (const job of ready) {
    const unresolved = Math.max(0, job.uploadedRowCount - job.invalidCount - job.duplicateCount);
    await prisma.importJob.updateMany({
      where: { id: job.id, status: "READY", createdAt: { lt: previewCutoff } },
      data: { status: "FAILED", failedCount: unresolved, failureCode: "PREVIEW_EXPIRED", completedAt: now },
    });
  }

  const processing = await prisma.importJob.findMany({
    where: {
      ...owner,
      module: "CUSTOMERS",
      status: "PROCESSING",
      OR: [
        { leaseExpiresAt: { lt: recoveryCutoff } },
        { leaseExpiresAt: null, updatedAt: { lt: recoveryCutoff } },
      ],
    },
    select: { id: true, leaseToken: true, leaseExpiresAt: true, candidateRows: true, nextBatchIndex: true, batchSize: true },
  });
  for (const job of processing) {
    const candidates = Array.isArray(job.candidateRows) ? job.candidateRows : [];
    const failed = remainingImportCandidates({
      candidateCount: candidates.length,
      nextBatchIndex: job.nextBatchIndex,
      batchSize: job.batchSize,
    });
    await prisma.importJob.updateMany({
      where: { id: job.id, status: "PROCESSING", leaseToken: job.leaseToken, leaseExpiresAt: job.leaseExpiresAt },
      data: { status: "FAILED", failedCount: { increment: failed }, failureCode: "IMPORT_INTERRUPTED", completedAt: now, leaseToken: null, leaseExpiresAt: null },
    });
  }
}
