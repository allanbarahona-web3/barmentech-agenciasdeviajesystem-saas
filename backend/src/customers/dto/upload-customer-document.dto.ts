import { IsEnum } from 'class-validator';
import { CustomerDocumentCategory } from '@prisma/client';

export class UploadCustomerDocumentDto {
  @IsEnum(CustomerDocumentCategory)
  category!: CustomerDocumentCategory;
}
