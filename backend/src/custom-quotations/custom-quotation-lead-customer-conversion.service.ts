import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { CustomersService, type CustomerIdentityTransaction } from "../customers/customers.service";
import { CreateCustomerDto } from "../customers/dto/create-customer.dto";
import { PrismaService } from "../prisma/prisma.service";
import { runTenantTransaction } from "../tenant/tenant-transaction";
import type { CustomQuotationActor } from "./custom-quotations.service";

type ConversionTransaction = CustomerIdentityTransaction & {
  $executeRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
  $queryRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
  customQuotation: Record<string, (...args: any[]) => Promise<any>>;
  customQuotationVersion: Record<string, (...args: any[]) => Promise<any>>;
  lead: Record<string, (...args: any[]) => Promise<any>>;
};

type ConversionDatabase = {
  $transaction<T>(work: (transaction: ConversionTransaction) => Promise<T>): Promise<T>;
};

@Injectable()
export class CustomQuotationLeadCustomerConversionService {
  private readonly database: ConversionDatabase;

  constructor(
    prisma: PrismaService,
    private readonly customers: CustomersService,
  ) {
    this.database = prisma as unknown as ConversionDatabase;
  }

  convert(
    tenantId: string,
    quotationId: string,
    input: CreateCustomerDto,
    actor: CustomQuotationActor,
  ) {
    return this.withTenantTransaction(tenantId, async (tx) => {
      await lockQuotation(tx, tenantId, quotationId);
      const quotation = await tx.customQuotation.findFirst({
        where: { id: quotationId, tenantId },
        select: { id: true, status: true, leadId: true, customerId: true },
      });
      if (!quotation) throw new NotFoundException("CUSTOM_QUOTATION_NOT_FOUND");
      if (quotation.status !== "ACCEPTED") {
        throw new ConflictException("CUSTOM_QUOTATION_LEAD_CONVERSION_NOT_ACCEPTED");
      }

      const acceptedVersion = await tx.customQuotationVersion.findFirst({
        where: { tenantId, customQuotationId: quotationId, status: "ACCEPTED" },
        select: { id: true },
      });
      if (!acceptedVersion) {
        throw new ConflictException("CUSTOM_QUOTATION_ACCEPTED_VERSION_REQUIRED");
      }

      if (quotation.customerId) {
        return this.resolveExistingCustomer(tx, tenantId, quotation);
      }
      if (!quotation.leadId) {
        throw new ConflictException("CUSTOM_QUOTATION_LEAD_CONVERSION_NOT_APPLICABLE");
      }

      await lockLead(tx, tenantId, quotation.leadId);
      const lead = await tx.lead.findFirst({
        where: { id: quotation.leadId, tenantId },
        select: { id: true, status: true, convertedCustomerId: true, convertedAt: true },
      });
      if (!lead) throw new NotFoundException("CUSTOM_QUOTATION_LEAD_NOT_FOUND");
      if (lead.status !== "OPEN" || lead.convertedCustomerId) {
        throw new ConflictException("CUSTOM_QUOTATION_LEAD_CONVERSION_STATE_INVALID");
      }

      const resolved = await this.customers.resolveCustomerIdentityInTransaction(tx, tenantId, input);
      const convertedAt = new Date();
      const leadUpdate = await tx.lead.updateMany({
        where: { id: lead.id, tenantId, status: "OPEN", convertedCustomerId: null },
        data: {
          status: "CONVERTED",
          convertedCustomerId: resolved.customer.id,
          convertedAt,
          updatedByUserId: actor.userId,
          updatedByName: actor.name,
        },
      });
      if (leadUpdate.count !== 1) throw new ConflictException("CUSTOM_QUOTATION_LEAD_CONVERSION_CONFLICT");

      const quotationUpdate = await tx.customQuotation.updateMany({
        where: { id: quotation.id, tenantId, status: "ACCEPTED", customerId: null },
        data: { customerId: resolved.customer.id },
      });
      if (quotationUpdate.count !== 1) throw new ConflictException("CUSTOM_QUOTATION_LEAD_CONVERSION_CONFLICT");

      return conversionResponse({
        quotationId: quotation.id,
        leadId: lead.id,
        customer: resolved.customer,
        convertedAt,
        reusedExisting: resolved.reusedExisting,
      });
    });
  }

  private async resolveExistingCustomer(tx: ConversionTransaction, tenantId: string, quotation: any) {
    const customer = await tx.client.findFirst({
      where: { id: quotation.customerId, tenantId },
      select: { id: true, fullName: true },
    });
    if (!customer) throw new NotFoundException("CUSTOM_QUOTATION_CUSTOMER_NOT_FOUND");

    if (!quotation.leadId) {
      return conversionResponse({
        quotationId: quotation.id,
        leadId: null,
        customer,
        convertedAt: null,
        reusedExisting: true,
      });
    }

    await lockLead(tx, tenantId, quotation.leadId);
    const lead = await tx.lead.findFirst({
      where: { id: quotation.leadId, tenantId },
      select: { id: true, status: true, convertedCustomerId: true, convertedAt: true },
    });
    if (!lead) throw new NotFoundException("CUSTOM_QUOTATION_LEAD_NOT_FOUND");
    if (
      lead.status !== "CONVERTED" ||
      !lead.convertedCustomerId ||
      lead.convertedCustomerId !== customer.id ||
      !lead.convertedAt
    ) {
      throw new ConflictException("CUSTOM_QUOTATION_LEAD_CONVERSION_STATE_INVALID");
    }
    return conversionResponse({
      quotationId: quotation.id,
      leadId: lead.id,
      customer,
      convertedAt: lead.convertedAt,
      reusedExisting: true,
    });
  }

  private withTenantTransaction<T>(tenantId: string, work: (tx: ConversionTransaction) => Promise<T>) {
    return runTenantTransaction(this.database, tenantId, work);
  }
}

async function lockQuotation(tx: ConversionTransaction, tenantId: string, quotationId: string) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "custom_quotations"
    WHERE "id" = ${quotationId} AND "tenantId" = ${tenantId}
    FOR UPDATE
  `;
  if (rows.length !== 1) throw new NotFoundException("CUSTOM_QUOTATION_NOT_FOUND");
}

async function lockLead(tx: ConversionTransaction, tenantId: string, leadId: string) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "leads"
    WHERE "id" = ${leadId} AND "tenantId" = ${tenantId}
    FOR UPDATE
  `;
  if (rows.length !== 1) throw new NotFoundException("CUSTOM_QUOTATION_LEAD_NOT_FOUND");
}

function conversionResponse(input: {
  quotationId: string;
  leadId: string | null;
  customer: { id: string; fullName: string };
  convertedAt: Date | null;
  reusedExisting: boolean;
}) {
  return {
    quotationId: input.quotationId,
    leadId: input.leadId,
    customerId: input.customer.id,
    customerDisplayName: input.customer.fullName,
    convertedAt: input.convertedAt,
    reusedExistingCustomer: input.reusedExisting,
    salesOrderReady: true,
  };
}
