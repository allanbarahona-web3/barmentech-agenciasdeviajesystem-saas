import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { isEmail } from "class-validator";
import { randomUUID } from "node:crypto";
import { DocumentPdfService } from "../documents/document-pdf.service";
import { EmailService } from "../email/email.service";
import { PrismaService } from "../prisma/prisma.service";
import { TenantService } from "../tenant/tenant.service";
import { FINANCE_AUDIT_ACTIONS, FINANCE_AUDIT_ENTITY_TYPES, financeAuditRecord } from "./finance-audit";
import { allocationStatusLabel, paymentMethodLabel, paymentReceiptTemplate, paymentStatusLabel, type PaymentReceipt } from "./payment-receipt.template";

@Injectable()
export class PaymentReceiptService {
  constructor(private readonly prisma: PrismaService, private readonly pdf: DocumentPdfService, private readonly email: EmailService, private readonly tenants: TenantService) {}

  async get(tenantId: string, paymentId: string): Promise<PaymentReceipt> {
    const payment = await this.prisma.payment.findFirst({ where: { id: paymentId, tenantId }, include: { allocations: { orderBy: [{ allocatedAt: "asc" }, { id: "asc" }], include: { accountReceivable: { select: { sourceNumber: true, sourceId: true } } } } } });
    if (!payment) throw new NotFoundException("PAYMENT_NOT_FOUND");
    const customer = payment.customerId ? await this.prisma.client.findFirst({ where: { id: payment.customerId, tenantId }, select: { fullName: true, idNumber: true, email: true } }) : null;
    const applied = payment.allocations.filter((allocation) => allocation.status === "ACTIVE").reduce((total, allocation) => total.plus(allocation.amount), new Prisma.Decimal(0));
    const money = (value: Prisma.Decimal) => value.toFixed(Math.max(2, value.decimalPlaces()));
    const registered = await this.prisma.billingAuditLog.findFirst({ where: { tenantId, entityType: FINANCE_AUDIT_ENTITY_TYPES.PAYMENT, entityId: payment.id, action: FINANCE_AUDIT_ACTIONS.REGISTERED }, orderBy: { createdAt: "asc" }, select: { actorName: true } });
    return { receiptNumber: payment.receiptNumber, customer: { name: customer?.fullName ?? payment.payerDisplayName, identification: customer?.idNumber ?? payment.payerIdentificationNumber, email: customer?.email ?? null }, currencyCode: payment.currencyCode, receivedAmount: money(payment.receivedAmount), appliedAmount: money(applied), availableAmount: money(payment.availableAmount), receivedAt: payment.receivedAt, paymentMethodLabel: paymentMethodLabel(payment.paymentMethod), externalReference: payment.externalReference, description: payment.description, statusLabel: paymentStatusLabel(payment.status), registeredBy: registered?.actorName ?? null, allocations: payment.allocations.map((allocation) => ({ sourceNumber: allocation.accountReceivable.sourceNumber ?? allocation.accountReceivable.sourceId, amount: money(allocation.amount), statusLabel: allocationStatusLabel(allocation.status), allocatedAt: allocation.allocatedAt })) };
  }

  async render(tenantId: string, paymentId: string) {
    const [receipt, tenant, billing] = await Promise.all([this.get(tenantId, paymentId), this.tenants.getTenantConfig(tenantId), this.prisma.tenantBillingConfiguration.findUnique({ where: { tenantId }, select: { fiscalTimezone: true } })]);
    const { pdfBuffer } = await this.pdf.renderDocumentToBuffer(paymentReceiptTemplate(receipt, { name: tenant.name ?? "Empresa", logoUrl: tenant.logoUrl, contactEmail: tenant.contactEmail, contactPhone: tenant.contactPhone, primaryColor: tenant.primaryColor, secondaryColor: tenant.secondaryColor }, billing?.fiscalTimezone ?? "America/Costa_Rica"));
    return { receipt, pdfBuffer, fileName: `recibo-${receipt.receiptNumber}.pdf` };
  }

  async send(tenantId: string, actor: { userId: string; email: string; fullName: string }, paymentId: string, to?: string, cc?: string) {
    const rendered = await this.render(tenantId, paymentId); const recipient = to?.trim() || rendered.receipt.customer.email?.trim();
    if (!recipient || !isEmail(recipient)) throw new BadRequestException("PAYMENT_RECEIPT_EMAIL_INVALID");
    if (cc && !isEmail(cc)) throw new BadRequestException("PAYMENT_RECEIPT_CC_INVALID");
    const result = await this.email.sendEmail({ tenantId, to: recipient, ...(cc ? { cc } : {}), subject: `Recibo de dinero ${rendered.receipt.receiptNumber}`, template: "business-document-attachment", templateData: { recipientName: rendered.receipt.customer.name, documentLabel: "Recibo de dinero", documentNumber: rendered.receipt.receiptNumber, message: "Adjuntamos su recibo de dinero con el detalle actualizado del pago y sus aplicaciones.", attachmentSummary: "El recibo se encuentra adjunto en formato PDF." }, attachments: [{ filename: rendered.fileName, content: rendered.pdfBuffer.toString("base64"), contentType: "application/pdf" }], idempotencyKey: `finance-payment-receipt:${tenantId}:${paymentId}:${randomUUID()}`, triggeredBy: actor });
    if (!result.success) throw new BadRequestException("PAYMENT_RECEIPT_EMAIL_FAILED");
    await this.prisma.billingAuditLog.create({ data: financeAuditRecord({ tenantId, entityType: FINANCE_AUDIT_ENTITY_TYPES.PAYMENT, entityId: paymentId, action: FINANCE_AUDIT_ACTIONS.RECEIPT_SENT, actor: { userId: actor.userId, name: actor.fullName }, occurredAt: new Date(), afterJson: { receiptNumber: rendered.receipt.receiptNumber, recipient, cc: cc ?? null, emailId: result.emailId ?? null } }) });
    return { ok: true, sentTo: recipient, cc: cc ?? null, emailId: result.emailId ?? null };
  }
}
