import { IsString, IsNotEmpty, IsOptional, IsArray, IsObject } from 'class-validator';
import { EmailTemplate } from '../interfaces/email-options.interface';

/**
 * DTO para enviar emails vía API
 * (Opcional - si quieres exponer endpoint público)
 */
export class SendEmailDto {
  @IsString()
  @IsNotEmpty()
  tenantId!: string;

  @IsArray()
  @IsNotEmpty()
  to!: string[];

  @IsArray()
  @IsOptional()
  cc?: string[];

  @IsString()
  @IsNotEmpty()
  subject!: string;

  @IsString()
  @IsNotEmpty()
  template!: EmailTemplate;

  @IsObject()
  @IsNotEmpty()
  templateData!: Record<string, any>;

  @IsArray()
  @IsOptional()
  attachments?: any[];
}
