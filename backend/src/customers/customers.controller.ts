import { Controller } from "@nestjs/common";
import { CustomersService } from "./customers.service";

/**
 * CustomersController
 * 
 * Purpose:
 * - Establish module structure
 * - Future: Expose customer operations via REST
 * 
 * Currently empty - no endpoints implemented in Sprint 1.
 * Future sprints will add customer CRUD operations here.
 */
@Controller("customers")
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  // Future endpoints will be added here:
  // - POST /customers/upsert
  // - GET /customers/:id
  // - GET /customers/search
  // - PUT /customers/:id
  // - DELETE /customers/:id
}
