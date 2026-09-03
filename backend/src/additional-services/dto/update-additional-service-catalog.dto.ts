import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Min,
} from "class-validator";
import {
  ADDITIONAL_SERVICE_CATALOG_USAGE_TYPES,
  AdditionalServiceCatalogUsageType,
} from "../catalog-usage";

export class UpdateAdditionalServiceCatalogDto {
  @IsOptional()
  @IsString()
  @Matches(/\S/, { message: "code no puede estar vacío." })
  code?: string;

  @IsOptional()
  @IsString()
  @Matches(/\S/, { message: "name no puede estar vacío." })
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  displayOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsIn(["SERVICE", "MERCHANDISE"])
  fiscalItemCategory?: "SERVICE" | "MERCHANDISE";

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsIn(ADDITIONAL_SERVICE_CATALOG_USAGE_TYPES, { each: true })
  usages?: AdditionalServiceCatalogUsageType[];
}
