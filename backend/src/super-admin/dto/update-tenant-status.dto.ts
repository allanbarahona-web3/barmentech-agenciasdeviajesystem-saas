import { IsEnum, IsOptional, IsString } from 'class-validator';

export enum TenantStatusAction {
  ACTIVATE = 'ACTIVATE',
  SUSPEND = 'SUSPEND',
}

export class UpdateTenantStatusDto {
  @IsEnum(TenantStatusAction)
  action!: TenantStatusAction;

  @IsString()
  @IsOptional()
  reason?: string;
}
