import { Module } from "@nestjs/common";
import { OperationalRequirementsController } from "./operational-requirements.controller";
import { OperationalRequirementsService } from "./operational-requirements.service";

@Module({
  controllers: [OperationalRequirementsController],
  providers: [OperationalRequirementsService],
  exports: [OperationalRequirementsService],
})
export class OperationalRequirementsModule {}
