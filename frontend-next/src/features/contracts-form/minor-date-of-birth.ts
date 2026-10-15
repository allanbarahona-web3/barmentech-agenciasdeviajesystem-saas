type MinorDateOfBirthInput = {
  dateOfBirth: string;
};

export function getMinorDateOfBirthValidationError(
  minors: readonly MinorDateOfBirthInput[],
  referenceDate: string,
): string | null {
  if (minors.some((minor) => !minor.dateOfBirth.trim())) {
    return "La fecha de nacimiento es requerida para cada menor.";
  }

  if (minors.some((minor) => minor.dateOfBirth > referenceDate)) {
    return "La fecha de nacimiento de un menor no puede ser futura.";
  }

  return null;
}
