-- CreateEnum
CREATE TYPE "ImportModule" AS ENUM ('CUSTOMERS');

-- CreateEnum
CREATE TYPE "ImportJobStatus" AS ENUM ('READY', 'PROCESSING', 'COMPLETED', 'PARTIAL', 'NO_CHANGES', 'FAILED');

-- CreateTable
CREATE TABLE "ImportJob" (
    "id" TEXT NOT NULL,
    "sessionKey" VARCHAR(64) NOT NULL,
    "module" "ImportModule" NOT NULL,
    "payloadDigest" VARCHAR(64) NOT NULL,
    "originalFilename" VARCHAR(255) NOT NULL,
    "uploadedRowCount" INTEGER NOT NULL,
    "importedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "invalidCount" INTEGER NOT NULL DEFAULT 0,
    "duplicateCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "status" "ImportJobStatus" NOT NULL DEFAULT 'READY',
    "batchSize" INTEGER NOT NULL DEFAULT 100,
    "totalBatches" INTEGER NOT NULL DEFAULT 0,
    "nextBatchIndex" INTEGER NOT NULL DEFAULT 0,
    "candidateRows" JSONB,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "leaseToken" VARCHAR(64),
    "leaseExpiresAt" TIMESTAMP(3),
    "failureCode" VARCHAR(100),
    "initiatedByUserId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ImportJob_sessionKey_key" ON "ImportJob"("sessionKey");

-- CreateIndex
CREATE INDEX "ImportJob_module_createdAt_idx" ON "ImportJob"("module", "createdAt");

-- CreateIndex
CREATE INDEX "ImportJob_initiatedByUserId_createdAt_idx" ON "ImportJob"("initiatedByUserId", "createdAt");

-- CreateIndex
CREATE INDEX "ImportJob_status_leaseExpiresAt_idx" ON "ImportJob"("status", "leaseExpiresAt");

-- AddForeignKey
ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_initiatedByUserId_fkey" FOREIGN KEY ("initiatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
