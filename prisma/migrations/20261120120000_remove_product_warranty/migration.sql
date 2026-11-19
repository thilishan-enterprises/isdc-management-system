/*
  Warnings:

  - The `warrantyMonths` column on `Product` will be dropped. Any values in it will be permanently deleted.
  - The `warrantyMonths` column on `ProductBrand` will be dropped. Any values in it will be permanently deleted.
*/
BEGIN;

ALTER TABLE "Product" DROP COLUMN "warrantyMonths";
ALTER TABLE "ProductBrand" DROP COLUMN "warrantyMonths";

COMMIT;
