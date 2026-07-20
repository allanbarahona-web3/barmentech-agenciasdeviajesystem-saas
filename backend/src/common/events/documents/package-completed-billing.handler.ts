import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { BillingService } from "../../../billing/billing.service";
import { PrismaService } from "../../../prisma/prisma.service";
import { EventBus, EVENT_BUS } from "../event-bus";
import { EventHandler } from "../event-handler";
import { PackageCompletedEvent } from "./package-completed.event";

@Injectable()
export class PackageCompletedBillingHandler
  implements EventHandler<PackageCompletedEvent>, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PackageCompletedBillingHandler.name);

  constructor(
    @Inject(EVENT_BUS)
    private readonly eventBus: EventBus,
    private readonly prisma: PrismaService,
    private readonly billingService: BillingService,
  ) {}

  onModuleInit(): void {
    this.eventBus.subscribe(PackageCompletedEvent, this);
  }

  onModuleDestroy(): void {
    this.eventBus.unsubscribe(PackageCompletedEvent, this);
  }

  async handle(event: PackageCompletedEvent): Promise<void> {
    const { documentId } = event;

    try {
      const contract = await (this.prisma as any).contract.findUnique({
        where: { id: documentId },
      });

      if (!contract) {
        throw new NotFoundException("Contrato no encontrado.");
      }

      await this.billingService.autoIssueAndSendInvoiceToTitular({
        contractId: documentId,
        actorUserId: String(contract.generatedByUserId || "system"),
        actorEmail: String(contract.generatedByEmail || "system@local"),
        actorName: String(contract.generatedByName || "Sistema"),
      });

      this.logger.log(
        `[package-completed] Billing completed for documentId=${documentId}`,
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Fallo el auto-envio de factura al titular.";
      this.logger.error(
        `[package-completed] Billing failed for documentId=${documentId}: ${message}`,
      );
      // Continue with delivery even if billing fails
    }
  }
}
