import { Module } from "@nestjs/common";
import { PassengerGroupsController } from "./passenger-groups.controller";
import { PassengerGroupsService } from "./passenger-groups.service";

@Module({
  controllers: [PassengerGroupsController],
  providers: [PassengerGroupsService],
  exports: [PassengerGroupsService],
})
export class PassengerGroupsModule {}
