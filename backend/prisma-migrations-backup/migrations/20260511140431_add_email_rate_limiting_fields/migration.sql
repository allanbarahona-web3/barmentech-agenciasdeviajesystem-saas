-- AlterTable
ALTER TABLE "tenants" ADD COLUMN "email_quota_daily" INTEGER NOT NULL DEFAULT 1000;
ALTER TABLE "tenants" ADD COLUMN "email_quota_monthly" INTEGER NOT NULL DEFAULT 30000;
ALTER TABLE "tenants" ADD COLUMN "emails_sent_today" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "tenants" ADD COLUMN "emails_sent_month" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "tenants" ADD COLUMN "last_email_reset_date" TIMESTAMP(3);
