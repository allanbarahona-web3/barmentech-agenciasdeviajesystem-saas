import type { PassengerGroup, TravelPackageRosterParticipant } from './passenger-groups-api';

export const ALL_PASSENGER_GROUP_SERVICES = 'ALL';

export type PassengerGroupsBoard = {
  groups: PassengerGroup[];
  sourceParticipants: TravelPackageRosterParticipant[];
  memberIdsByGroupId: Map<string, Set<string>>;
  isAllServices: boolean;
};

/**
 * Builds the board from the already-loaded roster and groups. In the global
 * view, the roster is always the source; in a service view, only passengers
 * unassigned to that service are the source. Memberships remain additive.
 */
export function buildPassengerGroupsBoard(
  groups: PassengerGroup[],
  participants: TravelPackageRosterParticipant[],
  serviceCode: string,
): PassengerGroupsBoard {
  const isAllServices = serviceCode === ALL_PASSENGER_GROUP_SERVICES;
  const activeGroups: PassengerGroup[] = [];
  const memberIdsByGroupId = new Map<string, Set<string>>();
  const assignedParticipantIds = new Set<string>();

  for (const group of groups) {
    if (group.status !== 'ACTIVE' || (!isAllServices && group.serviceCode !== serviceCode)) continue;

    activeGroups.push(group);
    const memberIds = new Set(group.members.map((member) => member.travelPackageParticipantId));
    memberIdsByGroupId.set(group.id, memberIds);
    if (!isAllServices) {
      for (const participantId of memberIds) assignedParticipantIds.add(participantId);
    }
  }

  return {
    groups: activeGroups,
    sourceParticipants: isAllServices
      ? participants
      : participants.filter((participant) => !assignedParticipantIds.has(participant.id)),
    memberIdsByGroupId,
    isAllServices,
  };
}

export function shouldAddPassengerGroupMember(
  memberIds: ReadonlySet<string> | undefined,
  participantId: string,
): boolean {
  return !memberIds?.has(participantId);
}
