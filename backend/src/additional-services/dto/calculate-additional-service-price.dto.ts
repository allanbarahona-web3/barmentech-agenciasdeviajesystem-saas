import { Type } from "class-transformer";
import {
  IsNotEmpty,
  IsNumber,
  IsString,
} from "class-validator";
import { PricingCurrency } from "../../pricing-engine";

export class CalculateAdditionalServicePriceDto {
  @IsString()
  @IsNotEmpty()
  serviceCode!: string;

  @Type(() => Number)
  @IsNumber()
  supplierCost!: number;

  @IsString()
  costCurrency!: PricingCurrency;
}
