import { IsOptional, IsString, MaxLength, IsEmail, ValidateIf } from 'class-validator';

export class UpdateTenantConfigDto {
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
