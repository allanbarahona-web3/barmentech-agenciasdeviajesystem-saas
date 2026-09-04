import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PaymentConditionType, PriceTaxTreatment, Prisma } from "@prisma/client";
import {
  COMMERCIAL_OBLIGATION_ERRORS,
  CommercialObligationError,
  CommercialObligationService,
} from "../finance/commercial-obligation.service";
import type { FinanceActor } from "../finance/finance-audit";
import {
  TravelPackageParticipantsRepository,
  type TravelPackageParticipantWrite,
} from "../travel-packages/repositories/travel-package-participants.repository";

const APPROVABLE_CONTRACT_STATUSES = ["PENDING_PAYMENT_RESERVE", "RESERVE_IN_REVIEW"];

@Injectable()
export class ContractReservationApprovalService {
  constructor(
    private readonly participantsRepository: TravelPackageParticipantsRepository,
    private readonly commercialObligations: CommercialObligationService,
  ) {}

  async approveInTransaction(
    tx: Prisma.TransactionClient,
    input: {
      tenantId: string;
      contractId: string;
      actor: FinanceActor;
      afterCommercialObligation?: (input: { commercialObligationId: string }) => Promise<void>;
    },
  ): Promise<{ applied: boolean; commercialObligationId: string | null }> {
    await tx.$queryRaw`
      SELECT "id" FROM "Contract"
      WHERE "id" = ${input.contractId} AND "tenantId" = ${input.tenantId}
      FOR UPDATE
    `;
    const contract = await tx.contract.findFirst({
      where: { id: input.contractId, tenantId: input.tenantId },
      select: {
        id: true,
        tenantId: true,
        clientId: true,
        status: true,
        contractNumber: true,
        participantCount: true,
        travelPackageId: true,
        internalTripId: true,
        payload: true,
        commercialTotal: true,
        commercialCurrency: true,
        paymentConditionType: true,
        paymentDueDate: true,
        commercialTaxTreatment: true,
      },
    });
    if (!contract) throw new NotFoundException("CONTRACT_RESERVATION_CONTRACT_NOT_FOUND");
    if (contract.status === "PENDING_SIGNATURE") return { applied: false, commercialObligationId: null };
    if (!APPROVABLE_CONTRACT_STATUSES.includes(contract.status)) {
      throw new BadRequestException("CONTRACT_RESERVATION_CONTRACT_STATE_CONFLICT");
    }

    const participantCount = requireParticipantCount(contract.participantCount);
    if (contract.travelPackageId && contract.internalTripId) {
      throw new BadRequestException("CONTRACT_RESERVATION_TRAVEL_CONTEXT_CONFLICT");
    }
    if (contract.travelPackageId) {
      await this.lockTravelPackage(tx, contract.travelPackageId, contract.tenantId, participantCount);
    }
    if (contract.internalTripId) {
      await this.lockInternalTrip(tx, contract.internalTripId, contract.tenantId, participantCount);
    }

    const commercialTerms = requireCommercialTerms(contract);
    try {
      const commercialObligation = await this.commercialObligations.createInTransaction(tx, {
        tenantId: contract.tenantId,
        customerId: contract.clientId,
        sourceType: "CONTRACT",
        sourceId: contract.id,
        sourceReference: contract.contractNumber,
        currencyCode: commercialTerms.currencyCode,
        originalAmount: commercialTerms.total,
        dueDate: commercialTerms.dueDate,
        actor: input.actor,
      });

      await input.afterCommercialObligation?.({
        commercialObligationId: commercialObligation.obligation.id,
      });

      return this.completeApproval(tx, contract, participantCount, commercialObligation.obligation.id);
    } catch (error) {
      if (error instanceof CommercialObligationError) {
        if (error.code === COMMERCIAL_OBLIGATION_ERRORS.CONFLICT) {
          throw new ConflictException(error.code);
        }
        if (
          error.code === COMMERCIAL_OBLIGATION_ERRORS.INVALID ||
          error.code === COMMERCIAL_OBLIGATION_ERRORS.CUSTOMER_INVALID
        ) {
          throw new BadRequestException(error.code);
        }
      }
      throw error;
    }

  }

  private async completeApproval(
    tx: Prisma.TransactionClient,
    contract: {
      id: string; tenantId: string; clientId: string; contractNumber: string; participantCount: number;
      travelPackageId: string | null; internalTripId: string | null; payload: unknown;
    },
    participantCount: number,
    commercialObligationId: string,
  ): Promise<{ applied: boolean; commercialObligationId: string }> {
    const transitioned = await tx.contract.updateMany({
      where: {
        id: contract.id,
        tenantId: contract.tenantId,
        status: { in: APPROVABLE_CONTRACT_STATUSES },
      },
      data: { status: "PENDING_SIGNATURE" },
    });
    if (transitioned.count !== 1) {
      throw new BadRequestException("CONTRACT_RESERVATION_CONTRACT_STATE_CONFLICT");
    }

    if (contract.travelPackageId) {
      await this.createInternationalTravelRoster(tx, {
        ...contract,
        travelPackageId: contract.travelPackageId,
      });
      const travelPackage = await tx.travelPackage.update({
        where: { id: contract.travelPackageId },
        data: { occupiedSlots: { increment: participantCount } },
        select: { occupiedSlots: true, capacity: true, status: true },
      });
      if (travelPackage.occupiedSlots >= travelPackage.capacity && travelPackage.status !== "CLOSED") {
        await tx.travelPackage.update({ where: { id: contract.travelPackageId }, data: { status: "CLOSED" } });
      }
    }

    if (contract.internalTripId) {
      const internalTrip = await tx.internalTrip.update({
        where: { id: contract.internalTripId },
        data: { occupiedSlots: { increment: participantCount } },
        select: { occupiedSlots: true, capacity: true, status: true },
      });
      if (internalTrip.occupiedSlots >= internalTrip.capacity && internalTrip.status !== "CLOSED") {
        await tx.internalTrip.update({ where: { id: contract.internalTripId }, data: { status: "CLOSED" } });
      }
    }

    return { applied: true, commercialObligationId };
  }

  private async lockTravelPackage(
    tx: Prisma.TransactionClient,
    travelPackageId: string,
    tenantId: string,
    participantCount: number,
  ): Promise<void> {
    await tx.$queryRaw`
      SELECT "id" FROM "TravelPackage"
      WHERE "id" = ${travelPackageId} AND "tenantId" = ${tenantId}
      FOR UPDATE
    `;
    const travelPackage = await tx.travelPackage.findFirst({
      where: { id: travelPackageId, tenantId },
      select: { capacity: true, occupiedSlots: true, name: true },
    });
    if (!travelPackage) throw new NotFoundException("CONTRACT_RESERVATION_TRAVEL_PACKAGE_NOT_FOUND");
    if (participantCount > travelPackage.capacity - travelPackage.occupiedSlots) {
      throw new BadRequestException("CONTRACT_RESERVATION_CAPACITY_UNAVAILABLE");
    }
  }

  private async lockInternalTrip(
    tx: Prisma.TransactionClient,
    internalTripId: string,
    tenantId: string,
    participantCount: number,
  ): Promise<void> {
    await tx.$queryRaw`
      SELECT "id" FROM "internal_trips"
      WHERE "id" = ${internalTripId} AND "tenantId" = ${tenantId}
      FOR UPDATE
    `;
    const internalTrip = await tx.internalTrip.findFirst({
      where: { id: internalTripId, tenantId },
      select: { capacity: true, occupiedSlots: true, name: true },
    });
    if (!internalTrip) throw new NotFoundException("CONTRACT_RESERVATION_INTERNAL_TRIP_NOT_FOUND");
    if (participantCount > internalTrip.capacity - internalTrip.occupiedSlots) {
      throw new BadRequestException("CONTRACT_RESERVATION_CAPACITY_UNAVAILABLE");
    }
  }

  private async createInternationalTravelRoster(
    tx: Prisma.TransactionClient,
    contract: { clientId: string; tenantId: string; travelPackageId: string; payload: unknown },
  ): Promise<void> {
    const payload = contract.payload && typeof contract.payload === "object" && !Array.isArray(contract.payload)
      ? contract.payload as Record<string, unknown>
      : {};
    const companions = Array.isArray(payload.companions)
      ? payload.companions.filter((item: any) => item && String(item.fullName || "").trim() && String(item.idNumber || "").trim())
      : [];
    const minors = Array.isArray(payload.minors)
      ? payload.minors.filter((item: any) => item && String(item.minorName || item.name || "").trim() && String(item.minorId || item.idNumber || "").trim())
      : [];
    const companionIds = companions.map((item: any) => String(item.selectedCustomerId || "").trim());
    const minorIds = minors.map((item: any) => String(item.selectedCustomerId || "").trim());
    if ([...companionIds, ...minorIds].some((id) => !id)) {
      throw new BadRequestException("CONTRACT_RESERVATION_PARTICIPANT_IDENTITY_INVALID");
    }
    const clientIds = [contract.clientId, ...companionIds, ...minorIds];
    if (new Set(clientIds).size !== clientIds.length) {
      throw new BadRequestException("CONTRACT_RESERVATION_PARTICIPANT_DUPLICATE");
    }
    const clients = await this.participantsRepository.findClients(tx, contract.tenantId, clientIds);
    if (clients.length !== clientIds.length) {
      throw new BadRequestException("CONTRACT_RESERVATION_PARTICIPANT_TENANT_INVALID");
    }
    const participants: TravelPackageParticipantWrite[] = [
      { tenantId: contract.tenantId, travelPackageId: contract.travelPackageId, clientId: contract.clientId, role: "HOLDER" },
      ...companionIds.map((clientId) => ({ tenantId: contract.tenantId, travelPackageId: contract.travelPackageId, clientId, role: "COMPANION" as const })),
      ...minorIds.map((clientId) => ({ tenantId: contract.tenantId, travelPackageId: contract.travelPackageId, clientId, role: "MINOR" as const })),
    ];
    await this.participantsRepository.createMany(tx, participants);
  }
}

function requireParticipantCount(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value) || value < 1) {
    throw new BadRequestException("CONTRACT_RESERVATION_PARTICIPANT_COUNT_INVALID");
  }
  return value;
}

function requireCommercialTerms(contract: {
  commercialTotal: Prisma.Decimal | null;
  commercialCurrency: string | null;
  paymentConditionType: PaymentConditionType | null;
  paymentDueDate: Date | null;
  commercialTaxTreatment: PriceTaxTreatment | null;
}): { total: Prisma.Decimal; currencyCode: string; dueDate: Date | null } {
  const total = contract.commercialTotal;
  const condition = contract.paymentConditionType;
  const dueDate = contract.paymentDueDate;
  const coherentPaymentTerms =
    (condition === PaymentConditionType.CASH && dueDate === null) ||
    (condition === PaymentConditionType.CREDIT &&
      dueDate instanceof Date &&
      !Number.isNaN(dueDate.getTime()));
  if (
    !(total instanceof Prisma.Decimal) ||
    !total.isFinite() ||
    total.isNegative() ||
    total.decimalPlaces() > 5 ||
    !contract.commercialCurrency ||
    contract.commercialTaxTreatment !== PriceTaxTreatment.TAX_INCLUDED ||
    !coherentPaymentTerms
  ) {
    throw new BadRequestException("CONTRACT_COMMERCIAL_TERMS_INCOMPLETE");
  }
  return {
    total,
    currencyCode: contract.commercialCurrency,
    dueDate: condition === PaymentConditionType.CREDIT ? dueDate : null,
  };
}
