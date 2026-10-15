import { Module } from "@nestjs/common";
import { CustomersModule } from "../../customers/customers.module";
import { OperationalPassengerDocumentsController } from "./operational-passenger-documents.controller";
import { OperationalPassengerDocumentsService } from "./operational-passenger-documents.service";

@Module({
  imports: [CustomersModule],
  controllers: [OperationalPassengerDocumentsController],
  providers: [OperationalPassengerDocumentsService],
})
export class OperationalPassengerDocumentsModule {}
