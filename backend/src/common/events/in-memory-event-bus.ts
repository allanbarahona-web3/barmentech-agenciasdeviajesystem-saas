import { DomainEvent, DomainEventType } from "./domain-event";
import { EventBus } from "./event-bus";
import { EventHandler } from "./event-handler";

type RegisteredHandler = EventHandler<DomainEvent>;

/**
 * Synchronous-process event bus intended for dependency-injected application use.
 * Handlers run in subscription order and are awaited before publication completes.
 */
export class InMemoryEventBus implements EventBus {
  private readonly handlers = new Map<
    DomainEventType,
    Set<RegisteredHandler>
  >();

  subscribe<TEvent extends DomainEvent>(
    eventType: DomainEventType<TEvent>,
    handler: EventHandler<TEvent>,
  ): void {
    const handlers = this.handlers.get(eventType) ?? new Set<RegisteredHandler>();
    handlers.add(handler as RegisteredHandler);
    this.handlers.set(eventType, handlers);
  }

  unsubscribe<TEvent extends DomainEvent>(
    eventType: DomainEventType<TEvent>,
    handler: EventHandler<TEvent>,
  ): void {
    const handlers = this.handlers.get(eventType);

    if (!handlers) {
      return;
    }

    handlers.delete(handler as RegisteredHandler);

    if (handlers.size === 0) {
      this.handlers.delete(eventType);
    }
  }

  async publish<TEvent extends DomainEvent>(event: TEvent): Promise<void> {
    const eventType = event.constructor as DomainEventType<TEvent>;
    const handlers = this.handlers.get(eventType);

    if (!handlers) {
      return;
    }

    for (const handler of [...handlers]) {
      await handler.handle(event);
    }
  }

  async publishAll(events: readonly DomainEvent[]): Promise<void> {
    for (const event of events) {
      await this.publish(event);
    }
  }
}
