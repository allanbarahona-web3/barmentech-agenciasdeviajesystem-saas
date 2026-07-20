import { DomainEvent } from "../domain-event";

export class InvoiceCreatedEvent implements DomainEvent {
  constructor(
    public readonly invoiceId: string,
    public readonly occurredAt: Date = new Date(),
  ) {}
}
