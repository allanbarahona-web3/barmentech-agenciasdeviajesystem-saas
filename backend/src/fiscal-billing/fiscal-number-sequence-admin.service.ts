import { Inject, Injectable } from "@nestjs/common";
import { fiscalBillingAdminError } from "./fiscal-billing-admin.errors";
import {
  FISCAL_ISSUER_ADMIN_REPOSITORY,
  FiscalIssuerAdminRepository,
} from "./fiscal-issuer-admin.repository";
import type { FiscalIssuerRecord } from "./fiscal-issuer-admin.types";
import { normalizeAndValidateIssuerIdentification } from "./fiscal-issuer-identification";
import {
  FISCAL_NUMBER_SEQUENCE_ADMIN_REPOSITORY,
  FiscalNumberSequenceAdminRepository,
  FiscalNumberSequenceRecord,
  FiscalNumberSequenceScope,
} from "./fiscal-number-sequence-admin.repository";
import { ProviderNumberingAdminService } from "./provider-numbering-admin.service";

const MAX_SEQUENCE = 9_999_999_999n;
const PROVIDER_VERIFICATION_DOCUMENT_TYPE = "01";
const DOCUMENT_TYPES = [
  { code: "01", name: "Factura electrónica" },
  { code: "02", name: "Nota de débito" },
  { code: "03", name: "Nota de crédito" },
  { code: "04", name: "Tiquete electrónico" },
  { code: "08", name: "Factura electrónica de compra" },
  { code: "09", name: "Factura electrónica de exportación" },
  { code: "10", name: "Recibo electrónico de pago" },
] as const;

@Injectable()
export class FiscalNumberSequenceAdminService {
  constructor(
    @Inject(FISCAL_ISSUER_ADMIN_REPOSITORY)
    private readonly issuerRepository: FiscalIssuerAdminRepository,
    @Inject(FISCAL_NUMBER_SEQUENCE_ADMIN_REPOSITORY)
    private readonly sequenceRepository: FiscalNumberSequenceAdminRepository,
    private readonly providerNumbering: ProviderNumberingAdminService,
  ) {}

  async list(tenantId: string, issuerId: string) {
    const issuer = await this.requireReadyIssuer(tenantId, issuerId);
    const rows = await this.sequenceRepository.list(
      tenantId,
      issuerId,
      issuer.establishmentCode!,
      issuer.terminalCode!,
    );
    const byType = new Map(rows.map((row) => [row.documentTypeCode, row]));
    return {
      issuerId,
      establishmentCode: issuer.establishmentCode,
      terminalCode: issuer.terminalCode,
      sequences: DOCUMENT_TYPES.map(({ code, name }) =>
        toResponse(code, name, byType.get(code) ?? null),
      ),
    };
  }

  async set(
    tenantId: string,
    issuerId: string,
    documentTypeCode: string,
    rawNextSequenceNumber: unknown,
  ) {
    const documentType = requireDocumentType(documentTypeCode);
    const requestedNext = parseSequence(rawNextSequenceNumber);
    const issuer = await this.requireReadyIssuer(tenantId, issuerId);
    const scope: FiscalNumberSequenceScope = {
      tenantId,
      fiscalIssuerId: issuerId,
      establishmentCode: issuer.establishmentCode!,
      terminalCode: issuer.terminalCode!,
      documentTypeCode,
    };
    const existing = await this.sequenceRepository.find(scope);
    if (existing) {
      if (requestedNext < existing.nextSequenceNumber) {
        throw fiscalBillingAdminError("FISCAL_NUMBER_SEQUENCE_DECREASE");
      }
      if (requestedNext === existing.nextSequenceNumber) {
        return toResponse(documentType.code, documentType.name, existing);
      }
      await this.verifyProvider(issuer);
      const result = await this.sequenceRepository.advance(
        scope,
        existing.nextSequenceNumber,
        requestedNext,
      );
      if (result.kind === "UPDATED") {
        return toResponse(documentType.code, documentType.name, result.sequence);
      }
      if (result.sequence?.nextSequenceNumber === requestedNext) {
        return toResponse(documentType.code, documentType.name, result.sequence);
      }
      throw fiscalBillingAdminError("FISCAL_NUMBER_SEQUENCE_CONFLICT");
    }

    await this.verifyProvider(issuer);
    try {
      const created = await this.sequenceRepository.create(
        scope,
        requestedNext,
      );
      return toResponse(documentType.code, documentType.name, created);
    } catch (error) {
      if (!isUniqueConstraintViolation(error)) throw error;
      const winner = await this.sequenceRepository.find(scope);
      if (winner?.nextSequenceNumber === requestedNext) {
        return toResponse(documentType.code, documentType.name, winner);
      }
      throw fiscalBillingAdminError("FISCAL_NUMBER_SEQUENCE_CONFLICT");
    }
  }

  private async requireReadyIssuer(tenantId: string, issuerId: string) {
    const issuer = await this.issuerRepository.find(tenantId, issuerId);
    if (!issuer) throw fiscalBillingAdminError("FISCAL_ISSUER_NOT_FOUND");
    if (!issuerIsReady(issuer)) {
      throw fiscalBillingAdminError("FISCAL_NUMBER_SEQUENCE_ISSUER_NOT_READY");
    }
    return issuer;
  }

  private async verifyProvider(issuer: FiscalIssuerRecord) {
    try {
      await this.providerNumbering.verifyIssuerIntegratorMode(
        issuer,
        PROVIDER_VERIFICATION_DOCUMENT_TYPE,
      );
    } catch (error) {
      if (responseCode(error) === "PROVIDER_NUMBERING_VERIFICATION_MISMATCH") {
        throw fiscalBillingAdminError(
          "FISCAL_NUMBER_SEQUENCE_PROVIDER_NOT_VERIFIED",
        );
      }
      throw error;
    }
  }
}

function requireDocumentType(code: string) {
  const found = DOCUMENT_TYPES.find((type) => type.code === code);
  if (!found) {
    throw fiscalBillingAdminError("FISCAL_NUMBER_SEQUENCE_DOCUMENT_TYPE_INVALID");
  }
  return found;
}

function parseSequence(value: unknown): bigint {
  if (typeof value !== "string" || !/^[1-9]\d{0,9}$/.test(value)) {
    throw fiscalBillingAdminError("FISCAL_NUMBER_SEQUENCE_INVALID");
  }
  const parsed = BigInt(value);
  if (parsed > MAX_SEQUENCE) {
    throw fiscalBillingAdminError("FISCAL_NUMBER_SEQUENCE_INVALID");
  }
  return parsed;
}

function issuerIsReady(issuer: FiscalIssuerRecord) {
  if (
    issuer.countryCode !== "CR" ||
    !issuer.isActive ||
    !/^\d{3}$/.test(issuer.establishmentCode ?? "") ||
    !/^\d{5}$/.test(issuer.terminalCode ?? "")
  ) {
    return false;
  }
  try {
    return (
      normalizeAndValidateIssuerIdentification(
        issuer.countryCode,
        issuer.identificationTypeCode,
        issuer.identificationNumber,
      ) === issuer.identificationNumber
    );
  } catch {
    return false;
  }
}

function toResponse(
  documentTypeCode: string,
  documentTypeName: string,
  sequence: FiscalNumberSequenceRecord | null,
) {
  if (!sequence) {
    return {
      documentTypeCode,
      documentTypeName,
      configured: false,
      startingSequenceNumber: null,
      nextSequenceNumber: null,
      providerBasePreview: null,
      fullConsecutivePreview: null,
    };
  }
  const base = sequence.nextSequenceNumber.toString().padStart(10, "0");
  return {
    documentTypeCode,
    documentTypeName,
    configured: true,
    startingSequenceNumber: sequence.startingSequenceNumber.toString(),
    nextSequenceNumber: sequence.nextSequenceNumber.toString(),
    providerBasePreview: base,
    fullConsecutivePreview: `${sequence.establishmentCode}${sequence.terminalCode}${documentTypeCode}${base}`,
  };
}

function isUniqueConstraintViolation(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

function responseCode(error: unknown) {
  if (typeof error !== "object" || error === null || !("response" in error)) {
    return undefined;
  }
  const response = (error as { response?: unknown }).response;
  return typeof response === "object" && response !== null && "code" in response
    ? (response as { code?: unknown }).code
    : undefined;
}
