import type { BillingDocumentPaymentMethodSnapshot } from "./billing-document.types";
import {
  CR_DOCUMENT_TYPES,
  CR_PAYMENT_METHOD_CODES,
  type CrDocumentTypeCode,
} from "./fiscal-billing.constants";
import { fiscalBillingError } from "./fiscal-billing.errors";
import { normalizeCrIdentification } from "./fiscal-issuer-identification";

const DOCUMENT_TYPES = new Set<string>(Object.values(CR_DOCUMENT_TYPES));
const PAYMENT_METHODS = new Set<string>(CR_PAYMENT_METHOD_CODES);
const RECEIVER_IDENTIFICATION_TYPES = new Set(["01", "02", "03", "04"]);

export function requireCrDraftDocumentType(
  value: unknown,
): asserts value is CrDocumentTypeCode {
  if (typeof value !== "string" || !DOCUMENT_TYPES.has(value)) {
    throw fiscalBillingError("BILLING_DOCUMENT_TYPE_INVALID");
  }
}

export function resolveCrDraftReceiverIdentity(
  documentTypeCode: string,
  typeCode: unknown,
  number: unknown,
): { identificationType: string | null; identification: string | null } {
  requireCrDraftDocumentType(documentTypeCode);
  const typeMissing = typeCode === undefined || typeCode === null;
  const numberMissing = number === undefined || number === null;
  if (typeMissing !== numberMissing) {
    throw fiscalBillingError("BILLING_RECEIVER_IDENTIFICATION_INVALID");
  }
  if (typeMissing && numberMissing) {
    if (documentTypeCode === CR_DOCUMENT_TYPES.ELECTRONIC_INVOICE) {
      throw fiscalBillingError("BILLING_RECEIVER_IDENTIFICATION_INVALID");
    }
    return { identificationType: null, identification: null };
  }
  if (
    typeof typeCode !== "string" ||
    !RECEIVER_IDENTIFICATION_TYPES.has(typeCode) ||
    typeof number !== "string"
  ) {
    throw fiscalBillingError("BILLING_RECEIVER_IDENTIFICATION_INVALID");
  }
  const identification = normalizeCrIdentification(typeCode, number);
  if (!identification) {
    throw fiscalBillingError("BILLING_RECEIVER_IDENTIFICATION_INVALID");
  }
  return { identificationType: typeCode, identification };
}

export function resolveCrDraftPaymentMethods(
  values: unknown,
): BillingDocumentPaymentMethodSnapshot[] {
  if (!Array.isArray(values) || values.length < 1 || values.length > 4) {
    throw fiscalBillingError("BILLING_PAYMENT_METHOD_INVALID");
  }
  const codes: string[] = [];
  for (const value of values) {
    const code = typeof value === "string" ? value.trim() : "";
    if (!code || !PAYMENT_METHODS.has(code)) {
      throw fiscalBillingError("BILLING_PAYMENT_METHOD_INVALID");
    }
    if (!codes.includes(code)) codes.push(code);
  }
  return codes.map((paymentMethodCode, index) => ({
    paymentMethodOrder: index + 1,
    paymentMethodCode,
    description: null,
    declaredAmount: null,
  }));
}

export function validateCrDraftPaymentSnapshots(
  values: unknown,
): BillingDocumentPaymentMethodSnapshot[] {
  if (!Array.isArray(values) || values.length < 1 || values.length > 4) {
    throw fiscalBillingError("BILLING_PAYMENT_METHOD_INVALID");
  }
  const codes: string[] = [];
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw fiscalBillingError("BILLING_PAYMENT_METHOD_INVALID");
    }
    const method = value as Record<string, unknown>;
    const code = method.paymentMethodCode;
    if (
      method.paymentMethodOrder !== index + 1 ||
      typeof code !== "string" ||
      !PAYMENT_METHODS.has(code) ||
      codes.includes(code) ||
      method.description !== null ||
      method.declaredAmount !== null
    ) {
      throw fiscalBillingError("BILLING_PAYMENT_METHOD_INVALID");
    }
    codes.push(code);
  }
  return resolveCrDraftPaymentMethods(codes);
}

export function resolveCrDraftCommercialCondition(source: {
  paymentConditionType: unknown;
  paymentTermValue: unknown;
  paymentTermUnit: unknown;
}): { paymentConditionCode: string; creditTermDays: number | null } {
  if (source.paymentConditionType === "CASH") {
    return { paymentConditionCode: "01", creditTermDays: null };
  }
  if (
    source.paymentConditionType === "CREDIT" &&
    source.paymentTermUnit === "DAYS" &&
    typeof source.paymentTermValue === "number" &&
    Number.isSafeInteger(source.paymentTermValue) &&
    source.paymentTermValue > 0
  ) {
    return {
      paymentConditionCode: "02",
      creditTermDays: source.paymentTermValue,
    };
  }
  throw fiscalBillingError("BILLING_COMMERCIAL_CREDIT_TERM_INVALID");
}
