-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "notes" TEXT;

-- CreateTable
CREATE TABLE "SaleCustomerSnapshot" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "nic" TEXT NOT NULL,
    "mobile" TEXT NOT NULL,
    "additionalMobile" TEXT,
    "address" TEXT NOT NULL,
    "area" TEXT,
    "guarantorDetails" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SaleCustomerSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SaleCustomerSnapshot_saleId_key" ON "SaleCustomerSnapshot"("saleId");

-- AddForeignKey
ALTER TABLE "SaleCustomerSnapshot" ADD CONSTRAINT "SaleCustomerSnapshot_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;
