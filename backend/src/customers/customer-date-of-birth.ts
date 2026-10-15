import { BadRequestException } from "@nestjs/common";

type DateOnlyInput = Date | string;

type DateOnlyParts = {
  year: number;
  month: number;
  day: number;
};

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Normalizes an optional customer birth date for a PostgreSQL DATE column.
 * It deliberately parses calendar parts instead of using Date string parsing.
 */
export function normalizeDateOfBirthForPersistence(
  value: string | null | undefined,
  referenceDate: DateOnlyInput,
): Date | null | undefined {
  if (value === undefined || value === null) return value;

  const birthDate = parseDateOnly(value, "CUSTOMER_DATE_OF_BIRTH_INVALID");
  const reference = parseDateOnly(referenceDate, "CUSTOMER_DATE_REFERENCE_INVALID");
  if (compareDateOnly(birthDate, reference) > 0) {
    throw new BadRequestException("CUSTOMER_DATE_OF_BIRTH_FUTURE");
  }

  return toUtcDate(birthDate);
}

/** Returns a stable YYYY-MM-DD value for a date-only database field. */
export function formatDateOnly(value: DateOnlyInput): string {
  return formatParts(parseDateOnly(value, "CUSTOMER_DATE_ONLY_INVALID"));
}

/**
 * Derives age at an explicit calendar reference date. Neither input is parsed
 * through the host timezone and this helper never reads the system clock.
 */
export function calculateAge(
  dateOfBirth: DateOnlyInput,
  referenceDate: DateOnlyInput,
): number {
  const birth = parseDateOnly(dateOfBirth, "CUSTOMER_DATE_OF_BIRTH_INVALID");
  const reference = parseDateOnly(referenceDate, "CUSTOMER_DATE_REFERENCE_INVALID");
  if (compareDateOnly(reference, birth) < 0) {
    throw new BadRequestException("CUSTOMER_AGE_REFERENCE_BEFORE_BIRTH");
  }

  return reference.year - birth.year - (
    reference.month < birth.month ||
    (reference.month === birth.month && reference.day < birth.day)
      ? 1
      : 0
  );
}

function parseDateOnly(value: DateOnlyInput, errorCode: string): DateOnlyParts {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new BadRequestException(errorCode);
    return validateParts(
      { year: value.getUTCFullYear(), month: value.getUTCMonth() + 1, day: value.getUTCDate() },
      errorCode,
    );
  }

  const match = DATE_ONLY_PATTERN.exec(value);
  if (!match) throw new BadRequestException(errorCode);
  return validateParts(
    { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) },
    errorCode,
  );
}

function validateParts(value: DateOnlyParts, errorCode: string): DateOnlyParts {
  const candidate = new Date(Date.UTC(value.year, value.month - 1, value.day));
  if (
    candidate.getUTCFullYear() !== value.year ||
    candidate.getUTCMonth() !== value.month - 1 ||
    candidate.getUTCDate() !== value.day
  ) {
    throw new BadRequestException(errorCode);
  }
  return value;
}

function compareDateOnly(left: DateOnlyParts, right: DateOnlyParts): number {
  return (
    left.year - right.year ||
    left.month - right.month ||
    left.day - right.day
  );
}

function formatParts({ year, month, day }: DateOnlyParts): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function toUtcDate({ year, month, day }: DateOnlyParts): Date {
  return new Date(Date.UTC(year, month - 1, day));
}
