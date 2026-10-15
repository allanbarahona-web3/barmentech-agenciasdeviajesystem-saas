import { Injectable, NotFoundException } from "@nestjs/common";
import { CustomerDocumentCategory } from "@prisma/client";
import { CustomerDocumentsService } from "../../customers/documents/customer-documents.service";
import { PrismaService } from "../../prisma/prisma.service";
import { runTenantTransaction } from "../../tenant/tenant-transaction";

const ALLOWED_DOCUMENT_CATEGORIES = [
  CustomerDocumentCategory.ID_FRONT,
  CustomerDocumentCategory.ID_BACK,
  CustomerDocumentCategory.PASSPORT,
] as const;

type OperationsTransaction = {
  $executeRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
  operationalRequirement: Record<string, (...args: any[]) => Promise<any>>;
  customerDocument: Record<string, (...args: any[]) => Promise<any>>;
};
type OperationsDatabase = {
  $transaction<T>(work: (transaction: OperationsTransaction) => Promise<T>): Promise<T>;
};
type PassengerDocumentContext = {
  contextKey: string;
  customerId: string;
  displayName: string;
};

@Injectable()
export class OperationalPassengerDocumentsService {
  private readonly database: OperationsDatabase;

  constructor(
    prisma: PrismaService,
    private readonly customerDocuments: CustomerDocumentsService,
  ) {
    this.database = prisma as unknown as OperationsDatabase;
  }

  async list(tenantId: string, requirementId: string) {
    return this.withTransaction(tenantId, async (tx) => {
      const passengers = await this.resolvePassengerContexts(tx, tenantId, requirementId);
      const customerIds = [...new Set(passengers.map((passenger) => passenger.customerId))];
      const documents = customerIds.length === 0
        ? []
        : await tx.customerDocument.findMany({
          where: {
            tenantId,
            customerId: { in: customerIds },
            category: { in: ALLOWED_DOCUMENT_CATEGORIES },
            isCurrent: true,
          },
          select: {
            id: true,
            customerId: true,
            category: true,
            originalFileName: true,
            mimeType: true,
            createdAt: true,
          },
          orderBy: [{ customerId: "asc" }, { category: "asc" }, { createdAt: "desc" }, { id: "asc" }],
        }) as Array<{
          id: string;
          customerId: string;
          category: CustomerDocumentCategory;
          originalFileName: string;
          mimeType: string;
          createdAt: Date;
        }>;
      const documentsByCustomer = new Map<string, Array<{
        id: string;
        category: CustomerDocumentCategory;
        originalFilename: string;
        mimeType: string;
        createdAt: Date;
      }>>();
      for (const document of documents) {
        if (!isAllowedCategory(document.category)) continue;
        const current = documentsByCustomer.get(document.customerId) ?? [];
        current.push({
          id: document.id,
          category: document.category,
          originalFilename: document.originalFileName,
          mimeType: document.mimeType,
          createdAt: document.createdAt,
        });
        documentsByCustomer.set(document.customerId, current);
      }
      return {
        passengers: passengers.map((passenger) => ({
          contextKey: passenger.contextKey,
          displayName: passenger.displayName,
          documents: documentsByCustomer.get(passenger.customerId) ?? [],
        })),
      };
    });
  }

  async getSignedUrl(tenantId: string, requirementId: string, documentId: string) {
    const authorized = await this.withTransaction(tenantId, async (tx) => {
      const passengers = await this.resolvePassengerContexts(tx, tenantId, requirementId);
      const customerIds = [...new Set(passengers.map((passenger) => passenger.customerId))];
      const document = await tx.customerDocument.findFirst({
        where: {
          id: documentId,
          tenantId,
          customerId: { in: customerIds },
          category: { in: ALLOWED_DOCUMENT_CATEGORIES },
          isCurrent: true,
        },
        select: { customerId: true, category: true },
      }) as { customerId: string; category: CustomerDocumentCategory } | null;
      if (!document || !isAllowedCategory(document.category)) {
        throw new NotFoundException("OPERATIONAL_PASSENGER_DOCUMENT_NOT_FOUND");
      }
      return document;
    });
    return this.customerDocuments.generateDownloadUrl(tenantId, authorized.customerId, documentId);
  }

  private async resolvePassengerContexts(
    tx: OperationsTransaction,
    tenantId: string,
    requirementId: string,
  ): Promise<PassengerDocumentContext[]> {
    const requirement = await tx.operationalRequirement.findFirst({
      where: { id: requirementId, tenantId },
      select: {
        scopeType: true,
        customerId: true,
        customer: { select: { id: true, fullName: true } },
        passengers: {
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          select: {
            travelPackageParticipantId: true,
            travelPackageParticipant: {
              select: {
                clientId: true,
                client: { select: { fullName: true } },
              },
            },
          },
        },
      },
    }) as {
      scopeType: "TRAVEL_PACKAGE" | "STANDALONE_CUSTOMER";
      customerId: string | null;
      customer: { id: string; fullName: string } | null;
      passengers: Array<{
        travelPackageParticipantId: string;
        travelPackageParticipant: { clientId: string; client: { fullName: string } };
      }>;
    } | null;
    if (!requirement) throw new NotFoundException("OPERATIONAL_REQUIREMENT_NOT_FOUND");

    if (requirement.scopeType === "STANDALONE_CUSTOMER") {
      if (!requirement.customerId || !requirement.customer) {
        throw new NotFoundException("OPERATIONAL_REQUIREMENT_CUSTOMER_NOT_FOUND");
      }
      return [{
        contextKey: `customer:${requirement.customer.id}`,
        customerId: requirement.customer.id,
        displayName: requirement.customer.fullName,
      }];
    }

    return requirement.passengers.map((passenger) => ({
      contextKey: `passenger:${passenger.travelPackageParticipantId}`,
      customerId: passenger.travelPackageParticipant.clientId,
      displayName: passenger.travelPackageParticipant.client.fullName,
    }));
  }

  private withTransaction<T>(
    tenantId: string,
    work: (tx: OperationsTransaction) => Promise<T>,
  ): Promise<T> {
    return runTenantTransaction(this.database, tenantId, work);
  }
}

function isAllowedCategory(category: CustomerDocumentCategory): boolean {
  return (ALLOWED_DOCUMENT_CATEGORIES as readonly CustomerDocumentCategory[]).includes(category);
}
