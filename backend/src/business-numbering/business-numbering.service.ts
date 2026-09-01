import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";

export interface BusinessNumberSequenceAllocation {
  tenantId: string;
  sequenceKey: string;
  year: number;
}

@Injectable()
export class BusinessNumberingService {
  async next(
    tx: Prisma.TransactionClient,
    input: BusinessNumberSequenceAllocation,
  ): Promise<bigint> {
    const tenantId = required(input.tenantId, 191);
    const sequenceKey = required(input.sequenceKey, 100);
    const year = validYear(input.year);
    const rows = await tx.$queryRaw<Array<{ currentValue: bigint }>>`
      INSERT INTO "business_number_sequences" (
        "tenantId", "sequenceKey", "year", "currentValue", "createdAt", "updatedAt"
      ) VALUES (
        ${tenantId}, ${sequenceKey}, ${year}, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
      ON CONFLICT ("tenantId", "sequenceKey", "year")
      DO UPDATE SET
        "currentValue" = "business_number_sequences"."currentValue" + 1,
        "updatedAt" = CURRENT_TIMESTAMP
      RETURNING "currentValue"
    `;
    const currentValue = rows[0]?.currentValue;
    if (typeof currentValue !== "bigint" || currentValue < 1n) {
      throw new Error("BUSINESS_NUMBER_SEQUENCE_ALLOCATION_FAILED");
    }
    return currentValue;
  }
}

function required(value: unknown, maximum: number): string {
  if (typeof value !== "string") throw new Error("BUSINESS_NUMBER_SEQUENCE_INVALID");
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum) throw new Error("BUSINESS_NUMBER_SEQUENCE_INVALID");
  return normalized;
}

function validYear(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 9999) {
    throw new Error("BUSINESS_NUMBER_SEQUENCE_INVALID");
  }
  return value;
}
