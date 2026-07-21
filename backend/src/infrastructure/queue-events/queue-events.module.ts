import { Global, Module } from "@nestjs/common";
import { QueueEventsService } from "./queue-events.service";

@Global()
@Module({
  providers: [QueueEventsService],
  exports: [QueueEventsService],
})
export class QueueEventsModule {}
