import { ConflictException, Injectable, InternalServerErrorException, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  CUSTOM_QUOTATION_LINE_SOURCE,
  OPERATIONS_SOURCE_ITEM_APPROVED_EVENT,
} from "../operations/intake/operations-intake-outbox.constants";
import { persistOperationsIntakeOutboxEvents } from "../operations/intake/operations-intake-outbox-writer";

export { CUSTOM_QUOTATION_LINE_SOURCE, OPERATIONS_SOURCE_ITEM_APPROVED_EVENT };

@Injectable()
export class CustomQuotationOperationsIntakeOutboxProducer {
  private readonly logger = new Logger(CustomQuotationOperationsIntakeOutboxProducer.name);

  /**
   * The SalesOrder materialization transaction owns this durable handoff. It
   * never materializes Operations work and reads only accepted version lines.
   */
  async persistMaterializedVersion(
    tx: Prisma.TransactionClient,
    tenantId: string,
    versionId: string,
  ): Promise<number> {
    const version = await tx.customQuotationVersion.findFirst({
      where: {
        id: versionId,
        tenantId,
        status: "ACCEPTED",
        acceptedAt: { not: null },
        salesOrderId: { not: null },
        customQuotation: { status: "ACCEPTED", customerId: { not: null } },
      },
      select: {
        id: true,
        status: true,
        acceptedAt: true,
        salesOrderId: true,
        customQuotation: { select: { status: true, customerId: true } },
        lines: { select: { id: true }, orderBy: [{ displayOrder: "asc" }, { id: "asc" }] },
      },
    });
    if (
      !version
      || version.status !== "ACCEPTED"
      || !version.acceptedAt
      || !version.salesOrderId
      || version.customQuotation.status !== "ACCEPTED"
      || !version.customQuotation.customerId
    ) {
      throw new ConflictException("OPERATIONS_INTAKE_CUSTOM_QUOTATION_SOURCE_INVALID");
    }
    if (version.lines.length === 0) {
      throw new ConflictException("OPERATIONS_INTAKE_CUSTOM_QUOTATION_LINES_EMPTY");
    }

    const events = version.lines.map((line) => ({
      tenantId,
      scopeType: "STANDALONE_CUSTOMER" as const,
      travelPackageId: null,
      customerId: version.customQuotation.customerId,
      eventType: OPERATIONS_SOURCE_ITEM_APPROVED_EVENT,
      eventVersion: 1,
      sourceType: CUSTOM_QUOTATION_LINE_SOURCE,
      sourceId: version.id,
      sourceLineId: line.id,
      sourceVersionId: version.id,
      availableAt: version.acceptedAt!,
    }));
    try {
      const persisted = await persistOperationsIntakeOutboxEvents(tx, events);
      this.logger.log({
        event: "custom-quotation-operations-intake-events-prepared",
        tenantId,
        customQuotationVersionId: version.id,
        customerId: version.customQuotation.customerId,
        eventCount: events.length,
        insertedCount: persisted.count,
        idempotentReplay: persisted.count !== events.length,
      });
      return persisted.count;
    } catch {
      throw new InternalServerErrorException({
        code: "OPERATIONS_INTAKE_OUTBOX_PERSISTENCE_FAILED",
        message: "No se pudo registrar el trabajo operativo de la cotización.",
      });
    }
  }
}
