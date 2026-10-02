import { Transform } from "class-transformer";
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

export class ListOperationalPassengerRosterDto {
  @Transform(({ value }) => Number.parseInt(String(value), 10)) @IsInt() @Min(1)
  page = 1;

  @Transform(({ value }) => Number.parseInt(String(value), 10)) @IsInt() @Min(1) @Max(25)
  pageSize = 20;

  @IsOptional() @Transform(({ value }) => typeof value === "string" ? value.trim() : value) @IsString() @MaxLength(160)
  search?: string;
}
