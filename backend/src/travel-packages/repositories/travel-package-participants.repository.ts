import { Injectable } from '@nestjs/common';

export type TravelPackageParticipantRoleValue =
  | 'HOLDER'
  | 'COMPANION'
  | 'MINOR';

export interface TravelPackageParticipantWrite {
  tenantId: string;
  travelPackageId: string;
  clientId: string;
  role: TravelPackageParticipantRoleValue;
}

@Injectable()
export class TravelPackageParticipantsRepository {
  async findClients(
    tx: any,
    tenantId: string,
    clientIds: string[],
  ): Promise<Array<{ id: string }>> {
    if (clientIds.length === 0) {
      return [];
    }

    return tx.client.findMany({
      where: {
        tenantId,
        id: { in: clientIds },
      },
      select: {
        id: true,
      },
    });
  }

  async createMany(
    tx: any,
    participants: TravelPackageParticipantWrite[],
  ): Promise<void> {
    if (participants.length === 0) {
      return;
    }

    await tx.travelPackageParticipant.createMany({
      data: participants,
    });
  }
}
