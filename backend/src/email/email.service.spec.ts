import type { ConfigService } from "@nestjs/config";
import { EmailService } from "./email.service";
import type { PrismaService } from "../prisma/prisma.service";

describe("EmailService provider idempotency", () => {
  it("passes the stable trusted key through Resend without changing delivery behavior", async () => {
    const send = jest.fn().mockResolvedValue({ data: { id: "message-a" } });
    const tenant = { id: "tenant-a", name: "Tenant", fromEmail: "billing@example.com", replyToEmail: null, emailVerified: true, logoUrl: null, emailLogoUrl: null, emailQuotaDaily: 100, emailQuotaMonthly: 1000, emailsSentToday: 0, emailsSentMonth: 0, lastEmailResetDate: new Date(), contactPhone: null, contactWhatsApp: null, contactEmail: null, businessAddress: null, websiteUrl: null, primaryColor: null, secondaryColor: null };
    const prisma = { tenant: { findUnique: jest.fn().mockResolvedValue(tenant), update: jest.fn().mockResolvedValue(tenant) } } as unknown as PrismaService;
    const config = { get: jest.fn((key: string, fallback: unknown) => key === "RESEND_API_KEY" ? "test-key" : fallback) } as unknown as ConfigService;
    const service = new EmailService(config, prisma);
    (service as unknown as { resend: { emails: { send: jest.Mock } } }).resend = { emails: { send } };
    const result = await service.sendEmail({ tenantId: "tenant-a", to: "receiver@example.com", subject: "Invoice", template: "business-document-attachment", templateData: { recipientName: "Receiver", documentLabel: "Invoice", documentNumber: "1", message: "Attached" }, idempotencyKey: "fiscal-invoice-auto:tenant-a:document-a:v1" });
    expect(result).toEqual({ success: true, emailId: "message-a" });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ to: ["receiver@example.com"] }), { idempotencyKey: "fiscal-invoice-auto:tenant-a:document-a:v1" });
  });
});
