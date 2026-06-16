-- CreateTable: TravelPackage
CREATE TABLE "TravelPackage" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "departureDate" TIMESTAMP(3) NOT NULL,
    "returnDate" TIMESTAMP(3) NOT NULL,
    "capacity" INTEGER NOT NULL,
    "occupiedSlots" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "packagePrice" DECIMAL(14,2),
    "priceCurrency" TEXT NOT NULL DEFAULT 'USD',
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TravelPackage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TravelPackage_departureDate_idx" ON "TravelPackage"("departureDate");

-- CreateIndex
CREATE INDEX "TravelPackage_status_idx" ON "TravelPackage"("status");

-- CreateIndex
CREATE INDEX "TravelPackage_createdAt_idx" ON "TravelPackage"("createdAt");

-- AlterTable: Contract - Agregar columnas para viajes programados
ALTER TABLE "Contract" ADD COLUMN "contractType" TEXT NOT NULL DEFAULT 'CUSTOM';
ALTER TABLE "Contract" ADD COLUMN "travelPackageId" TEXT;
ALTER TABLE "Contract" ADD COLUMN "participantCount" INTEGER NOT NULL DEFAULT 1;

-- CreateIndex
CREATE INDEX "Contract_travelPackageId_idx" ON "Contract"("travelPackageId");

-- CreateIndex
CREATE INDEX "Contract_contractType_idx" ON "Contract"("contractType");

-- AddForeignKey: Contract -> TravelPackage
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_travelPackageId_fkey" 
    FOREIGN KEY ("travelPackageId") REFERENCES "TravelPackage"("id") 
    ON DELETE SET NULL ON UPDATE CASCADE;
