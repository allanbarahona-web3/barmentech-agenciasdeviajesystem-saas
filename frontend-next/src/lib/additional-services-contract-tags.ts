export interface AdditionalServicesContractTagSource {
  contractId?: string;
  contractNumber: string;
}

export interface AdditionalServicesContractTagParticipant {
  contractSources: readonly AdditionalServicesContractTagSource[] | null;
}

export const ALL_ADDITIONAL_SERVICES_CONTRACTS_FILTER = 'ALL_CONTRACTS';
export const WITHOUT_ADDITIONAL_SERVICES_CONTRACT_FILTER =
  'WITHOUT_CONTRACT';

export type AdditionalServicesContractFilter =
  | typeof ALL_ADDITIONAL_SERVICES_CONTRACTS_FILTER
  | typeof WITHOUT_ADDITIONAL_SERVICES_CONTRACT_FILTER
  | `CONTRACT:${string}`;

// Outlined Contract tags deliberately differ from Passenger Group's filled service badges.
const CONTRACT_TAG_CLASSNAMES = [
  'border-primary/60 text-primary',
  'border-success/70 text-success',
  'border-warning/80 text-warning',
  'border-info/70 text-info',
  'border-muted-foreground/60 text-foreground',
] as const;

/**
 * Assigns presentation-only Contract tag treatments from the rendered roster.
 * Sorting by the visible reference keeps the mapping deterministic without
 * persisting a color or treating a Contract as a selection boundary.
 */
export function buildAdditionalServicesContractTagClasses(
  participants: readonly AdditionalServicesContractTagParticipant[],
): ReadonlyMap<string, string> {
  const sourcesByContractId = new Map<string, AdditionalServicesContractTagSource>();
  for (const participant of participants) {
    for (const source of participant.contractSources ?? []) {
      const key = additionalServicesContractTagKey(source);
      if (!sourcesByContractId.has(key)) {
        sourcesByContractId.set(key, source);
      }
    }
  }

  return new Map(
    [...sourcesByContractId.values()]
      .sort(
        (left, right) =>
          left.contractNumber.localeCompare(right.contractNumber) ||
          additionalServicesContractTagKey(left).localeCompare(
            additionalServicesContractTagKey(right),
          ),
      )
      .map((source, index) => [
        additionalServicesContractTagKey(source),
        CONTRACT_TAG_CLASSNAMES[index % CONTRACT_TAG_CLASSNAMES.length],
      ]),
  );
}

export function additionalServicesContractTagKey(
  source: AdditionalServicesContractTagSource,
): string {
  return source.contractId ?? source.contractNumber;
}

export function additionalServicesContractFilterValue(
  contractNumber: string,
): AdditionalServicesContractFilter {
  return `CONTRACT:${contractNumber}`;
}

export function filterAdditionalServicesContractParticipants<
  Participant extends AdditionalServicesContractTagParticipant,
>(
  participants: readonly Participant[],
  filter: AdditionalServicesContractFilter,
): Participant[] {
  if (filter === ALL_ADDITIONAL_SERVICES_CONTRACTS_FILTER) {
    return [...participants];
  }

  if (filter === WITHOUT_ADDITIONAL_SERVICES_CONTRACT_FILTER) {
    return participants.filter(
      (participant) => (participant.contractSources ?? []).length === 0,
    );
  }

  const contractNumber = filter.slice('CONTRACT:'.length);
  return participants.filter((participant) =>
    (participant.contractSources ?? []).some(
      (source) => source.contractNumber === contractNumber,
    ),
  );
}

export function toggleAdditionalServicesContractFilter(
  currentFilter: AdditionalServicesContractFilter,
  nextFilter: AdditionalServicesContractFilter,
): AdditionalServicesContractFilter {
  return currentFilter === nextFilter
    ? ALL_ADDITIONAL_SERVICES_CONTRACTS_FILTER
    : nextFilter;
}
