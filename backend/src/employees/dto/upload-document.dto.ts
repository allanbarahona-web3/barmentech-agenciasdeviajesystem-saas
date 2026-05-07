import { IsString, IsEnum, IsOptional } from 'class-validator';
import { EmployeeDocumentType } from '@prisma/client';

export class UploadDocumentDto {
  @IsEnum(EmployeeDocumentType)
  documentType!: EmployeeDocumentType;

  @IsOptional()
  @IsString()
  notes?: string;
}
