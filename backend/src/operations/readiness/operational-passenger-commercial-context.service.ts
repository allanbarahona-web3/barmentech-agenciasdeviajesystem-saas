import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { OPERATIONAL_ADDITIONAL_SERVICE_READER, type OperationalAdditionalServiceReader } from "../../additional-services/operations-read/operational-additional-service-reader.port";
import {
  OPERATIONAL_PASSENGER_CONTRACT_CONTEXT_READER,
  type OperationalPassengerContractContextReader,
} from "../../contracts/operations-read/operational-passenger-contract-context-reader.port";
import {
  OPERATIONAL_PASSENGER_NOTE_READER,
  type OperationalPassengerNoteReader,
} from "../../contracts/operations-read/operational-passenger-note-reader.port";
import { PrismaService } from "../../prisma/prisma.service";
import { runTenantTransaction } from "../../tenant/tenant-transaction";

type Tx = { $executeRaw<T = unknown>(q: TemplateStringsArray, ...v: unknown[]): Promise<T>; travelPackageParticipant: Record<string, (...a: any[]) => Promise<any>>; };
type Db = { $transaction<T>(work: (tx: Tx) => Promise<T>): Promise<T> };

@Injectable()
export class OperationalPassengerCommercialContextService {
  private readonly db: Db;

  constructor(
    prisma: PrismaService,
    @Inject(OPERATIONAL_ADDITIONAL_SERVICE_READER) private readonly additional: OperationalAdditionalServiceReader,
    @Inject(OPERATIONAL_PASSENGER_CONTRACT_CONTEXT_READER) private readonly contractContext: OperationalPassengerContractContextReader,
    @Inject(OPERATIONAL_PASSENGER_NOTE_READER) private readonly notes: OperationalPassengerNoteReader,
  ) { this.db = prisma as unknown as Db; }

  async get(tenantId: string, travelPackageId: string, participantId: string) {
    const participant = await runTenantTransaction(this.db, tenantId, (tx) => tx.travelPackageParticipant.findFirst({ where: { id: participantId, tenantId, travelPackageId }, select: { id: true, clientId: true } }));
    if (!participant) throw new NotFoundException("OPERATIONAL_COMMERCIAL_CONTEXT_PARTICIPANT_NOT_FOUND");
    const [additionalServices, contractContexts, operationalNotes] = await Promise.all([
      this.readAdditionalServices(tenantId, travelPackageId, participant.clientId),
      this.readContractContexts(tenantId, travelPackageId, participant.id),
      this.readOperationalNotes(tenantId, travelPackageId, participant.id),
    ]);
    return { travelPackageParticipantId: participant.id, additionalServices, contractContexts, operationalNotes };
  }

  private async readAdditionalServices(tenantId: string, travelPackageId: string, clientId: string) {
    try {
      const byClient = await this.additional.readForClients({ tenantId, travelPackageId, clientIds: [clientId] });
      return byClient.get(clientId) ?? [];
    } catch { return []; }
  }

  private async readContractContexts(tenantId: string, travelPackageId: string, participantId: string) {
    try {
      const byParticipant = await this.contractContext.readContractContextsForParticipants({ tenantId, travelPackageId, participantIds: [participantId] });
      return byParticipant.get(participantId) ?? [];
    } catch { return []; }
  }

  private async readOperationalNotes(tenantId: string, travelPackageId: string, participantId: string) {
    try {
      const byParticipant = await this.notes.readNotesForParticipants({ tenantId, travelPackageId, participantIds: [participantId] });
      return byParticipant.get(participantId) ?? [];
    } catch { return []; }
  }
}
