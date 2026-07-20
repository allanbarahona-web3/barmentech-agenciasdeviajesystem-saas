/**
 * Marker contract for events that describe something that happened in the domain.
 */
export interface DomainEvent {
  readonly occurredAt: Date;
}

/**
 * A domain event constructor, used as its runtime subscription key.
 */
export type DomainEventType<TEvent extends DomainEvent = DomainEvent> = abstract new (
  ...args: never[]
) => TEvent;
