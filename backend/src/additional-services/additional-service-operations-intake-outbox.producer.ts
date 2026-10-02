import { ConflictException, Injectable, InternalServerErrorException, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  ADDITIONAL_SERVICE_ORDER_LINE_SOURCE,
  OPERATIONS_SOURCE_ITEM_APPROVED_EVENT,
} from "../operations/intake/operations-intake-outbox.constants";
import { persistOperationsIntakeOutboxEvents } from "../operations/intake/operations-intake-outbox-writer";

export {
  ADDITIONAL_SERVICE_ORDER_LINE_SOURCE,
  OPERATIONS_SOURCE_ITEM_APPROVED_EVENT,
};

@Injectable()
export class AdditionalServiceOperationsIntakeOutboxProducer {
  private readonly logger = new Logger(AdditionalServiceOperationsIntakeOutboxProducer.name);

  /**
   * Uses the caller-owned approval transaction. This is a durable handoff only;
   * it does not read or create any Operations work.
   */
  async persistApprovedOrder(
    tx: Prisma.TransactionClient,
    tenantId: string,
    additionalServiceOrderId: string,
  ): Promise<number> {
    const order = await tx.additionalServiceOrder.findFirst({
      where: {
        id: additionalServiceOrderId,
        tenantId,
        commercialStatus: "APPROVED",
        status: { not: "CANCELLED" },
      },
      select: {
        id: true,
        travelPackageId: true,
        proposalApprovedAt: true,
        lines: {
          select: { id: true, serviceDetailsVersion: true },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        },
      },
    });
    if (!order) {
      throw new ConflictException("OPERATIONS_INTAKE_APPROVED_SOURCE_INVALID");
    }
    if (!order.travelPackageId) {
      throw new ConflictException("OPERATIONS_INTAKE_TRAVEL_PACKAGE_REQUIRED");
    }
    const acceptedAt = order.proposalApprovedAt;
    if (!acceptedAt) {
      throw new ConflictException("OPERATIONS_INTAKE_ACCEPTED_AT_REQUIRED");
    }

    const events = order.lines.map((line) => ({
      tenantId,
      travelPackageId: order.travelPackageId!,
      eventType: OPERATIONS_SOURCE_ITEM_APPROVED_EVENT,
      eventVersion: 1,
      sourceType: ADDITIONAL_SERVICE_ORDER_LINE_SOURCE,
      sourceId: order.id,
      sourceLineId: line.id,
      sourceVersionId: line.serviceDetailsVersion === null ? null : String(line.serviceDetailsVersion),
      // The initial availability is the authoritative commercial acceptance
      // instant. A future retry worker may move it for scheduling purposes.
      availableAt: acceptedAt,
    }));
    if (events.length === 0) return 0;

    let persisted: { count: number };
    try {
      persisted = await persistOperationsIntakeOutboxEvents(tx, events);
    } catch {
      throw new InternalServerErrorException({
        code: "OPERATIONS_INTAKE_OUTBOX_PERSISTENCE_FAILED",
        message: "No se pudo registrar el trabajo operativo aprobado.",
      });
    }
    this.logger.log({
      event: "additional-service-operations-intake-events-prepared",
      tenantId,
      travelPackageId: order.travelPackageId,
      additionalServiceOrderId: order.id,
      eventCount: events.length,
      insertedCount: persisted.count,
      idempotentReplay: persisted.count !== events.length,
    });
    return persisted.count;
  }
}
