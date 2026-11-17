-- Customer phone ownership registry.
--
-- Customer.mobile and Customer.additionalMobile remain the compatibility
-- source columns. A trigger synchronizes every legacy and current write into
-- this registry, whose global unique index is authoritative for ownership.

BEGIN;

CREATE TYPE "public"."CustomerPhoneType" AS ENUM ('PRIMARY', 'ADDITIONAL');

CREATE TABLE "public"."CustomerPhone" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "type" "public"."CustomerPhoneType" NOT NULL,
    "normalizedPhone" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerPhone_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CustomerPhone_normalizedPhone_key"
    ON "public"."CustomerPhone"("normalizedPhone");

CREATE UNIQUE INDEX "CustomerPhone_customerId_type_key"
    ON "public"."CustomerPhone"("customerId", "type");

ALTER TABLE "public"."CustomerPhone"
    ADD CONSTRAINT "CustomerPhone_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "public"."Customer"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Block Customer writes until both the trigger and complete backfill are in
-- place. Waiting writers resume only after the migration transaction commits.
LOCK TABLE "public"."Customer" IN SHARE ROW EXCLUSIVE MODE;

CREATE OR REPLACE FUNCTION "public"."sync_customer_phone_registry"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
    DELETE FROM "public"."CustomerPhone" WHERE "customerId" = NEW."id";

    INSERT INTO "public"."CustomerPhone" (
        "id", "customerId", "type", "normalizedPhone", "createdAt", "updatedAt"
    ) VALUES (
        'cph_' || md5(NEW."id" || ':PRIMARY:' || clock_timestamp()::text || random()::text),
        NEW."id",
        'PRIMARY',
        btrim(NEW."mobile"),
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
    );

    IF NULLIF(btrim(NEW."additionalMobile"), '') IS NOT NULL THEN
        INSERT INTO "public"."CustomerPhone" (
            "id", "customerId", "type", "normalizedPhone", "createdAt", "updatedAt"
        ) VALUES (
            'cph_' || md5(NEW."id" || ':ADDITIONAL:' || clock_timestamp()::text || random()::text),
            NEW."id",
            'ADDITIONAL',
            btrim(NEW."additionalMobile"),
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP
        );
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "Customer_phone_registry_sync"
AFTER INSERT OR UPDATE OF "mobile", "additionalMobile"
ON "public"."Customer"
FOR EACH ROW
EXECUTE FUNCTION "public"."sync_customer_phone_registry"();

-- Preserve every existing ownership value, including invalid development
-- values. Any collision aborts the complete migration through the unique
-- index; no value is silently discarded.
INSERT INTO "public"."CustomerPhone" (
    "id", "customerId", "type", "normalizedPhone", "createdAt", "updatedAt"
)
SELECT
    'cph_' || md5(c."id" || ':PRIMARY'),
    c."id",
    'PRIMARY',
    btrim(c."mobile"),
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "public"."Customer" c;

INSERT INTO "public"."CustomerPhone" (
    "id", "customerId", "type", "normalizedPhone", "createdAt", "updatedAt"
)
SELECT
    'cph_' || md5(c."id" || ':ADDITIONAL'),
    c."id",
    'ADDITIONAL',
    btrim(c."additionalMobile"),
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "public"."Customer" c
WHERE NULLIF(btrim(c."additionalMobile"), '') IS NOT NULL;

-- Existing invalid development values remain registered. PostgreSQL enforces
-- the current application formats for every newly inserted/synchronized row.
ALTER TABLE "public"."CustomerPhone"
    ADD CONSTRAINT "CustomerPhone_format_check"
    CHECK (
        ("type" = 'PRIMARY' AND
            "normalizedPhone" ~ '^(070|071|072|074|075|076|077|078)[0-9]{7}$')
        OR
        ("type" = 'ADDITIONAL' AND
            "normalizedPhone" ~ '^[0-9]{10,15}$' AND
            (length("normalizedPhone") > 10 OR
                "normalizedPhone" ~ '^(070|071|072|074|075|076|077|078)[0-9]{7}$'))
    ) NOT VALID;

-- Abort rather than commit an incomplete backfill.
DO $$
DECLARE
    expected_count BIGINT;
    actual_count BIGINT;
BEGIN
    SELECT count(*) + count("additionalMobile") FILTER (
        WHERE NULLIF(btrim("additionalMobile"), '') IS NOT NULL
    ) INTO expected_count
    FROM "public"."Customer";

    SELECT count(*) INTO actual_count FROM "public"."CustomerPhone";

    IF actual_count <> expected_count THEN
        RAISE EXCEPTION
            'CustomerPhone backfill count mismatch: expected %, found %',
            expected_count,
            actual_count;
    END IF;
END;
$$;

COMMIT;
