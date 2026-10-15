import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  OPERATIONAL_PASSENGER_NOTE_READER,
  type OperationalPassengerNoteReader,
} from "../../contracts/operations-read/operational-passenger-note-reader.port";

@Injectable()
export class OperationalPassengerNotesService {
  constructor(
    @Inject(OPERATIONAL_PASSENGER_NOTE_READER)
    private readonly notes: OperationalPassengerNoteReader,
  ) {}

  async list(tenantId: string, travelPackageId: string, participantId: string) {
    const notes = await this.notes.readNotesForParticipant({
      tenantId,
      travelPackageId,
      participantId,
    });
    if (notes === null) {
      throw new NotFoundException("OPERATIONAL_PASSENGER_NOTES_PARTICIPANT_NOT_FOUND");
    }
    return notes.map((note) => ({
      id: note.id,
      note: note.text,
      contract: {
        id: note.source.sourceId,
        contractNumber: note.source.contractNumber,
      },
      author: { displayName: note.authorName },
      createdAt: note.createdAt,
    }));
  }
}
