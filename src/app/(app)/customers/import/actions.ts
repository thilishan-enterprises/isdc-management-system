"use server";

import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth-guards";
import { validateColumnMapping } from "@/lib/import/column-mapping";
import { deriveFinalImportStatus, importFailureMessage, remainingImportCandidates } from "@/lib/import/job-state";
import { reconcileStaleCustomerImportJobs } from "@/lib/import/reconcile-jobs";
import { IMPORT_LIMITS, type ImportColumnMapping, type ImportSourceRow } from "@/lib/import/types";
import { prisma } from "@/lib/prisma";
import { customerPhoneOwnershipWhere } from "@/lib/customer-ownership";
import { CUSTOMER_IMPORT_FIELDS, type CustomerImportField } from "./config";
import { buildCustomerImportErrorWorkbook } from "./excel-error-report";
import { applyUploadDuplicateRules, prepareCustomerImportRows, validateCustomerImportData, type CustomerImportIssue, type CustomerImportPreviewRow, type PreparedCustomerImportRow } from "./validation";

const BATCH_SIZE = 100;
const LEASE_MS = 120_000;
const TERMINAL = new Set(["COMPLETED", "PARTIAL", "NO_CHANGES", "FAILED"]);

type ValidateInput = { originalFilename: string; sessionKey: string; headers: string[]; rows: ImportSourceRow[]; mapping: ImportColumnMapping<CustomerImportField> };
export type CustomerImportSummary = { uploaded: number; valid: number; invalid: number; duplicate: number };
export type CustomerImportValidationResult = { success: boolean; error?: string; rows?: CustomerImportPreviewRow[]; summary?: CustomerImportSummary; token?: string; reportToken?: string };
export type CustomerImportFinalResult = { success: boolean; error?: string; inProgress?: boolean; jobId?: string; status?: string; uploaded: number; imported: number; invalid: number; duplicate: number; databaseSkipped: number; rows: CustomerImportPreviewRow[]; reportToken?: string };

type ImportEnvelope = { kind: "import"; version: 2; userId: string; jobId: string; payloadDigest: string; expiresAt: number; rows: PreparedCustomerImportRow[] };
type ReportEnvelope = { kind: "report"; version: 1; userId: string; expiresAt: number; rows: CustomerImportPreviewRow[] };
type Envelope = ImportEnvelope | ReportEnvelope;

function secret() {
  const value = process.env.IMPORT_SIGNING_SECRET ?? process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!value || value.length < 32) throw new Error("IMPORT_SECRET_UNAVAILABLE");
  return value;
}
function sign(payload: Envelope) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${createHmac("sha256", secret()).update(body).digest("hex")}`;
}
function verify<T extends Envelope["kind"]>(token: string, userId: string, kind: T) {
  try {
    const [body, signature, extra] = token.split(".");
    if (!body || !signature || extra) return null;
    const expected = Buffer.from(createHmac("sha256", secret()).update(body).digest("hex"), "hex");
    const supplied = Buffer.from(signature, "hex");
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Envelope;
    if (payload.kind !== kind || payload.userId !== userId || payload.expiresAt < Date.now() || payload.expiresAt > Date.now() + 31 * 60_000 || !Array.isArray(payload.rows) || payload.rows.length > IMPORT_LIMITS.maxRows) return null;
    return payload as Extract<Envelope, { kind: T }>;
  } catch { return null; }
}
const digest = (rows: PreparedCustomerImportRow[]) => createHash("sha256").update(JSON.stringify(rows)).digest("hex");
const summary = (rows: CustomerImportPreviewRow[]): CustomerImportSummary => ({ uploaded: rows.length, valid: rows.filter((row) => row.status === "valid").length, invalid: rows.filter((row) => row.status === "invalid").length, duplicate: rows.filter((row) => row.status === "duplicate").length });
const duplicate = (code: string, field: CustomerImportField, message: string): CustomerImportIssue => ({ type: "duplicate", code, field, message });
const prismaCode = (error: unknown, code: string) => typeof error === "object" && error !== null && "code" in error && error.code === code;

async function evaluateRows(rows: PreparedCustomerImportRow[]) {
  const evaluated = rows.map((row) => ({ ...row, issues: [...row.sourceIssues, ...validateCustomerImportData(row.data)] }));
  const clean = evaluated.filter((row) => !row.issues.length);
  const nics = [...new Set(clean.map((row) => row.data.nic))];
  const phones = [...new Set(clean.flatMap((row) => [row.data.mobile, row.data.additionalMobile].filter(Boolean)))];
  const [nicOwners, phoneOwners] = await Promise.all([
    nics.length ? prisma.customer.findMany({ where: { nic: { in: nics } }, select: { nic: true } }) : [],
    phones.length ? prisma.customerPhone.findMany({ where: customerPhoneOwnershipWhere(phones), select: { normalizedPhone: true } }) : [],
  ]);
  const existingNics = new Set(nicOwners.map((row) => row.nic));
  const existingPhones = new Set(phoneOwners.map((row) => row.normalizedPhone));
  for (const row of evaluated) {
    if (row.issues.length) continue;
    if (existingNics.has(row.data.nic)) row.issues.push(duplicate("DATABASE_DUPLICATE_NIC", "nic", "NIC is already registered."));
    if (existingPhones.has(row.data.mobile)) row.issues.push(duplicate("DATABASE_DUPLICATE_PRIMARY_MOBILE", "mobile", "Primary Mobile is already registered."));
    if (row.data.additionalMobile && existingPhones.has(row.data.additionalMobile)) row.issues.push(duplicate("DATABASE_DUPLICATE_ADDITIONAL_MOBILE", "additionalMobile", "Additional Mobile is already registered."));
  }
  applyUploadDuplicateRules(evaluated);
  return evaluated.map<CustomerImportPreviewRow>((row) => ({ ...row, status: row.issues.some((issue) => issue.type === "invalid") ? "invalid" : row.issues.length ? "duplicate" : "valid" }));
}
function makeReportToken(userId: string, rows: CustomerImportPreviewRow[]) {
  return rows.length ? sign({ kind: "report", version: 1, userId, expiresAt: Date.now() + 30 * 60_000, rows }) : undefined;
}

export async function validateCustomerImport(input: ValidateInput): Promise<CustomerImportValidationResult> {
  const session = await requireUser();
  try {
    await reconcileStaleCustomerImportJobs({ initiatedByUserId: session.user.id });
    if (!input || !/^[A-Za-z0-9_-]{16,64}$/.test(input.sessionKey) || !input.originalFilename?.trim() || input.originalFilename.length > 255 || !input.headers?.length || input.headers.length > IMPORT_LIMITS.maxColumns || !input.rows?.length || input.rows.length > IMPORT_LIMITS.maxRows) return { success: false, error: "The import data or session identifier is invalid." };
    if (Buffer.byteLength(JSON.stringify(input), "utf8") > IMPORT_LIMITS.maxCanonicalBytes) return { success: false, error: "The parsed customer data is too large to validate safely." };
    const mappingErrors = validateColumnMapping(input.headers, input.mapping, CUSTOMER_IMPORT_FIELDS);
    if (mappingErrors.length) return { success: false, error: mappingErrors.join(" ") };
    const prepared = prepareCustomerImportRows(input.rows, input.mapping);
    const payloadDigest = digest(prepared);
    const filename = input.originalFilename.split(/[\\/]/).pop()?.trim() ?? "customer-import";
    let job = await prisma.importJob.findUnique({ where: { sessionKey: input.sessionKey } });
    if (job && (job.initiatedByUserId !== session.user.id || job.payloadDigest !== payloadDigest || job.module !== "CUSTOMERS")) return { success: false, error: "This import session does not match the uploaded file." };
    if (!job) {
      try { job = await prisma.importJob.create({ data: { sessionKey: input.sessionKey, module: "CUSTOMERS", payloadDigest, originalFilename: filename, uploadedRowCount: prepared.length, initiatedByUserId: session.user.id } }); }
      catch (error) { if (!prismaCode(error, "P2002")) throw error; job = await prisma.importJob.findUnique({ where: { sessionKey: input.sessionKey } }); }
    }
    if (!job) throw new Error("IMPORT_JOB_CREATE_FAILED");
    const rows = await evaluateRows(prepared);
    if (job.status !== "READY") return { success: false, error: "This import session is closed or expired. Upload the file again to start a new import." };
    const counts = summary(rows);
    const candidateRows = rows.filter((row) => row.status === "valid").map((row) => row.rowNumber);
    await prisma.importJob.update({
      where: { id: job.id },
      data: { candidateRows, invalidCount: counts.invalid, duplicateCount: counts.duplicate, skippedCount: counts.invalid + counts.duplicate, batchSize: BATCH_SIZE, totalBatches: Math.ceil(candidateRows.length / BATCH_SIZE) },
    });
    const issueRows = rows.filter((row) => row.status !== "valid");
    return { success: true, rows, summary: summary(rows), token: sign({ kind: "import", version: 2, userId: session.user.id, jobId: job.id, payloadDigest, expiresAt: Date.now() + 30 * 60_000, rows: prepared }), reportToken: makeReportToken(session.user.id, issueRows) };
  } catch (error) {
    return { success: false, error: error instanceof Error && error.message === "IMPORT_SECRET_UNAVAILABLE" ? "Customer imports are temporarily unavailable because secure signing is not configured." : "Unable to validate this import. Please try again." };
  }
}

async function claimReady(jobId: string, leaseToken: string, evaluated: CustomerImportPreviewRow[]) {
  const candidateRows = evaluated.filter((row) => row.status === "valid").map((row) => row.rowNumber);
  const counts = summary(evaluated);
  const now = new Date();
  const result = await prisma.importJob.updateMany({ where: { id: jobId, status: "READY" }, data: { status: "PROCESSING", candidateRows, invalidCount: counts.invalid, duplicateCount: counts.duplicate, skippedCount: counts.invalid + counts.duplicate, batchSize: BATCH_SIZE, totalBatches: Math.ceil(candidateRows.length / BATCH_SIZE), leaseToken, leaseExpiresAt: new Date(now.getTime() + LEASE_MS), startedAt: now, attemptCount: { increment: 1 } } });
  return result.count === 1;
}
async function claimExpired(jobId: string, leaseToken: string) {
  const now = new Date();
  const result = await prisma.importJob.updateMany({ where: { id: jobId, status: "PROCESSING", OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lte: now } }] }, data: { leaseToken, leaseExpiresAt: new Date(now.getTime() + LEASE_MS), attemptCount: { increment: 1 } } });
  return result.count === 1;
}

async function processBatch(jobId: string, leaseToken: string, batchIndex: number, rows: CustomerImportPreviewRow[]) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx) => {
        const job = await tx.importJob.findFirst({ where: { id: jobId, status: "PROCESSING", leaseToken, nextBatchIndex: batchIndex } });
        if (!job) throw new Error("IMPORT_LEASE_LOST");
        const nics = rows.map((row) => row.data.nic);
        const phones = rows.flatMap((row) => [row.data.mobile, row.data.additionalMobile].filter(Boolean));
        const [nicOwners, phoneOwners] = await Promise.all([
          tx.customer.findMany({ where: { nic: { in: nics } }, select: { nic: true } }),
          tx.customerPhone.findMany({ where: customerPhoneOwnershipWhere(phones), select: { normalizedPhone: true } }),
        ]);
        const existingNics = new Set(nicOwners.map((row) => row.nic));
        const existingPhones = new Set(phoneOwners.map((row) => row.normalizedPhone));
        const skipped: CustomerImportPreviewRow[] = [];
        const importable = rows.filter((row) => {
          const issues: CustomerImportIssue[] = [];
          if (existingNics.has(row.data.nic)) issues.push(duplicate("LATE_DUPLICATE_NIC", "nic", "NIC became unavailable before import."));
          if (existingPhones.has(row.data.mobile)) issues.push(duplicate("LATE_DUPLICATE_PRIMARY_MOBILE", "mobile", "Primary Mobile became unavailable before import."));
          if (row.data.additionalMobile && existingPhones.has(row.data.additionalMobile)) issues.push(duplicate("LATE_DUPLICATE_ADDITIONAL_MOBILE", "additionalMobile", "Additional Mobile became unavailable before import."));
          if (issues.length) skipped.push({ ...row, status: "duplicate", issues });
          return !issues.length;
        });
        if (importable.length) await tx.customer.createMany({ data: importable.map((row) => ({ fullName: row.data.fullName, nic: row.data.nic, mobile: row.data.mobile, additionalMobile: row.data.additionalMobile || null, address: row.data.address, area: row.data.area || null, guarantorDetails: row.data.guarantorDetails || null, notes: row.data.notes || null })) });
        const advanced = await tx.importJob.updateMany({ where: { id: jobId, status: "PROCESSING", leaseToken, nextBatchIndex: batchIndex }, data: { importedCount: { increment: importable.length }, duplicateCount: { increment: skipped.length }, skippedCount: { increment: skipped.length }, nextBatchIndex: { increment: 1 }, leaseExpiresAt: new Date(Date.now() + LEASE_MS) } });
        if (advanced.count !== 1) throw new Error("IMPORT_LEASE_LOST");
        return skipped;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if ((prismaCode(error, "P2034") || prismaCode(error, "P2002")) && attempt < 3) continue;
      throw error;
    }
  }
  throw new Error("IMPORT_RETRY_EXHAUSTED");
}

function finalResult(job: { id: string; status: string; uploadedRowCount: number; importedCount: number; invalidCount: number; duplicateCount: number; failedCount: number; failureCode: string | null }, rows: CustomerImportPreviewRow[] = [], reportToken?: string): CustomerImportFinalResult {
  return { success: job.status !== "FAILED" && job.status !== "PROCESSING", inProgress: job.status === "PROCESSING", jobId: job.id, status: job.status, uploaded: job.uploadedRowCount, imported: job.importedCount, invalid: job.invalidCount, duplicate: job.duplicateCount, databaseSkipped: job.failedCount, rows, reportToken, error: job.status === "PROCESSING" ? "This import is already being processed. Review its progress in Import History." : job.status === "FAILED" ? importFailureMessage(job.failureCode, job.importedCount) : job.importedCount === 0 ? "No customers were imported. All rows were invalid or duplicates." : undefined };
}

export async function commitCustomerImport(token: string): Promise<CustomerImportFinalResult> {
  const session = await requireUser();
  await reconcileStaleCustomerImportJobs({ initiatedByUserId: session.user.id });
  const empty = { uploaded: 0, imported: 0, invalid: 0, duplicate: 0, databaseSkipped: 0, rows: [] as CustomerImportPreviewRow[] };
  const payload = verify(token, session.user.id, "import");
  if (!payload || digest(payload.rows) !== payload.payloadDigest) return { success: false, error: "This import session is invalid, altered, or expired.", ...empty };
  let job = await prisma.importJob.findFirst({ where: { id: payload.jobId, initiatedByUserId: session.user.id, module: "CUSTOMERS", payloadDigest: payload.payloadDigest } });
  if (!job) return { success: false, error: "This import job could not be found.", ...empty };
  if (TERMINAL.has(job.status)) return finalResult(job);
  const leaseToken = randomUUID();
  let issueRows: CustomerImportPreviewRow[] = [];
  if (job.status === "READY") {
    const evaluated = await evaluateRows(payload.rows);
    issueRows = evaluated.filter((row) => row.status !== "valid");
    if (!(await claimReady(job.id, leaseToken, evaluated))) return finalResult(await prisma.importJob.findUniqueOrThrow({ where: { id: job.id } }));
  } else if (!(await claimExpired(job.id, leaseToken))) return finalResult(await prisma.importJob.findUniqueOrThrow({ where: { id: job.id } }));
  job = await prisma.importJob.findUniqueOrThrow({ where: { id: job.id } });
  const candidateNumbers = Array.isArray(job.candidateRows) ? job.candidateRows.filter((value): value is number => Number.isInteger(value)) : [];
  const byNumber = new Map(payload.rows.map((row) => [row.rowNumber, row]));
  const candidates = candidateNumbers.map((number) => byNumber.get(number)).filter((row): row is PreparedCustomerImportRow => Boolean(row)).map<CustomerImportPreviewRow>((row) => ({ ...row, issues: [...row.sourceIssues, ...validateCustomerImportData(row.data)], status: "valid" }));
  try {
    for (let index = job.nextBatchIndex; index < job.totalBatches; index += 1) issueRows.push(...await processBatch(job.id, leaseToken, index, candidates.slice(index * job.batchSize, (index + 1) * job.batchSize)));
    const current = await prisma.importJob.findUniqueOrThrow({ where: { id: job.id } });
    const status = deriveFinalImportStatus({ imported: current.importedCount, skipped: current.skippedCount, failed: current.failedCount });
    await prisma.importJob.updateMany({ where: { id: job.id, status: "PROCESSING", leaseToken }, data: { status, completedAt: new Date(), leaseToken: null, leaseExpiresAt: null } });
  } catch (error) {
    const current = await prisma.importJob.findUniqueOrThrow({ where: { id: job.id } });
    const remaining = remainingImportCandidates({ candidateCount: candidateNumbers.length, nextBatchIndex: current.nextBatchIndex, batchSize: current.batchSize });
    const failureCode = prismaCode(error, "P2002") ? "DUPLICATE_CONFLICT" : prismaCode(error, "P2034") ? "SERIALIZATION_RETRY_EXHAUSTED" : "PROCESSING_ERROR";
    await prisma.importJob.updateMany({ where: { id: job.id, status: "PROCESSING", leaseToken }, data: { status: "FAILED", failedCount: { increment: remaining }, failureCode, completedAt: new Date(), leaseToken: null, leaseExpiresAt: null } });
  }
  const finished = await prisma.importJob.findUniqueOrThrow({ where: { id: job.id } });
  issueRows.sort((a, b) => a.rowNumber - b.rowNumber);
  if (finished.importedCount) revalidatePath("/customers");
  return finalResult(finished, issueRows, makeReportToken(session.user.id, issueRows));
}

export async function downloadCustomerImportExcelReport(token: string) {
  const session = await requireUser();
  const payload = verify(token, session.user.id, "report");
  if (!payload) return { success: false as const, error: "This error report has expired. Revalidate the active import to create a new report." };
  const buffer = await buildCustomerImportErrorWorkbook(payload.rows);
  return { success: true as const, filename: "customer-import-errors.xlsx", base64: buffer.toString("base64") };
}
