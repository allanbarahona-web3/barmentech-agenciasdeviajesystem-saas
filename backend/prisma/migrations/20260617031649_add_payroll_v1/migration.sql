-- CreateEnum
CREATE TYPE "PayrollFrequency" AS ENUM ('WEEKLY', 'BIWEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "PayrollPeriodStatus" AS ENUM ('DRAFT', 'CALCULATED', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PayrollAdjustmentType" AS ENUM ('BONUS', 'COMMISSION', 'OTHER_EARNING', 'EMBARGO', 'VOUCHER', 'OTHER_DEDUCTION');

-- CreateEnum
CREATE TYPE "PayrollRunStatus" AS ENUM ('CALCULATED', 'PAID', 'CANCELLED');

-- CreateTable
CREATE TABLE "payroll_config" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "frequency" "PayrollFrequency" NOT NULL DEFAULT 'BIWEEKLY',
    "otMultiplier" DECIMAL(5,2) NOT NULL DEFAULT 1.5,
    "employeeCCSSRate" DECIMAL(5,2) NOT NULL,
    "employerCCSSRate" DECIMAL(5,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_periods" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "paymentDate" TIMESTAMP(3) NOT NULL,
    "status" "PayrollPeriodStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_adjustments" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "payrollPeriodId" TEXT NOT NULL,
    "type" "PayrollAdjustmentType" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_runs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "payrollPeriodId" TEXT NOT NULL,
    "baseSalary" DECIMAL(12,2) NOT NULL,
    "otMinutes" INTEGER NOT NULL DEFAULT 0,
    "otAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "attendanceDeductionMinutes" INTEGER NOT NULL DEFAULT 0,
    "attendanceDeductionAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "earningsAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "grossAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "ccssAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "deductionsAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "netAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" "PayrollRunStatus" NOT NULL DEFAULT 'CALCULATED',
    "calculatedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "approvedByUserId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payroll_config_tenantId_key" ON "payroll_config"("tenantId");

-- CreateIndex
CREATE INDEX "payroll_config_tenantId_idx" ON "payroll_config"("tenantId");

-- CreateIndex
CREATE INDEX "payroll_periods_tenantId_idx" ON "payroll_periods"("tenantId");

-- CreateIndex
CREATE INDEX "payroll_periods_status_idx" ON "payroll_periods"("status");

-- CreateIndex
CREATE INDEX "payroll_periods_startDate_endDate_idx" ON "payroll_periods"("startDate", "endDate");

-- CreateIndex
CREATE INDEX "payroll_adjustments_tenantId_idx" ON "payroll_adjustments"("tenantId");

-- CreateIndex
CREATE INDEX "payroll_adjustments_employeeId_idx" ON "payroll_adjustments"("employeeId");

-- CreateIndex
CREATE INDEX "payroll_adjustments_payrollPeriodId_idx" ON "payroll_adjustments"("payrollPeriodId");

-- CreateIndex
CREATE INDEX "payroll_runs_tenantId_idx" ON "payroll_runs"("tenantId");

-- CreateIndex
CREATE INDEX "payroll_runs_employeeId_idx" ON "payroll_runs"("employeeId");

-- CreateIndex
CREATE INDEX "payroll_runs_payrollPeriodId_idx" ON "payroll_runs"("payrollPeriodId");

-- CreateIndex
CREATE INDEX "payroll_runs_status_idx" ON "payroll_runs"("status");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_runs_employeeId_payrollPeriodId_key" ON "payroll_runs"("employeeId", "payrollPeriodId");

-- AddForeignKey
ALTER TABLE "payroll_config" ADD CONSTRAINT "payroll_config_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_periods" ADD CONSTRAINT "payroll_periods_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_adjustments" ADD CONSTRAINT "payroll_adjustments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_adjustments" ADD CONSTRAINT "payroll_adjustments_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_adjustments" ADD CONSTRAINT "payroll_adjustments_payrollPeriodId_fkey" FOREIGN KEY ("payrollPeriodId") REFERENCES "payroll_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_payrollPeriodId_fkey" FOREIGN KEY ("payrollPeriodId") REFERENCES "payroll_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;
