import { IsNotEmpty, IsOptional, IsString, IsUrl, Matches } from "class-validator";

const MONEY_PATTERN = /^\d+(?:\.\d{1,5})?$/;

export class RegisterAirfareDailyAuthorityDto {
  @IsString()
  @Matches(MONEY_PATTERN)
  observedAmount!: string;

  @IsOptional()
  @IsString()
  sourceReference?: string | null;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  sourceUrl?: string | null;

  @IsOptional()
  @IsString()
  reason?: string | null;
}

export class OverrideAirfareDailyAuthorityDto extends RegisterAirfareDailyAuthorityDto {
  @IsString()
  @IsNotEmpty()
  overrideReason!: string;
}
