import { DomainEvent } from "./domain-event";

export interface EventHandler<TEvent extends DomainEvent = DomainEvent> {
  handle(event: TEvent): void | Promise<void>;
}
