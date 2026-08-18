import { Transform } from "class-transformer";
import {
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from "class-validator";

const trimString = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;

export class UpdateTenantBillingConfigurationDto {
  @IsOptional()
  @IsBoolean()
  billingEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  externalRegistrationEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  electronicIssuanceEnabled?: boolean;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{2}$/, {
    message: "countryCode debe contener exactamente dos letras ASCII mayúsculas.",
  })
  countryCode?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{3}$/, {
    message:
      "defaultCurrencyCode debe contener exactamente tres letras ASCII mayúsculas.",
  })
  defaultCurrencyCode?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(100)
  @Matches(/\S/, { message: "fiscalTimezone no puede estar vacío." })
  fiscalTimezone?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(20)
  @Matches(/\S/, { message: "fiscalSchemaVersion no puede estar vacío." })
  fiscalSchemaVersion?: string;
}
