-- AlterTable
ALTER TABLE "sales_order_lines" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "sales_orders" ALTER COLUMN "updatedAt" DROP DEFAULT;
