import { PaymentAllocationStatus, PaymentStatus, Prisma } from "@prisma/client";

const MAX_AMOUNT = new Prisma.Decimal("99999999999999.99999");

/** Exact non-terminal cancellation predicate shared by command and read model. */
export function canCancelPayment(
  payment: { status: PaymentStatus; cancelledAt: Date | null; receivedAmount: Prisma.Decimal; availableAmount: Prisma.Decimal },
  allocations: ReadonlyArray<{ status: PaymentAllocationStatus }>,
): boolean {
  return payment.status === PaymentStatus.RECEIVED && payment.cancelledAt === null &&
    validPositiveAmount(payment.receivedAmount) && validNonNegativeAmount(payment.availableAmount) &&
    payment.availableAmount.equals(payment.receivedAmount) &&
    !allocations.some((allocation) => allocation.status === PaymentAllocationStatus.ACTIVE);
}

function validPositiveAmount(value: unknown): value is Prisma.Decimal { return validNonNegativeAmount(value) && !value.isZero(); }
function validNonNegativeAmount(value: unknown): value is Prisma.Decimal { return value instanceof Prisma.Decimal && value.isFinite() && !value.isNegative() && value.decimalPlaces() <= 5 && value.lessThanOrEqualTo(MAX_AMOUNT); }
