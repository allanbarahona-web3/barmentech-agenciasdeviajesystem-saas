import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { JobDispatcherService } from "../infrastructure/job-dispatcher";
import { PLATFORM_QUEUE_KEYS } from "../infrastructure/queue";
import { PrismaService } from "../prisma/prisma.service";
import { runTenantTransaction } from "../tenant/tenant-transaction";
import { AIRFARE_PRICING_JOB_NAME, airfarePricingJobId } from "./airfare-pricing-job.constants";

@Injectable()
export class AirfarePricingPendingRecoveryService implements OnModuleInit {
  private readonly logger = new Logger(AirfarePricingPendingRecoveryService.name);
  constructor(private readonly prisma: PrismaService, private readonly jobs: JobDispatcherService) {}
  onModuleInit() { void this.recover().catch(() => this.logger.error("AIRFARE_PRICING_RECOVERY_FAILED")); }
  async recover() {
    const tenants = await this.prisma.tenant.findMany({ select: { id: true }, take: 25, orderBy: { id: "asc" } });
    for (const tenant of tenants) {
      const requests = await runTenantTransaction<any, Array<{ id: string }>>(this.prisma as any, tenant.id, (tx: any) => tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "airfare_pricing_reprice_requests"
        WHERE "tenantId" = ${tenant.id} AND "status" = 'PENDING' AND "availableAt" <= now()
        ORDER BY "availableAt" ASC, "id" ASC LIMIT 25
      `);
      for (const request of requests) await this.jobs.dispatch({ queueKey: PLATFORM_QUEUE_KEYS.AIRFARE_PRICING, jobName: AIRFARE_PRICING_JOB_NAME, payload: { tenantId: tenant.id, requestId: request.id, eventVersion: 1 }, metadata: { tenantId: tenant.id }, options: { jobId: airfarePricingJobId(request.id), attempts: 3, backoff: { type: "exponential", delay: 2000 }, removeOnComplete: true, removeOnFail: false } });
    }
  }
}
