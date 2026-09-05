ALTER TABLE "payments"
DROP CONSTRAINT "payments_contract_purpose_source",
ADD CONSTRAINT "payments_contract_purpose_source" CHECK (
    "purpose" NOT IN ('CONTRACT_RESERVATION', 'CONTRACT_INSTALLMENT', 'CONTRACT_PAYMENT')
    OR "contractId" IS NOT NULL
);
