import { IsString, IsNotEmpty, IsOptional, IsEmail, MinLength, Matches } from 'class-validator';

export class CreateTenantDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-z0-9-]+$/, {
    message: 'El subdomain debe contener solo letras minúsculas, números y guiones',
  })
  subdomain!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^[A-Z]{3}$/, {
    message: 'El contractPrefix debe ser exactamente 3 letras mayúsculas',
  })
  contractPrefix!: string;

  @IsString()
  @IsOptional()
  customDomain?: string;

  // Datos del admin inicial del tenant
  @IsEmail()
  @IsNotEmpty()
  adminEmail!: string;

  @IsString()
  @IsNotEmpty()
  adminFullName!: string;

  @IsString()
  @MinLength(8)
  @IsNotEmpty()
  adminPassword!: string;
}
