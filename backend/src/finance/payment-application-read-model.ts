import { PaymentStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

export const paymentApplicationSelect = {
  allocations: {
    orderBy: [{ allocatedAt: "asc" }, { id: "asc" }],
    select: {
      amount: true,
      status: true,
      allocatedAt: true,
      accountReceivable: {
        select: {
          sourceNumber: true,
          sourceDocumentType: true,
          currencyCode: true,
        },
      },
    },
  },
  commercialObligationAllocations: {
    orderBy: [{ allocatedAt: "asc" }, { id: "asc" }],
    select: {
      amount: true,
      status: true,
      allocatedAt: true,
      commercialObligation: {
        select: {
          sourceType: true,
          sourceId: true,
          sourceReference: true,
          currencyCode: true,
        },
      },
    },
  },
} satisfies Prisma.PaymentSelect;

export type PaymentApplicationSource = Prisma.PaymentGetPayload<{
  select: typeof paymentApplicationSelect;
}>;

export type PaymentApplication = {
  type: "ACCOUNT_RECEIVABLE" | "COMMERCIAL_OBLIGATION";
  reference: string;
  description: string | null;
  relatedDocumentReference: string | null;
  applicationDate: Date;
  currencyCode: string;
  amount: Prisma.Decimal;
  status: string;
};

export type ContractApplicationLabel = {
  contractNumber: string;
  travelName: string | null;
};

export async function loadPaymentApplicationContractLabels(
  prisma: Pick<PrismaService, "contract">,
  tenantId: string,
  payments: PaymentApplicationSource[],
): Promise<Map<string, ContractApplicationLabel>> {
  const contractIds = [...new Set(payments.flatMap((payment) =>
    payment.commercialObligationAllocations
      .filter((allocation) => allocation.commercialObligation.sourceType === "CONTRACT")
      .map((allocation) => allocation.commercialObligation.sourceId),
  ))];
  if (!contractIds.length) return new Map();

  const contracts = await prisma.contract.findMany({
    where: { tenantId, id: { in: contractIds } },
    select: {
      id: true,
      contractNumber: true,
      destination: true,
      travelPackage: { select: { name: true } },
      internalTrip: { select: { name: true } },
    },
  });
  return new Map(contracts.map((contract) => [contract.id, {
    contractNumber: contract.contractNumber,
    travelName: contract.travelPackage?.name ?? contract.internalTrip?.name ?? contract.destination,
  }]));
}

export function normalizePaymentApplications(
  payment: PaymentApplicationSource,
  contractById: ReadonlyMap<string, ContractApplicationLabel>,
): PaymentApplication[] {
  return [
    ...payment.allocations.map((allocation) => ({
      type: "ACCOUNT_RECEIVABLE" as const,
      reference: allocation.accountReceivable.sourceNumber ?? "Cuenta por cobrar",
      description: allocation.accountReceivable.sourceDocumentType ?? null,
      relatedDocumentReference: allocation.accountReceivable.sourceNumber ?? null,
      applicationDate: allocation.allocatedAt,
      currencyCode: allocation.accountReceivable.currencyCode,
      amount: allocation.amount,
      status: allocation.status,
    })),
    ...payment.commercialObligationAllocations.map((allocation) => {
      const obligation = allocation.commercialObligation;
      const contract = obligation.sourceType === "CONTRACT" ? contractById.get(obligation.sourceId) : null;
      return {
        type: "COMMERCIAL_OBLIGATION" as const,
        reference: contract?.contractNumber ?? obligation.sourceReference ?? "Obligación comercial",
        description: contract?.travelName ?? null,
        relatedDocumentReference: null,
        applicationDate: allocation.allocatedAt,
        currencyCode: obligation.currencyCode,
        amount: allocation.amount,
        status: allocation.status,
      };
    }),
  ].sort((left, right) =>
    left.applicationDate.getTime() - right.applicationDate.getTime() ||
    left.reference.localeCompare(right.reference),
  );
}

export function hasAvailablePaymentReceipt(
  status: PaymentStatus,
  receiptNumber: string | null,
): boolean {
  return (
    (status === PaymentStatus.RECEIVED ||
      status === PaymentStatus.PARTIALLY_ALLOCATED ||
      status === PaymentStatus.FULLY_ALLOCATED ||
      status === PaymentStatus.CANCELLED) &&
    typeof receiptNumber === "string" &&
    receiptNumber.trim().length > 0
  );
}
