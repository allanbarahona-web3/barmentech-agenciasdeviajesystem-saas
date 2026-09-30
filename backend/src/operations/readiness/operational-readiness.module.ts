import { Module } from "@nestjs/common";
import { OperationalReadinessController } from "./operational-readiness.controller";
import { OperationalReadinessService } from "./operational-readiness.service";

@Module({ controllers: [OperationalReadinessController], providers: [OperationalReadinessService] })
export class OperationalReadinessModule {}
