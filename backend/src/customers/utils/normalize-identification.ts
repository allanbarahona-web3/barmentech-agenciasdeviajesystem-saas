/**
 * Temporary normalization for existing legacy contract reads.
 *
 * This helper must never be used for Client writes or canonical typed lookups.
 * It exists only until pre-canonical contract drafts stop submitting legacy
 * `Cedula`, `Pasaporte`, or missing identification-type values.
 */
export function normalizeLegacyClientIdentificationForRead(
  idType: string | null | undefined,
  idNumber: string | null | undefined,
): string {
  const rawIdNumber = String(idNumber || "").trim();
  const rawIdType = String(idType || "").trim();
  if (!rawIdNumber) return "";

  switch (rawIdType) {
    case "Cedula": {
      if (/[-\s]/.test(rawIdNumber)) {
        const groups = rawIdNumber.split(/[-\s]+/).filter(Boolean);
        if (
          groups.length !== 3 ||
          !groups.every((group) => /^\d+$/.test(group))
        ) {
          return "";
        }
        return (
          groups[0].padStart(2, "0") +
          groups[1].padStart(4, "0") +
          groups[2].padStart(4, "0")
        );
      }

      const digits = rawIdNumber.replace(/\D/g, "");
      if (digits.length === 9) return `0${digits}`;
      return digits.length === 10 ? digits : "";
    }
    case "DIMEX": {
      const digits = rawIdNumber.replace(/\D/g, "");
      return /^1\d{11}$/.test(digits) ? digits : "";
    }
    case "Pasaporte":
    case "":
      return rawIdNumber;
    default:
      return "";
  }
}
