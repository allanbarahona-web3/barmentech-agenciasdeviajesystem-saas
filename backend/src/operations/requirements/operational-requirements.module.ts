import { Module } from "@nestjs/common";
import { AdditionalServicesModule } from "../../additional-services/additional-services.module";
import { CustomQuotationsModule } from "../../custom-quotations/custom-quotations.module";
import { FinanceModule } from "../../finance/finance.module";
import { OperationalRequirementsController } from "./operational-requirements.controller";
import { OperationalStandaloneRequirementsController } from "./operational-standalone-requirements.controller";
import { OperationalRequirementsService } from "./operational-requirements.service";
import { OperationalWorkMaterializer } from "../intake/operational-work-materializer.service";
import { OperationsIntakeOutboxWorkerService } from "../intake/operations-intake-outbox-worker.service";
import { OperationsIntakeReconciliationService } from "../intake/operations-intake-reconciliation.service";
import { OPERATIONAL_WORK_SOURCE_READER } from "../intake/operational-work-source-reader.port";
import { CompositeOperationalWorkSourceReader } from "../intake/composite-operational-work-source-reader";
import { TravelPackageCostComponentOperationalWorkSourceAdapter } from "../intake/travel-package-cost-component-operational-work-source.adapter";
import { PrismaContractedTravelPackageRosterReader } from "../intake/prisma-contracted-travel-package-roster-reader";
import { OPERATIONAL_CONTRACTED_TRAVEL_PACKAGE_ROSTER_READER } from "../intake/contracted-travel-package-roster-reader.port";
import {
  TRAVEL_PACKAGE_COST_COMPONENT_RECONCILIATION_READER,
  TravelPackageCostComponentOperationalWorkSourceReconciliationAdapter,
} from "../intake/travel-package-cost-component-operational-work-source-reconciliation.adapter";

@Module({
  imports: [AdditionalServicesModule, CustomQuotationsModule, FinanceModule],
  controllers: [OperationalRequirementsController, OperationalStandaloneRequirementsController],
  providers: [
    OperationalRequirementsService,
    OperationalWorkMaterializer,
    OperationsIntakeOutboxWorkerService,
    OperationsIntakeReconciliationService,
    PrismaContractedTravelPackageRosterReader,
    TravelPackageCostComponentOperationalWorkSourceAdapter,
    TravelPackageCostComponentOperationalWorkSourceReconciliationAdapter,
    CompositeOperationalWorkSourceReader,
    { provide: OPERATIONAL_CONTRACTED_TRAVEL_PACKAGE_ROSTER_READER, useExisting: PrismaContractedTravelPackageRosterReader },
    { provide: TRAVEL_PACKAGE_COST_COMPONENT_RECONCILIATION_READER, useExisting: TravelPackageCostComponentOperationalWorkSourceReconciliationAdapter },
    { provide: OPERATIONAL_WORK_SOURCE_READER, useExisting: CompositeOperationalWorkSourceReader },
  ],
  exports: [
    OperationalRequirementsService,
    OperationalWorkMaterializer,
    OperationsIntakeOutboxWorkerService,
    OperationsIntakeReconciliationService,
    OPERATIONAL_CONTRACTED_TRAVEL_PACKAGE_ROSTER_READER,
  ],
})
export class OperationalRequirementsModule {}
