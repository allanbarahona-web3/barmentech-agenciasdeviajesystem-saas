import { Module } from "@nestjs/common";
import { OperationalRequirementsModule } from "./requirements/operational-requirements.module";
import { OperationalFulfillmentsModule } from "./fulfillments/operational-fulfillments.module";
import { OperationalPurchasesModule } from "./purchases/operational-purchases.module";
import { OperationalEvidenceModule } from "./evidence/operational-evidence.module";
import { OperationalReadinessModule } from "./readiness/operational-readiness.module";

@Module({ imports: [OperationalRequirementsModule, OperationalFulfillmentsModule, OperationalPurchasesModule, OperationalEvidenceModule, OperationalReadinessModule] })
export class OperationsModule {}
