BEGIN;

-- CreateEnum
CREATE TYPE "TravelPackageParticipantRole" AS ENUM (
    'HOLDER',
    'COMPANION',
    'MINOR'
);

-- CreateTable
CREATE TABLE "travel_package_participants" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "travelPackageId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "role" "TravelPackageParticipantRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "travel_package_participants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "travel_package_participants_travelPackageId_clientId_key"
ON "travel_package_participants"("travelPackageId", "clientId");

-- CreateIndex
CREATE INDEX "travel_package_participants_tenantId_idx"
ON "travel_package_participants"("tenantId");

-- CreateIndex
CREATE INDEX "travel_package_participants_travelPackageId_idx"
ON "travel_package_participants"("travelPackageId");

-- CreateIndex
CREATE INDEX "travel_package_participants_clientId_idx"
ON "travel_package_participants"("clientId");

-- CreateIndex
CREATE INDEX "travel_package_participants_role_idx"
ON "travel_package_participants"("role");

-- AddForeignKey
ALTER TABLE "travel_package_participants"
ADD CONSTRAINT "travel_package_participants_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "travel_package_participants"
ADD CONSTRAINT "travel_package_participants_travelPackageId_fkey"
FOREIGN KEY ("travelPackageId") REFERENCES "TravelPackage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "travel_package_participants"
ADD CONSTRAINT "travel_package_participants_clientId_fkey"
FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill reservations that have already crossed the approval boundary.
-- Contract JSON remains the legal snapshot; these rows become the operational source.
CREATE TEMPORARY TABLE "_travel_package_participant_backfill" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "travelPackageId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "role" "TravelPackageParticipantRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL
) ON COMMIT DROP;

-- Fail instead of creating cross-tenant operational membership.
DO $$
DECLARE
    conflict_count INTEGER;
BEGIN
    SELECT COUNT(*)
    INTO conflict_count
    FROM "Contract" AS contract
    JOIN "TravelPackage" AS package
      ON package."id" = contract."travelPackageId"
    JOIN "Client" AS holder
      ON holder."id" = contract."clientId"
    WHERE contract."travelPackageId" IS NOT NULL
      AND contract."status" IN ('PENDING_SIGNATURE', 'SIGNING_SENT', 'VIEWED', 'SIGNED')
      AND (
        package."tenantId" <> contract."tenantId"
        OR holder."tenantId" <> contract."tenantId"
      );

    IF conflict_count > 0 THEN
        RAISE EXCEPTION
          'TravelPackageParticipant backfill requires manual remediation: % approved contract(s) have cross-tenant holder or package references.',
          conflict_count;
    END IF;
END $$;

INSERT INTO "_travel_package_participant_backfill"
SELECT
    'legacy-holder-' || contract."id",
    contract."tenantId",
    contract."travelPackageId",
    contract."clientId",
    'HOLDER'::"TravelPackageParticipantRole",
    contract."createdAt",
    CURRENT_TIMESTAMP
FROM "Contract" AS contract
WHERE contract."travelPackageId" IS NOT NULL
  AND contract."status" IN ('PENDING_SIGNATURE', 'SIGNING_SENT', 'VIEWED', 'SIGNED');

-- Every valid historical companion must already carry its authoritative Client ID.
DO $$
DECLARE
    unresolved_count INTEGER;
BEGIN
    SELECT COUNT(*)
    INTO unresolved_count
    FROM "Contract" AS contract
    CROSS JOIN LATERAL jsonb_array_elements(
        CASE
            WHEN jsonb_typeof(contract."payload"->'companions') = 'array'
            THEN contract."payload"->'companions'
            ELSE '[]'::jsonb
        END
    ) AS companion(value)
    LEFT JOIN "Client" AS client
      ON client."id" = NULLIF(BTRIM(companion.value->>'selectedCustomerId'), '')
     AND client."tenantId" = contract."tenantId"
    WHERE contract."travelPackageId" IS NOT NULL
      AND contract."status" IN ('PENDING_SIGNATURE', 'SIGNING_SENT', 'VIEWED', 'SIGNED')
      AND NULLIF(BTRIM(companion.value->>'fullName'), '') IS NOT NULL
      AND NULLIF(BTRIM(companion.value->>'idNumber'), '') IS NOT NULL
      AND client."id" IS NULL;

    IF unresolved_count > 0 THEN
        RAISE EXCEPTION
          'TravelPackageParticipant backfill requires manual remediation: % historical companion(s) have a missing or invalid selectedCustomerId.',
          unresolved_count;
    END IF;
END $$;

INSERT INTO "_travel_package_participant_backfill"
SELECT
    'legacy-companion-' || contract."id" || '-' || companion.ordinality,
    contract."tenantId",
    contract."travelPackageId",
    client."id",
    'COMPANION'::"TravelPackageParticipantRole",
    contract."createdAt",
    CURRENT_TIMESTAMP
FROM "Contract" AS contract
CROSS JOIN LATERAL jsonb_array_elements(
    CASE
        WHEN jsonb_typeof(contract."payload"->'companions') = 'array'
        THEN contract."payload"->'companions'
        ELSE '[]'::jsonb
    END
) WITH ORDINALITY AS companion(value, ordinality)
JOIN "Client" AS client
  ON client."id" = NULLIF(BTRIM(companion.value->>'selectedCustomerId'), '')
 AND client."tenantId" = contract."tenantId"
WHERE contract."travelPackageId" IS NOT NULL
  AND contract."status" IN ('PENDING_SIGNATURE', 'SIGNING_SENT', 'VIEWED', 'SIGNED')
  AND NULLIF(BTRIM(companion.value->>'fullName'), '') IS NOT NULL
  AND NULLIF(BTRIM(companion.value->>'idNumber'), '') IS NOT NULL;

-- Historical minors may be resolved only by the tenant-scoped unique
-- identification rule. Missing matches abort the whole migration.
DO $$
DECLARE
    unresolved_count INTEGER;
BEGIN
    SELECT COUNT(*)
    INTO unresolved_count
    FROM "Contract" AS contract
    CROSS JOIN LATERAL jsonb_array_elements(
        CASE
            WHEN jsonb_typeof(contract."payload"->'minors') = 'array'
            THEN contract."payload"->'minors'
            ELSE '[]'::jsonb
        END
    ) AS minor(value)
    LEFT JOIN LATERAL (
        SELECT candidate."id"
        FROM "Client" AS candidate
        WHERE candidate."tenantId" = contract."tenantId"
          AND (
            (
              NULLIF(BTRIM(minor.value->>'selectedCustomerId'), '') IS NOT NULL
              AND candidate."id" = NULLIF(BTRIM(minor.value->>'selectedCustomerId'), '')
            )
            OR
            (
              NULLIF(BTRIM(minor.value->>'selectedCustomerId'), '') IS NULL
              AND candidate."idNumber" = COALESCE(
                  NULLIF(BTRIM(minor.value->>'minorId'), ''),
                  NULLIF(BTRIM(minor.value->>'idNumber'), '')
              )
            )
          )
    ) AS client ON TRUE
    WHERE contract."travelPackageId" IS NOT NULL
      AND contract."status" IN ('PENDING_SIGNATURE', 'SIGNING_SENT', 'VIEWED', 'SIGNED')
      AND COALESCE(
          NULLIF(BTRIM(minor.value->>'minorId'), ''),
          NULLIF(BTRIM(minor.value->>'idNumber'), '')
      ) IS NOT NULL
      AND client."id" IS NULL;

    IF unresolved_count > 0 THEN
        RAISE EXCEPTION
          'TravelPackageParticipant backfill requires manual remediation: % historical minor(s) cannot be resolved by tenant and unique identification.',
          unresolved_count;
    END IF;
END $$;

INSERT INTO "_travel_package_participant_backfill"
SELECT
    'legacy-minor-' || contract."id" || '-' || minor.ordinality,
    contract."tenantId",
    contract."travelPackageId",
    client."id",
    'MINOR'::"TravelPackageParticipantRole",
    contract."createdAt",
    CURRENT_TIMESTAMP
FROM "Contract" AS contract
CROSS JOIN LATERAL jsonb_array_elements(
    CASE
        WHEN jsonb_typeof(contract."payload"->'minors') = 'array'
        THEN contract."payload"->'minors'
        ELSE '[]'::jsonb
    END
) WITH ORDINALITY AS minor(value, ordinality)
JOIN LATERAL (
    SELECT candidate."id"
    FROM "Client" AS candidate
    WHERE candidate."tenantId" = contract."tenantId"
      AND (
        (
          NULLIF(BTRIM(minor.value->>'selectedCustomerId'), '') IS NOT NULL
          AND candidate."id" = NULLIF(BTRIM(minor.value->>'selectedCustomerId'), '')
        )
        OR
        (
          NULLIF(BTRIM(minor.value->>'selectedCustomerId'), '') IS NULL
          AND candidate."idNumber" = COALESCE(
              NULLIF(BTRIM(minor.value->>'minorId'), ''),
              NULLIF(BTRIM(minor.value->>'idNumber'), '')
          )
        )
      )
) AS client ON TRUE
WHERE contract."travelPackageId" IS NOT NULL
  AND contract."status" IN ('PENDING_SIGNATURE', 'SIGNING_SENT', 'VIEWED', 'SIGNED')
  AND COALESCE(
      NULLIF(BTRIM(minor.value->>'minorId'), ''),
      NULLIF(BTRIM(minor.value->>'idNumber'), '')
  ) IS NOT NULL;

-- Duplicate membership across contracts or roles is a data conflict. Do not
-- choose one role and do not silently discard any participant.
DO $$
DECLARE
    conflict_count INTEGER;
BEGIN
    SELECT COUNT(*)
    INTO conflict_count
    FROM (
        SELECT "travelPackageId", "clientId"
        FROM "_travel_package_participant_backfill"
        GROUP BY "travelPackageId", "clientId"
        HAVING COUNT(*) > 1
    ) AS conflicts;

    IF conflict_count > 0 THEN
        RAISE EXCEPTION
          'TravelPackageParticipant backfill requires manual remediation: % duplicate TravelPackage/Client membership conflict(s) were found.',
          conflict_count;
    END IF;
END $$;

INSERT INTO "travel_package_participants" (
    "id",
    "tenantId",
    "travelPackageId",
    "clientId",
    "role",
    "createdAt",
    "updatedAt"
)
SELECT
    "id",
    "tenantId",
    "travelPackageId",
    "clientId",
    "role",
    "createdAt",
    "updatedAt"
FROM "_travel_package_participant_backfill";

COMMIT;
