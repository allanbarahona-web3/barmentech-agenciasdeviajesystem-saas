/**
 * CustomerListItemDto
 * 
 * Response DTO for individual customer in list.
 * Contains only essential customer information.
 */
export class CustomerListItemDto {
  id!: string;
  fullName!: string;
  idNumber!: string;
  email!: string | null;
  phone!: string | null;
  createdAt!: Date;
}
