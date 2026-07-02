import { CustomerListItemDto } from "./customer-list-item.dto";

/**
 * CustomerListResponseDto
 * 
 * Paginated response for customer list endpoint.
 */
export class CustomerListResponseDto {
  customers!: CustomerListItemDto[];
  total!: number;
  page!: number;
  pageSize!: number;
  totalPages!: number;
}
