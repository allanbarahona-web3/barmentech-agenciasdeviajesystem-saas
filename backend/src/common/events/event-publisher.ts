import { DomainEvent } from "./domain-event";

export interface EventPublisher {
  publish<TEvent extends DomainEvent>(event: TEvent): Promise<void>;
  publishAll(events: readonly DomainEvent[]): Promise<void>;
}

/**
 * Injection token for consumers that depend only on event publication.
 */
export const EVENT_PUBLISHER = Symbol("EventPublisher");
