import { DomainEvent, DomainEventType } from "./domain-event";
import { EventHandler } from "./event-handler";
import { EventPublisher } from "./event-publisher";

export interface EventBus extends EventPublisher {
  subscribe<TEvent extends DomainEvent>(
    eventType: DomainEventType<TEvent>,
    handler: EventHandler<TEvent>,
  ): void;

  unsubscribe<TEvent extends DomainEvent>(
    eventType: DomainEventType<TEvent>,
    handler: EventHandler<TEvent>,
  ): void;
}

/**
 * Injection token for consumers that manage event subscriptions.
 */
export const EVENT_BUS = Symbol("EventBus");
