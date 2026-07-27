export type ContractPassengerType = 'HOLDER' | 'COMPANION' | 'MINOR';

export type ContractParticipation =
  | {
      role: 'HOLDER';
      passengerIndex: null;
      passenger: null;
      minor?: never;
    }
  | {
      role: 'COMPANION';
      passengerIndex: number;
      passenger: Record<string, unknown>;
      minor?: never;
    }
  | {
      role: 'MINOR';
      passengerIndex: number;
      passenger: Record<string, unknown>;
      minor: Record<string, unknown>;
    };

export function resolveContractParticipation(
  contract: {
    clientId: string;
    payload: unknown;
  },
  customerId: string,
): ContractParticipation | null {
  if (contract.clientId === customerId) {
    return {
      role: 'HOLDER',
      passengerIndex: null,
      passenger: null,
    };
  }

  const payload =
    contract.payload &&
    typeof contract.payload === 'object' &&
    !Array.isArray(contract.payload)
      ? (contract.payload as Record<string, unknown>)
      : {};
  const companions = Array.isArray(payload.companions)
    ? payload.companions
    : [];
  const companionIndex = companions.findIndex(
    (companion: Record<string, unknown>) =>
      String(companion?.selectedCustomerId ?? '').trim() === customerId,
  );
  if (companionIndex >= 0) {
    return {
      role: 'COMPANION',
      passengerIndex: companionIndex,
      passenger: companions[companionIndex] as Record<string, unknown>,
    };
  }

  const minors = Array.isArray(payload.minors) ? payload.minors : [];
  const minorIndex = minors.findIndex(
    (minor: Record<string, unknown>) =>
      String(minor?.selectedCustomerId ?? '').trim() === customerId,
  );
  if (minorIndex >= 0) {
    const minor = minors[minorIndex] as Record<string, unknown>;
    return {
      role: 'MINOR',
      passengerIndex: minorIndex,
      passenger: minor,
      minor,
    };
  }

  return null;
}
