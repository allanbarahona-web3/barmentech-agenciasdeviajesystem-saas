import { IsString, IsNotEmpty, IsOptional, Matches } from 'class-validator';

export class UpdateTenantDto {
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
}
