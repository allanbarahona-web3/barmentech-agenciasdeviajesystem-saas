import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsString,
  ValidateNested,
} from "class-validator";
import { CalculateAdditionalServicePriceDto } from "./calculate-additional-service-price.dto";

export const MAX_ADDITIONAL_SERVICE_PRICING_BATCH_LINES = 100;

export class CalculateAdditionalServicePriceBatchLineDto extends CalculateAdditionalServicePriceDto {
  @IsString()
  @IsNotEmpty()
  lineId!: string;
}

export class CalculateManyAdditionalServicePricesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_ADDITIONAL_SERVICE_PRICING_BATCH_LINES)
  @ValidateNested({ each: true })
  @Type(() => CalculateAdditionalServicePriceBatchLineDto)
  lines!: CalculateAdditionalServicePriceBatchLineDto[];
}
