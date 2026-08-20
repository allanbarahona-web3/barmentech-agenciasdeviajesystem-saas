import { Inject, Injectable } from "@nestjs/common";
import { fiscalBillingAdminError } from "./fiscal-billing-admin.errors";
import {
  FISCAL_ISSUER_ADMIN_REPOSITORY,
  FiscalIssuerAdminRepository,
} from "./fiscal-issuer-admin.repository";
import {
  FACTURA_EN_CR_NUMBERING_PROVIDER,
  FacturaEnCrNumberingProvider,
  FacturaEnCrNumberingProviderError,
} from "./factura-en-cr-numbering.provider";
import type { FiscalIssuerRecord } from "./fiscal-issuer-admin.types";

const VERIFICATION_DOCUMENT_TYPE = "01";

@Injectable()
export class ProviderNumberingAdminService {
  constructor(
    @Inject(FISCAL_ISSUER_ADMIN_REPOSITORY)
    private readonly issuerRepository: FiscalIssuerAdminRepository,
    @Inject(FACTURA_EN_CR_NUMBERING_PROVIDER)
    private readonly provider: FacturaEnCrNumberingProvider,
  ) {}

  async configureAndVerify(tenantId: string, issuerId: string) {
    const issuer = await this.issuerRepository.find(tenantId, issuerId);
    if (!issuer) throw fiscalBillingAdminError("FISCAL_ISSUER_NOT_FOUND");
    if (
      issuer.countryCode !== "CR" ||
      !/^\d{3}$/.test(issuer.establishmentCode ?? "") ||
      !/^\d{5}$/.test(issuer.terminalCode ?? "")
    ) {
      throw fiscalBillingAdminError("PROVIDER_NUMBERING_ISSUER_NOT_READY");
    }

    const input = {
      legalId: issuer.identificationNumber,
      branchCode: issuer.establishmentCode!,
      terminalCode: issuer.terminalCode!,
    };
    try {
      const configured = await this.provider.configureIntegratorMode(input);
      if (
        configured.legalId !== input.legalId ||
        configured.mode !== "integrator" ||
        configured.branchCode !== input.branchCode ||
        configured.terminalCode !== input.terminalCode
      ) {
        throw fiscalBillingAdminError(
          "PROVIDER_NUMBERING_VERIFICATION_MISMATCH",
        );
      }

      const verified = await this.verifyIssuerIntegratorMode(
        issuer,
        VERIFICATION_DOCUMENT_TYPE,
      );

      return {
        issuerId,
        mode: "integrator" as const,
        branchCode: input.branchCode,
        terminalCode: input.terminalCode,
        verificationDocumentTypeCode: VERIFICATION_DOCUMENT_TYPE,
        currentNumber: String(verified.currentNumber),
        nextNumber: String(verified.nextNumber),
        nextConsecutivo20: verified.nextConsecutivo20,
        verified: true as const,
      };
    } catch (error) {
      if (error instanceof FacturaEnCrNumberingProviderError) {
        throw fiscalBillingAdminError(error.code);
      }
      throw error;
    }
  }

  async verifyIssuerIntegratorMode(
    issuer: FiscalIssuerRecord,
    documentTypeCode: string,
  ) {
    const legalId = issuer.identificationNumber;
    const branchCode = issuer.establishmentCode ?? "";
    const terminalCode = issuer.terminalCode ?? "";
    try {
      const verified = await this.provider.verifyIntegratorMode({
        legalId,
        branchCode,
        terminalCode,
        documentTypeCode,
      });
      const prefix = `${branchCode}${terminalCode}${documentTypeCode}`;
      if (
        verified.mode !== "integrator" ||
        verified.legalId !== legalId ||
        verified.branchCode !== branchCode ||
        verified.terminalCode !== terminalCode ||
        verified.documentTypeCode !== documentTypeCode ||
        !new RegExp(`^${prefix}[0-9A-Za-z]{10}$`).test(
          verified.nextConsecutivo20,
        )
      ) {
        throw fiscalBillingAdminError(
          "PROVIDER_NUMBERING_VERIFICATION_MISMATCH",
        );
      }
      return verified;
    } catch (error) {
      if (error instanceof FacturaEnCrNumberingProviderError) {
        throw fiscalBillingAdminError(error.code);
      }
      throw error;
    }
  }
}
