ALTER TABLE "Client"
ALTER COLUMN "email" DROP NOT NULL;

DROP INDEX "Client_idNumber_tenantId_key";

CREATE UNIQUE INDEX "Client_tenantId_idType_idNumber_key"
ON "Client"("tenantId", "idType", "idNumber");
