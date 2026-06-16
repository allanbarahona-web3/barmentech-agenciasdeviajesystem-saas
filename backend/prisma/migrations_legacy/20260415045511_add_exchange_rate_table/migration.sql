-- CreateTable
CREATE TABLE "ExchangeRate" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "buyRate" DECIMAL(10,4) NOT NULL,
    "sellRate" DECIMAL(10,4) NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "setByUserId" TEXT NOT NULL,
    "setByName" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExchangeRate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExchangeRate_date_idx" ON "ExchangeRate"("date");

-- CreateIndex
CREATE INDEX "ExchangeRate_setByUserId_idx" ON "ExchangeRate"("setByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "ExchangeRate_date_key" ON "ExchangeRate"("date");
