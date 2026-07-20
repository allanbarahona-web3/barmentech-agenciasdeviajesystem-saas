import { Module } from "@nestjs/common";
import { EVENT_BUS } from "./event-bus";
import { EVENT_PUBLISHER } from "./event-publisher";
import { InMemoryEventBus } from "./in-memory-event-bus";

@Module({
  providers: [
    InMemoryEventBus,
    {
      provide: EVENT_BUS,
      useExisting: InMemoryEventBus,
    },
    {
      provide: EVENT_PUBLISHER,
      useExisting: InMemoryEventBus,
    },
  ],
  exports: [EVENT_BUS, EVENT_PUBLISHER],
})
export class EventsModule {}
