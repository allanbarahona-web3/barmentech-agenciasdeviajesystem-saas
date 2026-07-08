import { Module } from "@nestjs/common";
import { CustomersService } from "./customers.service";
import { CustomersController } from "./customers.controller";
import { CustomerDocumentsService } from "./documents/customer-documents.service";
import { StorageModule } from "../storage/storage.module";

/**
 * CustomersModule
 * 
 * Complete NestJS module structure:
 * - Controller: Entry point (currently empty)
 * - Provider (Service): Business logic
 * - Export: CustomersService available to other modules
 * 
 * Dependency injection pattern:
 * - PrismaService injected into CustomersService
 * - CustomersModule imported by ContractsModule
 * - CustomersService available in ContractsService via DI
 */
@Module({
  imports: [StorageModule],
  controllers: [CustomersController],
  providers: [CustomersService, CustomerDocumentsService],
  exports: [CustomersService, CustomerDocumentsService], // Export for other modules
})
export class CustomersModule {}
