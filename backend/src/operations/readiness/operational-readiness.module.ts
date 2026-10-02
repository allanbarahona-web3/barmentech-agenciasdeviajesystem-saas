import { Module } from "@nestjs/common";
import { OperationalReadinessController } from "./operational-readiness.controller";
import { OperationalReadinessService } from "./operational-readiness.service";
import { OperationalTravelPackageSummariesController } from "./operational-travel-package-summaries.controller";
import { OperationalTravelPackageSummariesService } from "./operational-travel-package-summaries.service";
import { OperationalPassengerOverviewController } from "./operational-passenger-overview.controller";
import { OperationalPassengerOverviewService } from "./operational-passenger-overview.service";
import { ContractsModule } from "../../contracts/contracts.module";
import { FinanceModule } from "../../finance/finance.module";
import { AdditionalServicesModule } from "../../additional-services";
import { OperationalWorkItemsController } from "./operational-work-items.controller";
import { OperationalWorkItemsService } from "./operational-work-items.service";
import { OperationalPassengerRosterController } from "./operational-passenger-roster.controller";
import { OperationalPassengerRosterService } from "./operational-passenger-roster.service";
import { OperationalPassengerCommercialContextController } from "./operational-passenger-commercial-context.controller";
import { OperationalPassengerCommercialContextService } from "./operational-passenger-commercial-context.service";

@Module({ imports: [ContractsModule, FinanceModule, AdditionalServicesModule], controllers: [OperationalReadinessController, OperationalTravelPackageSummariesController, OperationalPassengerOverviewController, OperationalPassengerRosterController, OperationalPassengerCommercialContextController, OperationalWorkItemsController], providers: [OperationalReadinessService, OperationalTravelPackageSummariesService, OperationalPassengerOverviewService, OperationalPassengerRosterService, OperationalPassengerCommercialContextService, OperationalWorkItemsService] })
export class OperationalReadinessModule {}
