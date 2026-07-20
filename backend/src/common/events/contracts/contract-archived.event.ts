import { DomainEvent } from "../domain-event";

export class ContractArchivedEvent implements DomainEvent {
  constructor(
    public readonly contractId: string,
    public readonly occurredAt: Date = new Date(),
  ) {}
}
