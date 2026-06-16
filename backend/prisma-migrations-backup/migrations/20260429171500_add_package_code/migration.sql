-- AlterTable: TravelPackage - Agregar código único automático
ALTER TABLE "TravelPackage" ADD COLUMN "packageCode" TEXT;

-- CreateIndex: packageCode debe ser único
CREATE UNIQUE INDEX "TravelPackage_packageCode_key" ON "TravelPackage"("packageCode");

-- CreateIndex: índice para búsquedas rápidas por código
CREATE INDEX "TravelPackage_packageCode_idx" ON "TravelPackage"("packageCode");
