import { Module } from "@nestjs/common";
import { AdditionalServicesModule } from "../../additional-services/additional-services.module";
import { OperationalRequirementsController } from "./operational-requirements.controller";
import { OperationalRequirementsService } from "./operational-requirements.service";
import { OperationalWorkMaterializer } from "../intake/operational-work-materializer.service";
import { OperationsIntakeOutboxWorkerService } from "../intake/operations-intake-outbox-worker.service";
import { OperationsIntakeReconciliationService } from "../intake/operations-intake-reconciliation.service";

@Module({
  imports: [AdditionalServicesModule],
  controllers: [OperationalRequirementsController],
  providers: [OperationalRequirementsService, OperationalWorkMaterializer, OperationsIntakeOutboxWorkerService, OperationsIntakeReconciliationService],
  exports: [OperationalRequirementsService, OperationalWorkMaterializer, OperationsIntakeOutboxWorkerService, OperationsIntakeReconciliationService],
})
export class OperationalRequirementsModule {}
