
-- Add the optional relationship to existing sale items.
ALTER TABLE "SaleItem"
ADD COLUMN "productBrandId" TEXT;

-- Create the new product-brand options table.
CREATE TABLE "ProductBrand" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "stockQuantity" INTEGER NOT NULL DEFAULT 0,
    "warrantyMonths" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProductBrand_pkey" PRIMARY KEY ("id")
);

-- Create indexes.
CREATE INDEX "ProductBrand_brandId_idx"
ON "ProductBrand"("brandId");

CREATE UNIQUE INDEX "ProductBrand_productId_brandId_key"
ON "ProductBrand"("productId", "brandId");

-- Copy existing product data into the new table.
-- Keep the original Product records and their fields unchanged.
INSERT INTO "ProductBrand" (
    "id",
    "productId",
    "brandId",
    "price",
    "stockQuantity",
    "warrantyMonths",
    "isActive",
    "createdAt",
    "updatedAt"
)
SELECT
    'pb_' || md5(p."id" || ':' || p."brandId"),
    p."id",
    p."brandId",
    p."price",
    p."stockQuantity",
    p."warrantyMonths",
    p."isActive",
    p."createdAt",
    p."updatedAt"
FROM "Product" p;

-- Link existing sale items to their original product-brand options.
UPDATE "SaleItem" si
SET "productBrandId" = pb."id"
FROM "Product" p
JOIN "ProductBrand" pb
    ON pb."productId" = p."id"
    AND pb."brandId" = p."brandId"
WHERE si."productId" = p."id"
  AND si."productBrandId" IS NULL;

-- Add foreign-key constraints after the data has been copied.
ALTER TABLE "ProductBrand"
ADD CONSTRAINT "ProductBrand_productId_fkey"
FOREIGN KEY ("productId")
REFERENCES "Product"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProductBrand"
ADD CONSTRAINT "ProductBrand_brandId_fkey"
FOREIGN KEY ("brandId")
REFERENCES "Brand"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SaleItem"
ADD CONSTRAINT "SaleItem_productBrandId_fkey"
FOREIGN KEY ("productBrandId")
REFERENCES "ProductBrand"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
