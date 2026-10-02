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

export type ContractParticipationSource = {
  clientId: string;
  payload: unknown;
};

export function resolveContractParticipationByTuple(
  contract: ContractParticipationSource,
  passengerType: unknown,
  passengerIndex: unknown,
): { clientId: string; participation: ContractParticipation } | null {
  const role = String(passengerType || '').trim();
  const index = passengerIndex ?? null;

  if (role === 'HOLDER') {
    if (index !== null) return null;
    const participation = resolveContractParticipation(contract, contract.clientId);
    return participation?.role === 'HOLDER'
      ? { clientId: contract.clientId, participation }
      : null;
  }

  if (
    (role !== 'COMPANION' && role !== 'MINOR') ||
    typeof index !== 'number' ||
    !Number.isInteger(index) ||
    index < 0
  ) {
    return null;
  }

  const payload = contract.payload && typeof contract.payload === 'object' && !Array.isArray(contract.payload)
    ? contract.payload as Record<string, unknown>
    : {};
  const candidates = role === 'COMPANION' ? payload.companions : payload.minors;
  const passengers: unknown[] = Array.isArray(candidates) ? candidates : [];
  const passenger = passengers[index] as Record<string, unknown> | undefined;
  const clientId = String(passenger?.selectedCustomerId ?? '').trim();
  if (!clientId) return null;

  const participation = resolveContractParticipation(contract, clientId);
  return participation?.role === role && participation.passengerIndex === index
    ? { clientId, participation }
    : null;
}

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
