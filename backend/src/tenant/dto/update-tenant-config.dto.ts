import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength, IsEmail, Matches, ValidateIf } from 'class-validator';

export class UpdateTenantConfigDto {
  @IsOptional()
  @ValidateIf((o) => o.accountingCurrencyCode !== null)
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toUpperCase() : value)
  @IsString()
  @Matches(/^[A-Z]{3}$/, { message: 'La moneda contable debe tener exactamente 3 letras mayúsculas.' })
  accountingCurrencyCode?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(7)
  primaryColor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(7)
  secondaryColor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  contactPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  contactWhatsApp?: string;

  @IsOptional()
  @ValidateIf((o) => o.contactEmail !== null)
  @IsEmail({}, { message: 'Email de contacto inválido' })
  @MaxLength(200)
  contactEmail?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  businessAddress?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  websiteUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  legalName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  legalId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  representativeName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  representativeId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  representativeTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  representativeMaritalStatus?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  representativeAddress?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  representativePowers?: string;

  @IsOptional()
  @ValidateIf((o) => o.fromEmail !== null)
  @IsEmail({}, { message: 'Email de envío inválido' })
  @MaxLength(200)
  fromEmail?: string | null;

  @IsOptional()
  @ValidateIf((o) => o.replyToEmail !== null)
  @IsEmail({}, { message: 'Email de respuesta inválido' })
  @MaxLength(200)
  replyToEmail?: string | null;
}
