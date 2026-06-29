import { IsString, IsEmail, IsOptional, IsDateString, IsEnum, IsNumber, Min } from 'class-validator';
import { EmployeeStatus, EmploymentType } from '@prisma/client';

export class CreateEmployeeDto {
  @IsString()
  fullName!: string;

  @IsString()
  documentId!: string; // Cédula

  @IsOptional()
  @IsDateString()
  dateOfBirth?: string; // Fecha de nacimiento

  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsDateString()
  hireDate!: string;

  @IsEnum(EmploymentType)
  employmentType!: EmploymentType;

  @IsString()
  position!: string; // Puesto

  @IsOptional()
  @IsString()
  department?: string;

  @IsNumber()
  @Min(0)
  monthlySalary!: number; // Salario mensual

  @IsOptional()
  @IsEnum(EmployeeStatus)
  status?: EmployeeStatus;

  @IsOptional()
  @IsDateString()
  terminationDate?: string;
}
