import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PaymentPurpose, PaymentStatus, Prisma } from "@prisma/client";
import { isEmail } from "class-validator";
import { randomUUID } from "node:crypto";
import { DocumentPdfService } from "../documents/document-pdf.service";
import { EmailService } from "../email/email.service";
import { PrismaService } from "../prisma/prisma.service";
import { TenantService } from "../tenant/tenant.service";
import { customerAccountStatementStatusLabel, customerAccountStatementTemplate, type CustomerAccountStatement } from "./customer-account-statement.template";

@Injectable()
export class CustomerAccountStatementService {
  constructor(private readonly prisma: PrismaService, private readonly pdf: DocumentPdfService, private readonly email: EmailService, private readonly tenants: TenantService) {}

  async get(tenantId: string, customerId: string, currencyCode: string): Promise<CustomerAccountStatement> {
    const customer = await this.prisma.client.findFirst({ where: { id: customerId, tenantId }, select: { id: true, fullName: true, idNumber: true, email: true } });
    if (!customer) throw new NotFoundException("CUSTOMER_ACCOUNT_STATEMENT_NOT_FOUND");
    const [receivables, contractObligations, payments, available] = await Promise.all([
      this.prisma.accountReceivable.findMany({ where: { tenantId, customerId, currencyCode }, orderBy: [{ recognizedAt: "asc" }, { id: "asc" }], include: { paymentAllocations: { orderBy: { allocatedAt: "asc" }, include: { payment: { select: { receiptNumber: true } } } } } }),
      this.prisma.commercialObligation.findMany({ where: { tenantId, customerId, currencyCode, sourceType: "CONTRACT" }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], include: { allocations: { orderBy: { allocatedAt: "asc" }, include: { payment: { select: { id: true, receiptNumber: true, purpose: true } }, reversal: true } } } }),
      this.prisma.payment.findMany({ where: { tenantId, customerId, currencyCode, status: { in: [PaymentStatus.RECEIVED, PaymentStatus.PARTIALLY_ALLOCATED, PaymentStatus.FULLY_ALLOCATED, PaymentStatus.CANCELLED] }, receiptNumber: { not: null } }, orderBy: [{ receivedAt: "asc" }, { id: "asc" }], include: { allocations: { orderBy: { allocatedAt: "asc" }, include: { accountReceivable: { select: { sourceNumber: true, sourceId: true } } } }, commercialObligationAllocations: { orderBy: { allocatedAt: "asc" }, include: { commercialObligation: { select: { sourceType: true, sourceId: true, sourceReference: true } }, reversal: true } } } }),
      this.prisma.payment.aggregate({ where: { tenantId, customerId, currencyCode, status: { in: ["RECEIVED", "PARTIALLY_ALLOCATED"] }, availableAmount: { gt: 0 } }, _sum: { availableAmount: true } }),
    ]);
    const active = (value: string) => value === "ACTIVE";
    const activeReceivables = receivables.filter((receivable) => receivable.status !== "CANCELLED");
    const activeContractObligations = contractObligations.filter((obligation) => obligation.status !== "CANCELLED");
    const invoiced = [...activeReceivables, ...activeContractObligations].reduce((sum, row) => sum.plus(row.originalAmount), new Prisma.Decimal(0));
    const outstanding = [...activeReceivables, ...activeContractObligations].reduce((sum, row) => sum.plus(row.outstandingAmount), new Prisma.Decimal(0));
    const m = (value: Prisma.Decimal) => value.toFixed(Math.max(2, value.decimalPlaces()));
    const invoices = receivables.map((r) => ({ id: r.id, number: r.sourceNumber ?? r.sourceId, documentType: r.sourceDocumentType, recognizedAt: r.recognizedAt, dueDate: r.dueDate, originalAmount: m(r.originalAmount), allocatedAmount: m(r.paymentAllocations.filter((a) => active(a.status)).reduce((sum, a) => sum.plus(a.amount), new Prisma.Decimal(0))), outstandingAmount: m(r.outstandingAmount), status: r.status, allocations: r.paymentAllocations.map((a) => ({ receiptNumber: issuedReceiptNumber(a.payment.receiptNumber), amount: m(a.amount), allocatedAt: a.allocatedAt, status: a.status, statusLabel: customerAccountStatementStatusLabel(a.status) })) }));
    const contractCharges = contractObligations.map((obligation) => ({
      id: obligation.id,
      sourceType: "CONTRACT_OBLIGATION" as const,
      sourceId: obligation.sourceId,
      reference: obligation.sourceReference ?? obligation.sourceId,
      description: `Contrato ${obligation.sourceReference ?? obligation.sourceId}`,
      recognizedAt: obligation.createdAt,
      dueDate: obligation.dueDate,
      originalAmount: m(obligation.originalAmount),
      allocatedAmount: m(obligation.originalAmount.minus(obligation.outstandingAmount)),
      outstandingAmount: m(obligation.outstandingAmount),
      status: obligation.status,
      allocations: obligation.allocations.map((allocation) => ({
        paymentId: allocation.payment.id,
        receiptNumber: issuedReceiptNumber(allocation.payment.receiptNumber),
        purpose: allocation.payment.purpose,
        purposeLabel: paymentPurposeLabel(allocation.payment.purpose),
        amount: m(allocation.amount),
        allocatedAt: allocation.allocatedAt,
        status: allocation.status,
        statusLabel: customerAccountStatementStatusLabel(allocation.status),
        reversedAt: allocation.reversal?.reversedAt ?? null,
        reversalReason: allocation.reversal?.reason ?? null,
      })),
    }));
    const charges = [
      ...invoices.map((invoice) => ({ sourceType: "ACCOUNT_RECEIVABLE" as const, sourceId: invoice.id, reference: invoice.number, description: invoice.documentType ?? "Cuenta por cobrar", ...invoice })),
      ...contractCharges,
    ].sort((left, right) => left.recognizedAt.getTime() - right.recognizedAt.getTime() || left.id.localeCompare(right.id));
    return {
      generatedAt: new Date(), customer: { id: customer.id, name: customer.fullName, identification: customer.idNumber, email: customer.email }, currencyCode,
      totals: { invoicedAmount: m(invoiced), allocatedAmount: m(invoiced.minus(outstanding)), outstandingAmount: m(outstanding), availableAmount: m(available._sum.availableAmount ?? new Prisma.Decimal(0)) },
      invoices,
      charges,
      payments: payments.filter((p) => statementPaymentStatus(p.status)).map((p) => ({
        id: p.id, receiptNumber: issuedReceiptNumber(p.receiptNumber), receivedAt: p.receivedAt, receivedAmount: m(p.receivedAmount), availableAmount: m(p.availableAmount), paymentMethod: p.paymentMethod, paymentMethodLabel: paymentMethodLabel(p.paymentMethod), purpose: p.purpose, purposeLabel: paymentPurposeLabel(p.purpose), status: p.status,
        allocations: [
          ...p.allocations.map((a) => ({ sourceType: "ACCOUNT_RECEIVABLE" as const, reference: a.accountReceivable.sourceNumber ?? a.accountReceivable.sourceId, amount: m(a.amount), allocatedAt: a.allocatedAt, status: a.status, statusLabel: customerAccountStatementStatusLabel(a.status), reversedAt: null, reversalReason: null })),
          ...p.commercialObligationAllocations.filter((a) => a.commercialObligation.sourceType === "CONTRACT").map((a) => ({ sourceType: "CONTRACT_OBLIGATION" as const, reference: a.commercialObligation.sourceReference ?? a.commercialObligation.sourceId, amount: m(a.amount), allocatedAt: a.allocatedAt, status: a.status, statusLabel: customerAccountStatementStatusLabel(a.status), reversedAt: a.reversal?.reversedAt ?? null, reversalReason: a.reversal?.reason ?? null })),
        ],
      })),
    };
  }

  async render(tenantId: string, customerId: string, currencyCode: string) { const [statement, tenant, billingConfiguration] = await Promise.all([this.get(tenantId, customerId, currencyCode), this.tenants.getTenantConfig(tenantId), this.prisma.tenantBillingConfiguration.findUnique({ where: { tenantId }, select: { fiscalTimezone: true } })]); const { pdfBuffer } = await this.pdf.renderDocumentToBuffer(customerAccountStatementTemplate(statement, tenant.name ?? "Empresa", billingConfiguration?.fiscalTimezone ?? "America/Costa_Rica")); return { statement, pdfBuffer, fileName: `estado-cuenta-${safe(statement.customer.name)}-${currencyCode}.pdf` }; }
  async send(tenantId: string, actor: { userId: string; email: string; fullName: string }, customerId: string, currencyCode: string, to?: string, cc?: string) { const rendered = await this.render(tenantId, customerId, currencyCode); const recipient = to?.trim() || rendered.statement.customer.email?.trim(); if (!recipient || !isEmail(recipient)) throw new BadRequestException("CUSTOMER_ACCOUNT_STATEMENT_EMAIL_INVALID"); if (cc && !isEmail(cc)) throw new BadRequestException("CUSTOMER_ACCOUNT_STATEMENT_CC_INVALID"); const result = await this.email.sendEmail({ tenantId, to: recipient, ...(cc ? { cc } : {}), subject: `Estado de cuenta - ${rendered.statement.customer.name} - ${currencyCode}`, template: "business-document-attachment", templateData: { recipientName: rendered.statement.customer.name, documentLabel: "Estado de cuenta", documentNumber: currencyCode, message: "Adjuntamos el estado de cuenta solicitado con el detalle de facturas, pagos y saldos.", attachmentSummary: "El estado de cuenta se encuentra adjunto en formato PDF." }, attachments: [{ filename: rendered.fileName, content: rendered.pdfBuffer.toString("base64"), contentType: "application/pdf" }], idempotencyKey: `finance-statement:${tenantId}:${customerId}:${currencyCode}:${randomUUID()}`, triggeredBy: actor }); if (!result.success) throw new BadRequestException("CUSTOMER_ACCOUNT_STATEMENT_EMAIL_FAILED"); return { ok: true, sentTo: recipient, cc: cc ?? null, emailId: result.emailId ?? null }; }
}

function statementPaymentStatus(status: PaymentStatus): boolean {
  return status === PaymentStatus.RECEIVED ||
    status === PaymentStatus.PARTIALLY_ALLOCATED ||
    status === PaymentStatus.FULLY_ALLOCATED ||
    status === PaymentStatus.CANCELLED;
}

function issuedReceiptNumber(value: string | null): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("FINANCE_RECEIPT_NUMBER_INVARIANT_VIOLATION");
  }
  return value;
}
function safe(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "cliente"; }

function paymentMethodLabel(value: string): string {
  return ({ CASH: "Efectivo", BANK_TRANSFER: "Transferencia bancaria", CARD: "Tarjeta", CHECK: "Cheque", MOBILE_TRANSFER: "Transferencia móvil", OTHER: "Otro" } as Record<string, string>)[value] ?? value;
}

function paymentPurposeLabel(value: PaymentPurpose): string {
  return ({ CONTRACT_RESERVATION: "Reserva", CONTRACT_PAYMENT: "Pago de contado", CONTRACT_INSTALLMENT: "Abono" } as Partial<Record<PaymentPurpose, string>>)[value] ?? "Pago";
}
