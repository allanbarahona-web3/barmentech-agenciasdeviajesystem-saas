import { EmployeeStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListPaginatedEmployeesDto {
  @Transform(({ value }) => Number.parseInt(String(value), 10))
  @IsInt()
  @Min(1)
  page = 1;

  @Transform(({ value }) => Number.parseInt(String(value), 10))
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 25;

  @IsOptional()
  @IsEnum(EmployeeStatus)
  status?: EmployeeStatus;

  @IsOptional()
  @IsString()
  position?: string;

  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsString()
  search?: string;
}

export class EmployeeListItemDto {
  id!: string;
  fullName!: string;
  documentId!: string;
  position!: string;
  department!: string | null;
  status!: EmployeeStatus;
}

export class PaginatedEmployeesResponseDto {
  items!: EmployeeListItemDto[];
  total!: number;
  page!: number;
  pageSize!: number;
  totalPages!: number;
}
