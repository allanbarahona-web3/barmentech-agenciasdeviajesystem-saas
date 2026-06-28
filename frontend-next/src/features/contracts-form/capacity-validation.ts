/**
 * Helper para calcular el número total de participantes en una reserva
 * 
 * @param formState - Estado del formulario de contrato
 * @returns Número total de participantes (titular + acompañantes válidos + menores válidos)
 */
export const calculateParticipants = (formState: {
  companions: Array<{ fullName: string; idNumber: string }>;
  minors: Array<{ minorId: string }>;
}): number => {
  // 1. Titular (siempre cuenta)
  const holderCount = 1;

  // 2. Acompañantes con datos completos (nombre e ID)
  const companionsWithId = formState.companions.filter(
    (c) => c.fullName.trim() && c.idNumber.trim()
  ).length;

  // 3. Menores con ID registrado
  const minorsWithId = formState.minors.filter(
    (m) => m.minorId.trim()
  ).length;

  return holderCount + companionsWithId + minorsWithId;
};
