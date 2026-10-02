import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { OPERATIONAL_ADDITIONAL_SERVICE_READER, type OperationalAdditionalServiceReader } from "../../additional-services/operations-read/operational-additional-service-reader.port";
import { PrismaService } from "../../prisma/prisma.service";
import { runTenantTransaction } from "../../tenant/tenant-transaction";

type Tx = { $executeRaw<T = unknown>(q: TemplateStringsArray, ...v: unknown[]): Promise<T>; travelPackageParticipant: Record<string, (...a: any[]) => Promise<any>>; };
type Db = { $transaction<T>(work: (tx: Tx) => Promise<T>): Promise<T> };

@Injectable()
export class OperationalPassengerCommercialContextService {
  private readonly db: Db;

  constructor(prisma: PrismaService, @Inject(OPERATIONAL_ADDITIONAL_SERVICE_READER) private readonly additional: OperationalAdditionalServiceReader) { this.db = prisma as unknown as Db; }

  async get(tenantId: string, travelPackageId: string, participantId: string) {
    const participant = await runTenantTransaction(this.db, tenantId, (tx) => tx.travelPackageParticipant.findFirst({ where: { id: participantId, tenantId, travelPackageId }, select: { id: true, clientId: true } }));
    if (!participant) throw new NotFoundException("OPERATIONAL_COMMERCIAL_CONTEXT_PARTICIPANT_NOT_FOUND");
    try {
      const byClient = await this.additional.readForClients({ tenantId, travelPackageId, clientIds: [participant.clientId] });
      return { travelPackageParticipantId: participant.id, additionalServices: byClient.get(participant.clientId) ?? [] };
    } catch {
      return { travelPackageParticipantId: participant.id, additionalServices: [] };
    }
  }
}
