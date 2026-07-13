-- CreateTable
CREATE TABLE "contract_notes" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "passengerType" TEXT NOT NULL,
    "passengerIndex" INTEGER,
    "passengerName" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "archivedAt" TIMESTAMP(3),
    "createdByUserId" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "contract_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contract_notes_contractId_idx" ON "contract_notes"("contractId");

-- CreateIndex
CREATE INDEX "contract_notes_tenantId_idx" ON "contract_notes"("tenantId");

-- CreateIndex
CREATE INDEX "contract_notes_status_idx" ON "contract_notes"("status");

-- CreateIndex
CREATE INDEX "contract_notes_createdAt_idx" ON "contract_notes"("createdAt");

-- AddForeignKey
ALTER TABLE "contract_notes" ADD CONSTRAINT "contract_notes_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_notes" ADD CONSTRAINT "contract_notes_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
