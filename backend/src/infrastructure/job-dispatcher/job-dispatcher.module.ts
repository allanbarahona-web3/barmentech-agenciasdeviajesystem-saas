import { Global, Module } from "@nestjs/common";
import { JobDispatcherService } from "./job-dispatcher.service";

@Global()
@Module({
  providers: [JobDispatcherService],
  exports: [JobDispatcherService],
})
export class JobDispatcherModule {}
