import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PaymentStatus, Prisma } from "@prisma/client";
import { isEmail } from "class-validator";
import { randomUUID } from "node:crypto";
import { DocumentPdfService } from "../documents/document-pdf.service";
import { EmailService } from "../email/email.service";
import { PrismaService } from "../prisma/prisma.service";
import { TenantService } from "../tenant/tenant.service";
import { FINANCE_AUDIT_ACTIONS, FINANCE_AUDIT_ENTITY_TYPES, financeAuditRecord } from "./finance-audit";
import { allocationStatusLabel, paymentMethodLabel, paymentReceiptTemplate, paymentStatusLabel, type PaymentReceipt } from "./payment-receipt.template";
import { hasAvailablePaymentReceipt, loadPaymentApplicationContractLabels, normalizePaymentApplications, paymentApplicationSelect } from "./payment-application-read-model";

@Injectable()
export class PaymentReceiptService {
  constructor(private readonly prisma: PrismaService, private readonly pdf: DocumentPdfService, private readonly email: EmailService, private readonly tenants: TenantService) {}

  async get(tenantId: string, paymentId: string): Promise<PaymentReceipt> {
    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, tenantId },
      select: { id: true, customerId: true, receiptNumber: true, payerDisplayName: true, payerIdentificationNumber: true, currencyCode: true, receivedAmount: true, availableAmount: true, settlementCurrencyCode: true, settlementAmount: true, settlementAvailableAmount: true, settlementExchangeRate: true, settlementExchangeRateSource: true, settlementExchangeRateEffectiveDate: true, receivedAt: true, paymentMethod: true, externalReference: true, description: true, status: true, ...paymentApplicationSelect },
    });
    if (!payment) throw new NotFoundException("PAYMENT_NOT_FOUND");
    const receiptNumber = eligibleReceiptNumber(payment.status, payment.receiptNumber);
    const [customer, contractById, registered] = await Promise.all([
      payment.customerId ? this.prisma.client.findFirst({ where: { id: payment.customerId, tenantId }, select: { fullName: true, idNumber: true, email: true } }) : null,
      loadPaymentApplicationContractLabels(this.prisma, tenantId, [payment]),
      this.prisma.billingAuditLog.findFirst({ where: { tenantId, entityType: FINANCE_AUDIT_ENTITY_TYPES.PAYMENT, entityId: payment.id, action: FINANCE_AUDIT_ACTIONS.REGISTERED }, orderBy: { createdAt: "asc" }, select: { actorName: true } }),
    ]);
    const applications = normalizePaymentApplications(payment, contractById);
    const applied = applications.filter((application) => application.status === "ACTIVE").reduce((total, application) => total.plus(application.amount), new Prisma.Decimal(0));
    const money = (value: Prisma.Decimal) => value.toFixed(Math.max(2, value.decimalPlaces()));
    const settlement = payment.settlementCurrencyCode && payment.settlementAmount && payment.settlementAvailableAmount ? {
      currencyCode: payment.settlementCurrencyCode,
      amount: money(payment.settlementAmount),
      availableAmount: money(payment.settlementAvailableAmount),
      exchangeRate: payment.settlementExchangeRate ? payment.settlementExchangeRate.toFixed(Math.max(2, payment.settlementExchangeRate.decimalPlaces())) : null,
      exchangeRateSource: payment.settlementExchangeRateSource ?? null,
      exchangeRateEffectiveDate: payment.settlementExchangeRateEffectiveDate ?? null,
    } : null;
    const crossCurrency = Boolean(settlement && settlement.currencyCode !== payment.currencyCode);
    return {
      receiptNumber,
      customer: { name: customer?.fullName ?? payment.payerDisplayName, identification: customer?.idNumber ?? payment.payerIdentificationNumber, email: customer?.email ?? null },
      currencyCode: payment.currencyCode,
      receivedAmount: money(payment.receivedAmount),
      applicationCurrencyCode: crossCurrency ? settlement!.currencyCode : payment.currencyCode,
      appliedAmount: money(applied),
      availableAmount: crossCurrency ? settlement!.availableAmount : money(payment.availableAmount),
      settlement,
      receivedAt: payment.receivedAt,
      paymentMethodLabel: paymentMethodLabel(payment.paymentMethod),
      externalReference: payment.externalReference,
      description: payment.description,
      statusLabel: paymentStatusLabel(payment.status),
      registeredBy: registered?.actorName ?? null,
      applications: applications.map((application) => ({ ...application, statusLabel: allocationStatusLabel(application.status), amount: money(application.amount) })),
    };
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

function eligibleReceiptNumber(status: PaymentStatus, receiptNumber: string | null): string {
  if (!hasAvailablePaymentReceipt(status, receiptNumber) || typeof receiptNumber !== "string") {
    throw new ConflictException("PAYMENT_RECEIPT_UNAVAILABLE");
  }
  return receiptNumber;
}
