-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME', 'TEMPORARY', 'CONTRACTOR');

-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "employmentType" "EmploymentType" NOT NULL DEFAULT 'FULL_TIME';
