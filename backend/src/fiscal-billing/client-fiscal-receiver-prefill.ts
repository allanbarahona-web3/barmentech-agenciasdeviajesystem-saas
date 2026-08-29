import {
  ClientIdentificationError,
  normalizeAndValidateClientIdentification,
} from "../customers/client-identification";

export type FiscalReceiverIdentityPrefillStatus =
  | "COMPLETE"
  | "INCOMPLETE"
  | "UNSUPPORTED";

export type FiscalReceiverIdentityPrefill = {
  receiverIdentificationTypeCode: "01" | "02" | "03" | "04" | null;
  receiverIdentificationNumber: string | null;
  receiverFiscalIdentityComplete: boolean;
  receiverFiscalIdentityStatus: FiscalReceiverIdentityPrefillStatus;
};

const CLIENT_TO_CR_RECEIVER_TYPE = {
  CEDULA_FISICA: "01",
  CEDULA_JURIDICA: "02",
  DIMEX: "03",
  NITE: "04",
} as const;

export function clientFiscalReceiverPrefill(identity: {
  idType: string | null;
  idNumber: string;
} | null): FiscalReceiverIdentityPrefill {
  if (!identity) return incompletePrefill();

  if (identity.idType === "PASAPORTE" || identity.idType === "OTHER") {
    return {
      receiverIdentificationTypeCode: null,
      receiverIdentificationNumber: identity.idNumber.trim() || null,
      receiverFiscalIdentityComplete: false,
      receiverFiscalIdentityStatus: "UNSUPPORTED",
    };
  }

  const typeCode =
    identity.idType &&
    Object.prototype.hasOwnProperty.call(
      CLIENT_TO_CR_RECEIVER_TYPE,
      identity.idType,
    )
      ? CLIENT_TO_CR_RECEIVER_TYPE[
          identity.idType as keyof typeof CLIENT_TO_CR_RECEIVER_TYPE
        ]
      : null;
  if (!typeCode) return incompletePrefill();

  try {
    const normalized = normalizeAndValidateClientIdentification(
      identity.idType,
      identity.idNumber,
    );
    return {
      receiverIdentificationTypeCode: typeCode,
      receiverIdentificationNumber: normalized.idNumber,
      receiverFiscalIdentityComplete: true,
      receiverFiscalIdentityStatus: "COMPLETE",
    };
  } catch (error) {
    if (!(error instanceof ClientIdentificationError)) throw error;
    return {
      ...incompletePrefill(),
      receiverIdentificationTypeCode: typeCode,
    };
  }
}

function incompletePrefill(): FiscalReceiverIdentityPrefill {
  return {
    receiverIdentificationTypeCode: null,
    receiverIdentificationNumber: null,
    receiverFiscalIdentityComplete: false,
    receiverFiscalIdentityStatus: "INCOMPLETE",
  };
}
