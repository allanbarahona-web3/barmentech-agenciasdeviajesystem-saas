-- AlterTable
ALTER TABLE "Client"
ALTER COLUMN "dateOfBirth" TYPE DATE
USING "dateOfBirth"::date;
