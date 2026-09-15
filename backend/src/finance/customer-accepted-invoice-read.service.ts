import { Injectable, NotFoundException } from "@nestjs/common";
import { BillingTaxAuthorityStatus } from "@prisma/client";
import { BillingDocumentService } from "../fiscal-billing/billing-document.service";
import { FiscalArtifactReadService } from "../fiscal-billing/fiscal-artifact-read.service";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Customer-context-only access to accepted fiscal invoices and their existing
 * immutable artifacts. This intentionally delegates document/artifact reads
 * to Fiscal rather than creating another invoice or storage implementation.
 */
@Injectable()
export class CustomerAcceptedInvoiceReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billingDocuments: BillingDocumentService,
    private readonly artifacts: FiscalArtifactReadService,
  ) {}

  async get(tenantId: string, customerId: string, billingDocumentId: string) {
    await this.requireAcceptedCustomerInvoice(tenantId, customerId, billingDocumentId);
    return this.billingDocuments.getAcceptedInvoice(tenantId, billingDocumentId);
  }

  async listArtifacts(tenantId: string, customerId: string, billingDocumentId: string) {
    await this.requireAcceptedCustomerInvoice(tenantId, customerId, billingDocumentId);
    return this.artifacts.list(tenantId, billingDocumentId);
  }

  async downloadArtifact(
    tenantId: string,
    customerId: string,
    billingDocumentId: string,
    artifactType: string,
    version: string,
  ) {
    await this.requireAcceptedCustomerInvoice(tenantId, customerId, billingDocumentId);
    return this.artifacts.download(tenantId, billingDocumentId, artifactType, version);
  }

  private async requireAcceptedCustomerInvoice(tenantId: string, customerId: string, billingDocumentId: string): Promise<void> {
    const document = await this.prisma.billingDocument.findFirst({
      where: {
        id: billingDocumentId,
        tenantId,
        customerId,
        taxAuthorityStatus: BillingTaxAuthorityStatus.ACCEPTED,
      },
      select: { id: true },
    });
    if (!document) throw new NotFoundException("CUSTOMER_ACCEPTED_INVOICE_NOT_FOUND");
  }
}
