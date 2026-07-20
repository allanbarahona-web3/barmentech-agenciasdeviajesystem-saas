import { DomainEvent } from "../domain-event";

export class PackageCompletedEvent implements DomainEvent {
  constructor(
    public readonly documentId: string,
    public readonly occurredAt: Date = new Date(),
  ) {}
}
