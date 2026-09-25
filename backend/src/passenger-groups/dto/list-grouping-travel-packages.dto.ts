import { TravelPackageType } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class ListGroupingTravelPackagesDto {
  @IsEnum(TravelPackageType)
  travelType!: TravelPackageType;

  @Transform(({ value }) => Number.parseInt(String(value), 10))
  @IsInt()
  @Min(1)
  page = 1;

  @Transform(({ value }) => Number.parseInt(String(value), 10))
  @IsInt()
  @Min(1)
  @Max(25)
  pageSize = 20;

  @IsOptional()
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MaxLength(160)
  search?: string;
}

export class GroupingTravelPackageSummaryDto {
  travelPackageId!: string;
  packageCode!: string;
  name!: string;
  destination!: string;
  departureDate!: Date;
  returnDate!: Date;
  status!: string;
  passengerCount!: number;
  groupedPassengerCount!: number;
  ungroupedPassengerCount!: number;
}

export class PaginatedGroupingTravelPackagesDto {
  items!: GroupingTravelPackageSummaryDto[];
  total!: number;
  page!: number;
  pageSize!: number;
  totalPages!: number;
}
