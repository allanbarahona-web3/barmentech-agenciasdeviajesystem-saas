import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { isEmail } from "class-validator";
import { randomUUID } from "node:crypto";
import { DocumentPdfService } from "../documents/document-pdf.service";
import { EmailService } from "../email/email.service";
import { PrismaService } from "../prisma/prisma.service";
import { TenantService } from "../tenant/tenant.service";
import { customerAccountStatementTemplate, type CustomerAccountStatement } from "./customer-account-statement.template";

@Injectable()
export class CustomerAccountStatementService {
  constructor(private readonly prisma: PrismaService, private readonly pdf: DocumentPdfService, private readonly email: EmailService, private readonly tenants: TenantService) {}

  async get(tenantId: string, customerId: string, currencyCode: string): Promise<CustomerAccountStatement> {
    const customer = await this.prisma.client.findFirst({ where: { id: customerId, tenantId }, select: { id: true, fullName: true, idNumber: true, email: true } });
    if (!customer) throw new NotFoundException("CUSTOMER_ACCOUNT_STATEMENT_NOT_FOUND");
    const [receivables, payments, available] = await Promise.all([
      this.prisma.accountReceivable.findMany({ where: { tenantId, customerId, currencyCode }, orderBy: [{ recognizedAt: "asc" }, { id: "asc" }], include: { paymentAllocations: { orderBy: { allocatedAt: "asc" }, include: { payment: { select: { receiptNumber: true } } } } } }),
      this.prisma.payment.findMany({ where: { tenantId, customerId, currencyCode }, orderBy: [{ receivedAt: "asc" }, { id: "asc" }], include: { allocations: { orderBy: { allocatedAt: "asc" }, include: { accountReceivable: { select: { sourceNumber: true, sourceId: true } } } } } }),
      this.prisma.payment.aggregate({ where: { tenantId, customerId, currencyCode, status: { in: ["RECEIVED", "PARTIALLY_ALLOCATED"] }, availableAmount: { gt: 0 } }, _sum: { availableAmount: true } }),
    ]);
    const active = (value: string) => value === "ACTIVE";
    const invoiced = receivables.filter((r) => r.status !== "CANCELLED").reduce((sum, r) => sum.plus(r.originalAmount), new Prisma.Decimal(0));
    const outstanding = receivables.filter((r) => r.status !== "CANCELLED").reduce((sum, r) => sum.plus(r.outstandingAmount), new Prisma.Decimal(0));
    const m = (value: Prisma.Decimal) => value.toFixed(Math.max(2, value.decimalPlaces()));
    return { generatedAt: new Date(), customer: { id: customer.id, name: customer.fullName, identification: customer.idNumber, email: customer.email }, currencyCode, totals: { invoicedAmount: m(invoiced), allocatedAmount: m(invoiced.minus(outstanding)), outstandingAmount: m(outstanding), availableAmount: m(available._sum.availableAmount ?? new Prisma.Decimal(0)) }, invoices: receivables.map((r) => ({ id: r.id, number: r.sourceNumber ?? r.sourceId, documentType: r.sourceDocumentType, recognizedAt: r.recognizedAt, dueDate: r.dueDate, originalAmount: m(r.originalAmount), allocatedAmount: m(r.paymentAllocations.filter((a) => active(a.status)).reduce((sum, a) => sum.plus(a.amount), new Prisma.Decimal(0))), outstandingAmount: m(r.outstandingAmount), status: r.status, allocations: r.paymentAllocations.map((a) => ({ receiptNumber: a.payment.receiptNumber, amount: m(a.amount), allocatedAt: a.allocatedAt, status: a.status })) })), payments: payments.map((p) => ({ id: p.id, receiptNumber: p.receiptNumber, receivedAt: p.receivedAt, receivedAmount: m(p.receivedAmount), availableAmount: m(p.availableAmount), paymentMethod: p.paymentMethod, status: p.status, allocations: p.allocations.map((a) => ({ invoiceNumber: a.accountReceivable.sourceNumber ?? a.accountReceivable.sourceId, amount: m(a.amount), allocatedAt: a.allocatedAt, status: a.status })) })) };
  }

  async render(tenantId: string, customerId: string, currencyCode: string) { const [statement, tenant] = await Promise.all([this.get(tenantId, customerId, currencyCode), this.tenants.getTenantConfig(tenantId)]); const { pdfBuffer } = await this.pdf.renderDocumentToBuffer(customerAccountStatementTemplate(statement, tenant.name ?? "Empresa")); return { statement, pdfBuffer, fileName: `estado-cuenta-${safe(statement.customer.name)}-${currencyCode}.pdf` }; }
  async send(tenantId: string, actor: { userId: string; email: string; fullName: string }, customerId: string, currencyCode: string, to?: string, cc?: string) { const rendered = await this.render(tenantId, customerId, currencyCode); const recipient = to?.trim() || rendered.statement.customer.email?.trim(); if (!recipient || !isEmail(recipient)) throw new BadRequestException("CUSTOMER_ACCOUNT_STATEMENT_EMAIL_INVALID"); if (cc && !isEmail(cc)) throw new BadRequestException("CUSTOMER_ACCOUNT_STATEMENT_CC_INVALID"); const result = await this.email.sendEmail({ tenantId, to: recipient, ...(cc ? { cc } : {}), subject: `Estado de cuenta - ${rendered.statement.customer.name} - ${currencyCode}`, template: "business-document-attachment", templateData: { recipientName: rendered.statement.customer.name, documentLabel: "Estado de cuenta", documentNumber: currencyCode, message: "Adjuntamos el estado de cuenta solicitado con el detalle de facturas, pagos y saldos.", attachmentSummary: "El estado de cuenta se encuentra adjunto en formato PDF." }, attachments: [{ filename: rendered.fileName, content: rendered.pdfBuffer.toString("base64"), contentType: "application/pdf" }], idempotencyKey: `finance-statement:${tenantId}:${customerId}:${currencyCode}:${randomUUID()}`, triggeredBy: actor }); if (!result.success) throw new BadRequestException("CUSTOMER_ACCOUNT_STATEMENT_EMAIL_FAILED"); return { ok: true, sentTo: recipient, cc: cc ?? null, emailId: result.emailId ?? null }; }
}
function safe(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "cliente"; }
