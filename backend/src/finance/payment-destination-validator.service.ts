import { Injectable } from "@nestjs/common";
import { CompanyBankAccountsService } from "../company-bank-accounts/company-bank-accounts.service";

export type PaymentDestinationValidationStatus = "MATCHED" | "UNMATCHED" | "UNKNOWN" | "AMBIGUOUS";
export type PaymentDestinationValidationReason = "NOT_REGISTERED" | "INACTIVE" | "AMBIGUOUS" | "NO_IDENTIFIER";

type RegisteredPaymentDestination = {
  id: string;
  bankName: string;
  accountNumber: string;
  sinpeNumber: string | null;
  currency: string;
  isActive: boolean;
};

export type PaymentDestinationValidationResult = {
  status: PaymentDestinationValidationStatus;
  reason?: PaymentDestinationValidationReason;
  matchedAccount?: {
    id: string;
    bankName: string;
    maskedAccountNumber: string;
    maskedSinpeNumber: string | null;
    currencyCode: string;
  };
  bankNameMatches?: boolean | null;
};

@Injectable()
export class PaymentDestinationValidator {
  constructor(private readonly accounts: CompanyBankAccountsService) {}

  async validate(input: {
    tenantId: string;
    extractedDestinationAccount?: string | null;
    extractedSinpePhone?: string | null;
    extractedBankName?: string | null;
  }): Promise<PaymentDestinationValidationResult> {
    const identifiers = new Set([
      normalizeAccountIdentifier(input.extractedDestinationAccount),
      normalizeSinpeIdentifier(input.extractedSinpePhone),
    ].filter((value): value is string => Boolean(value)));
    if (!identifiers.size) return { status: "UNKNOWN", reason: "NO_IDENTIFIER" };

    const accounts = await this.accounts.listDestinationValidationAccounts(input.tenantId) as RegisteredPaymentDestination[];
    const matches = accounts.filter((account) => {
      const accountIdentifier = normalizeAccountIdentifier(account.accountNumber);
      const sinpeIdentifier = normalizeSinpeIdentifier(account.sinpeNumber);
      return (accountIdentifier !== null && identifiers.has(accountIdentifier)) ||
        (sinpeIdentifier !== null && identifiers.has(sinpeIdentifier));
    });
    if (matches.length > 1) return { status: "AMBIGUOUS", reason: "AMBIGUOUS" };
    if (!matches.length) return { status: "UNMATCHED", reason: "NOT_REGISTERED" };

    const account = matches[0]!;
    const matchedAccount = safeAccount(account);
    if (!account.isActive) return {
      status: "UNMATCHED",
      reason: "INACTIVE",
      matchedAccount,
      bankNameMatches: bankNamesMatch(input.extractedBankName, account.bankName),
    };
    return {
      status: "MATCHED",
      matchedAccount,
      bankNameMatches: bankNamesMatch(input.extractedBankName, account.bankName),
    };
  }
}

export function normalizeAccountIdentifier(value: unknown): string | null {
  const normalized = String(value ?? "").trim().toUpperCase().replace(/[\s-]/g, "");
  return normalized || null;
}

export function normalizeSinpeIdentifier(value: unknown): string | null {
  const normalized = String(value ?? "").trim().replace(/[\s-]/g, "");
  return normalized || null;
}

function safeAccount(account: RegisteredPaymentDestination) {
  return {
    id: account.id,
    bankName: account.bankName,
    maskedAccountNumber: mask(account.accountNumber),
    maskedSinpeNumber: account.sinpeNumber ? mask(account.sinpeNumber) : null,
    currencyCode: account.currency,
  };
}

function mask(value: string): string {
  const normalized = String(value ?? "").replace(/[\s-]/g, "");
  return normalized.length <= 4 ? "****" : `****${normalized.slice(-4)}`;
}

function bankNamesMatch(extracted: string | null | undefined, registered: string): boolean | null {
  const left = normalizeBankName(extracted);
  const right = normalizeBankName(registered);
  return left && right ? left === right : null;
}

function normalizeBankName(value: string | null | undefined): string | null {
  const normalized = String(value ?? "").trim().toUpperCase().replace(/\s+/g, " ");
  return normalized || null;
}
