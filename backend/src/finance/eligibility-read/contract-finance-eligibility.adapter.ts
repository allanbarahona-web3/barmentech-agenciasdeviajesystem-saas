import { Injectable } from "@nestjs/common";
import { CommercialObligationStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { runTenantTransaction } from "../../tenant/tenant-transaction";
import {
  normalizeFinanceEligibilitySources,
  requiredFinanceEligibilityTenantId,
} from "./finance-eligibility-reader.utils";
import type {
  CommercialSourceRef,
  EligibilityFinancialStatus,
  FinanceEligibilityReader,
  FinanceEligibilityResult,
  ReadFinanceEligibilityRequest,
} from "./finance-eligibility-reader.port";

const ACTIVE_CONTRACT_STATUSES = new Set([
  "PENDING_SIGNATURE",
  "SIGNING_SENT",
  "VIEWED",
  "SIGNED",
]);

/**
 * Finance's Contract implementation of the source-agnostic eligibility port.
 * It reflects the currently supported direct CommercialObligation allocation
 * lifecycle only; cancellation, reversal, and credit-note coordination remain
 * owned by future Finance lifecycle hardening.
 */
@Injectable()
export class ContractFinanceEligibilityAdapter implements FinanceEligibilityReader {
  constructor(private readonly prisma: PrismaService) {}

  async readMany(
    request: ReadFinanceEligibilityRequest,
  ): Promise<FinanceEligibilityResult[]> {
    const sources = normalizeFinanceEligibilitySources(request.sources);
    if (sources.length === 0) return [];

    const contractIds = [...new Set(
      sources
        .filter((source) => source.sourceType === "CONTRACT")
        .map((source) => source.sourceId),
    )];
    if (contractIds.length === 0) {
      return sources.map((source) => missingFinancialData(source));
    }

    return runTenantTransaction<any, FinanceEligibilityResult[]>(
      this.prisma as any,
      requiredFinanceEligibilityTenantId(request.tenantId),
      async (tx: Prisma.TransactionClient) => {
        const [contracts, obligations] = await Promise.all([
          tx.contract.findMany({
            where: { tenantId: request.tenantId, id: { in: contractIds } },
            select: { id: true, status: true, cancelledAt: true },
          }),
          tx.commercialObligation.findMany({
            where: {
              tenantId: request.tenantId,
              sourceType: "CONTRACT",
              sourceId: { in: contractIds },
            },
            select: {
              sourceId: true,
              currencyCode: true,
              originalAmount: true,
              outstandingAmount: true,
              status: true,
              settledAt: true,
              updatedAt: true,
            },
          }),
        ]);
        const contractById = new Map(contracts.map((contract) => [contract.id, contract]));
        const obligationByContractId = new Map<string, (typeof obligations)[number]>();
        const ambiguousContractIds = new Set<string>();
        for (const obligation of obligations) {
          // The database unique constraint makes this impossible, but ambiguity
          // must never grant supplier-spend authorization.
          if (obligationByContractId.has(obligation.sourceId)) {
            obligationByContractId.delete(obligation.sourceId);
            ambiguousContractIds.add(obligation.sourceId);
            continue;
          }
          if (ambiguousContractIds.has(obligation.sourceId)) continue;
          obligationByContractId.set(obligation.sourceId, obligation);
        }

        return sources.map((source) => {
          if (source.sourceType !== "CONTRACT") return missingFinancialData(source);
          const contract = contractById.get(source.sourceId);
          if (!contract) return missingFinancialData(source);
          if (contract.cancelledAt !== null || contract.status === "CANCELLED") {
            return blocked(source, "CONTRACT_CANCELLED");
          }
          if (!ACTIVE_CONTRACT_STATUSES.has(contract.status)) {
            return blocked(source, "CONTRACT_NOT_ACTIVE");
          }
          const obligation = obligationByContractId.get(source.sourceId);
          if (ambiguousContractIds.has(source.sourceId) || !obligation || !validFinancialAmounts(obligation)) {
            return missingFinancialData(source);
          }
          const financial = {
            originalAmount: obligation.originalAmount.toFixed(),
            outstandingAmount: obligation.outstandingAmount.toFixed(),
            currency: obligation.currencyCode,
            financialStatus: financialStatus(obligation.status),
            settledAt: obligation.settledAt,
            lastFinancialChangeAt: validDate(obligation.updatedAt) ? obligation.updatedAt : null,
          };
          const settled =
            obligation.status === CommercialObligationStatus.SETTLED &&
            obligation.outstandingAmount.isZero() &&
            validDate(obligation.settledAt);
          return settled
            ? { source, eligibility: "ELIGIBLE", reason: "SETTLED", financial }
            : {
                source,
                eligibility: "BLOCKED",
                reason: "OUTSTANDING_BALANCE",
                financial,
              };
        });
      },
    );
  }
}

function validFinancialAmounts(obligation: {
  currencyCode: string;
  originalAmount: Prisma.Decimal;
  outstandingAmount: Prisma.Decimal;
}): boolean {
  return /^[A-Z]{3}$/.test(obligation.currencyCode) &&
    obligation.originalAmount.isFinite() &&
    obligation.originalAmount.greaterThan(0) &&
    obligation.outstandingAmount.isFinite() &&
    obligation.outstandingAmount.greaterThanOrEqualTo(0) &&
    obligation.outstandingAmount.lessThanOrEqualTo(obligation.originalAmount);
}

function financialStatus(status: CommercialObligationStatus): EligibilityFinancialStatus {
  if (status === CommercialObligationStatus.SETTLED) return "SETTLED";
  if (status === CommercialObligationStatus.CANCELLED) return "CANCELLED";
  if (status === CommercialObligationStatus.OPEN || status === CommercialObligationStatus.PARTIALLY_SETTLED) {
    return "OUTSTANDING";
  }
  return "UNKNOWN";
}

function validDate(value: Date | null): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

function blocked(
  source: CommercialSourceRef,
  reason: "CONTRACT_CANCELLED" | "CONTRACT_NOT_ACTIVE",
): FinanceEligibilityResult {
  return { source, eligibility: "BLOCKED", reason };
}

function missingFinancialData(source: CommercialSourceRef): FinanceEligibilityResult {
  return { source, eligibility: "BLOCKED", reason: "FINANCIAL_DATA_MISSING" };
}
