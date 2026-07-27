import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

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

export interface TravelPackageParticipantRead {
  clientId: string;
  role: TravelPackageParticipantRoleValue;
  client: {
    fullName: string;
  };
}

export interface ClientActiveTravelPackageParticipantRead {
  role: TravelPackageParticipantRoleValue;
  travelPackage: {
    id: string;
    name: string;
    destination: string;
    departureDate: Date;
    returnDate: Date;
    status: string;
  };
}

@Injectable()
export class TravelPackageParticipantsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findRosterByTravelPackage(
    tenantId: string,
    travelPackageId: string,
  ): Promise<TravelPackageParticipantRead[]> {
    return this.prisma.travelPackageParticipant.findMany({
      where: {
        tenantId,
        travelPackageId,
      },
      select: {
        clientId: true,
        role: true,
        client: {
          select: {
            fullName: true,
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });
  }

  async findActiveTravelPackagesByClient(
    tenantId: string,
    clientId: string,
  ): Promise<ClientActiveTravelPackageParticipantRead[]> {
    return this.prisma.travelPackageParticipant.findMany({
      where: {
        tenantId,
        clientId,
        travelPackage: {
          status: {
            notIn: ['COMPLETED', 'CANCELLED'],
          },
        },
      },
      select: {
        role: true,
        travelPackage: {
          select: {
            id: true,
            name: true,
            destination: true,
            departureDate: true,
            returnDate: true,
            status: true,
          },
        },
      },
      orderBy: {
        travelPackage: {
          departureDate: 'asc',
        },
      },
    });
  }

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
