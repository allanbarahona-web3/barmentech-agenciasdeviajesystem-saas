ALTER TABLE "payments"
ALTER COLUMN "receiptNumber" DROP NOT NULL,
ADD CONSTRAINT "payments_receipt_number_state_coherence" CHECK (
    (
        "status" IN ('PENDING_VERIFICATION', 'REJECTED')
        AND "receiptNumber" IS NULL
    )
    OR (
        "status" IN ('RECEIVED', 'PARTIALLY_ALLOCATED', 'FULLY_ALLOCATED')
        AND "receiptNumber" IS NOT NULL
    )
    OR "status" = 'CANCELLED'
);
