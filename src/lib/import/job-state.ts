export type FinalImportStatus = "COMPLETED" | "PARTIAL" | "NO_CHANGES" | "FAILED";

export const IMPORT_PREVIEW_TTL_MS = 30 * 60_000;
export const IMPORT_RECOVERY_GRACE_MS = 30 * 60_000;

export function remainingImportCandidates(input: {
  candidateCount: number;
  nextBatchIndex: number;
  batchSize: number;
}) {
  return Math.max(0, input.candidateCount - input.nextBatchIndex * input.batchSize);
}

export function importFailureMessage(failureCode: string | null, importedCount: number) {
  switch (failureCode) {
    case "PREVIEW_EXPIRED":
      return "This import preview expired before confirmation. Upload the file again to start a new import.";
    case "IMPORT_INTERRUPTED":
      return importedCount > 0
        ? "The import was interrupted after some customers were committed. Review the counts before retrying the remaining data."
        : "The import was interrupted before any customers were committed. Upload the file again to retry.";
    case "DUPLICATE_CONFLICT":
      return "The import stopped because customer data changed and created a duplicate conflict.";
    case "SERIALIZATION_RETRY_EXHAUSTED":
      return "The import could not complete because of concurrent database activity. Please retry with a new import session.";
    default:
      return "The import stopped because of an unrecoverable processing error.";
  }
}

export function deriveFinalImportStatus(input: {
  imported: number;
  skipped: number;
  failed: number;
}): FinalImportStatus {
  if (input.failed > 0 && input.imported === 0) return "FAILED";
  if (input.imported > 0 && (input.skipped > 0 || input.failed > 0)) return "PARTIAL";
  if (input.imported > 0) return "COMPLETED";
  return "NO_CHANGES";
}
