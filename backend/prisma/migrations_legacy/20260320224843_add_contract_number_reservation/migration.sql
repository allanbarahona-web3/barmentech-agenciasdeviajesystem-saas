-- CreateTable
CREATE TABLE "ContractNumber" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdByEmail" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractNumber_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ContractNumber_number_key" ON "ContractNumber"("number");

-- CreateIndex
CREATE INDEX "ContractNumber_createdAt_idx" ON "ContractNumber"("createdAt");
