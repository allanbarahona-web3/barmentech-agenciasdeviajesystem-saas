/**
 * Normalizes customer identification numbers to prevent duplicate customers
 * from being created due to formatting differences.
 * 
 * This is the SINGLE SOURCE OF TRUTH for identification normalization.
 * Must be used everywhere idNumber is:
 * - Created
 * - Updated
 * - Searched
 * - Validated
 * - Compared
 */

/**
 * Normalizes identification number based on type
 * 
 * @param idType Type of identification: "Cedula", "DIMEX", or "Pasaporte"
 * @param idNumber Raw identification number (may contain formatting)
 * @returns Normalized identification number
 * 
 * Rules:
 * - Cedula (National ID): Exactly 10 digits, left-padded with zeros
 *   Examples: "3-357-962" → "0303570962", "303570962" → "0303570962"
 * 
 * - DIMEX: Exactly 12 digits, no left-padding, first digit must be 1
 *   Example: "1-0452-3001899" → "104523001899"
 * 
 * - Pasaporte (Passport): Only trim whitespace, no other normalization
 *   Example: " ABC123 " → "ABC123"
 */
export function normalizeIdentification(
  idType: string | null | undefined,
  idNumber: string | null | undefined
): string {
  // Handle null/undefined
  const rawIdNumber = String(idNumber || "").trim();
  const rawIdType = String(idType || "").trim();

  if (!rawIdNumber) {
    return "";
  }

  // Normalize based on ID type
  switch (rawIdType) {
    case "Cedula": {
      // Check if input has separators (formatted input)
      if (/[-\s]/.test(rawIdNumber)) {
        // Parse as three groups separated by hyphen or space
        const groups = rawIdNumber.split(/[-\s]+/).filter(g => g.length > 0);
        
        if (groups.length !== 3) {
          // Invalid format - return as-is, validation will catch it
          return rawIdNumber.replace(/\D/g, "");
        }

        // Validate each group contains only digits
        if (!groups.every(g => /^\d+$/.test(g))) {
          // Invalid format - return as-is, validation will catch it
          return rawIdNumber.replace(/\D/g, "");
        }

        // Pad each group: province(2), second(4), third(4)
        const province = groups[0].padStart(2, "0");
        const second = groups[1].padStart(4, "0");
        const third = groups[2].padStart(4, "0");

        return province + second + third;
      } else {
        // Unformatted numeric input
        const digitsOnly = rawIdNumber.replace(/\D/g, "");
        
        if (digitsOnly.length === 9) {
          // 9 digits: prepend one zero
          return "0" + digitsOnly;
        } else if (digitsOnly.length === 10) {
          // 10 digits: keep as is
          return digitsOnly;
        } else {
          // Invalid length - return as-is, validation will catch it
          return digitsOnly;
        }
      }
    }

    case "DIMEX": {
      // Remove all non-numeric characters
      const digitsOnly = rawIdNumber.replace(/\D/g, "");
      
      // DIMEX should be exactly 12 digits, no padding
      // First digit should be 1
      return digitsOnly;
    }

    case "Pasaporte": {
      // Passport: only trim, no other normalization
      return rawIdNumber;
    }

    default: {
      // Unknown type: default to trim only
      return rawIdNumber;
    }
  }
}

/**
 * Validates identification number after normalization
 * 
 * @param idType Type of identification: "Cedula", "DIMEX", or "Pasaporte"
 * @param normalizedIdNumber Normalized identification number (output from normalizeIdentification)
 * @returns Object with isValid flag and optional error message
 * 
 * Validation Rules:
 * - Cedula (National ID): Must be exactly 10 digits after normalization
 * - DIMEX: Must be exactly 12 digits and start with 1 after normalization
 * - Pasaporte (Passport): No validation (always valid)
 */
export function validateIdentification(
  idType: string | null | undefined,
  normalizedIdNumber: string | null | undefined
): { isValid: boolean; errorMessage?: string } {
  const idNum = String(normalizedIdNumber || "").trim();
  const type = String(idType || "").trim();

  if (!idNum) {
    return {
      isValid: false,
      errorMessage: "El número de identificación es requerido",
    };
  }

  switch (type) {
    case "Cedula": {
      // HARD VALIDATION: Must be EXACTLY 10 digits after normalization
      if (!/^\d{10}$/.test(idNum)) {
        return {
          isValid: false,
          errorMessage: "La cédula debe contener exactamente 10 dígitos. Formato aceptado: 1-2345-6789 o 10 dígitos sin separadores",
        };
      }
      return { isValid: true };
    }

    case "DIMEX": {
      // HARD VALIDATION: Must be EXACTLY 12 digits and start with 1
      if (!/^\d{12}$/.test(idNum)) {
        return {
          isValid: false,
          errorMessage: "El DIMEX debe contener exactamente 12 dígitos (no más, no menos)",
        };
      }
      if (!idNum.startsWith("1")) {
        return {
          isValid: false,
          errorMessage: "El DIMEX debe comenzar con el dígito 1",
        };
      }
      return { isValid: true };
    }

    case "Pasaporte": {
      // Passport: no validation required
      return { isValid: true };
    }

    default: {
      // Unknown type: accept any non-empty value
      return { isValid: true };
    }
  }
}
