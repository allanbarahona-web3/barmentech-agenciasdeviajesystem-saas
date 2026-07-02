import { Module } from "@nestjs/common";
import { CustomersService } from "./customers.service";
import { CustomersController } from "./customers.controller";

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
  controllers: [CustomersController],
  providers: [CustomersService],
  exports: [CustomersService], // Export for ContractsModule
})
export class CustomersModule {}
