import type { JobDispatcherService } from "../../infrastructure/job-dispatcher";
import { PLATFORM_QUEUE_KEYS } from "../../infrastructure/queue";
import type { PrismaService } from "../../prisma/prisma.service";
import { FISCAL_STATUS_RECONCILIATION_BATCH_SIZE, FISCAL_STATUS_RECONCILIATION_JOB_NAME, FISCAL_STATUS_RECONCILIATION_LEASE_MS, fiscalStatusReconciliationJobId } from "./fiscal-status-reconciliation.constants";
import { FiscalStatusReconciliationPublisher } from "./fiscal-status-reconciliation.publisher";

describe("FiscalStatusReconciliationPublisher",()=>{
  it("claims with one bounded atomic CTE and dispatches the exact safe job",async()=>{const c=context([{tenantId:"tenant-a",billingDocumentId:"document-a",statusCheckLockOwner:"fsr-claim-1"}]);await c.publisher.publishDueStatusChecks();
    expect(c.transaction).toHaveBeenCalledTimes(1);const sql=c.sql.mock.calls[0][0].join(" ");for(const fragment of ["WITH selected AS","FOR UPDATE SKIP LOCKED",'ORDER BY "providerNextStatusCheckAt" ASC, "id" ASC','"providerNextStatusCheckAt" <=','"providerStatusCheckLeaseUntil" <=','UPDATE "billing_documents"','"providerStatusCheckLockOwner"','"providerStatusCheckLeaseUntil"'])expect(sql).toContain(fragment);expect(c.sql.mock.calls[0]).toContain(FISCAL_STATUS_RECONCILIATION_BATCH_SIZE);
    expect(c.dispatch).toHaveBeenCalledWith({queueKey:PLATFORM_QUEUE_KEYS.FISCAL_BILLING,jobName:FISCAL_STATUS_RECONCILIATION_JOB_NAME,payload:{tenantId:"tenant-a",billingDocumentId:"document-a",statusCheckLockOwner:"fsr-claim-1",eventVersion:1},metadata:{tenantId:"tenant-a"},options:{jobId:fiscalStatusReconciliationJobId("fsr-claim-1"),attempts:3,backoff:{type:"exponential",delay:2000},removeOnComplete:false,removeOnFail:false}});
    expect(FISCAL_STATUS_RECONCILIATION_LEASE_MS).toBe(60_000);
  });
  it("continues the claimed batch after one enqueue failure and leaves leases for expiry",async()=>{const c=context([{tenantId:"tenant-a",billingDocumentId:"a",statusCheckLockOwner:"owner-1"},{tenantId:"tenant-b",billingDocumentId:"b",statusCheckLockOwner:"owner-2"}]);c.dispatch.mockRejectedValueOnce(new Error("redis secret")).mockResolvedValueOnce({});await c.publisher.publishDueStatusChecks();expect(c.dispatch).toHaveBeenCalledTimes(2);expect(c.prisma).not.toHaveProperty("billingDocument");});
  it("uses completion-scheduled lifecycle and awaits an active shutdown cycle",async()=>{jest.useFakeTimers();const c=context([]);c.publisher.onModuleInit();expect(jest.getTimerCount()).toBe(1);await jest.runOnlyPendingTimersAsync();expect(jest.getTimerCount()).toBe(1);await c.publisher.onModuleDestroy();expect(jest.getTimerCount()).toBe(0);jest.useRealTimers();});
});
function context(rows:Array<{tenantId:string;billingDocumentId:string;statusCheckLockOwner:string}>){const sql=jest.fn().mockResolvedValue(rows),transaction=jest.fn(async(cb:(tx:{ $queryRaw:jest.Mock})=>unknown)=>cb({$queryRaw:sql})),dispatch=jest.fn().mockResolvedValue({}),prisma={$transaction:transaction};return{sql,transaction,dispatch,prisma,publisher:new FiscalStatusReconciliationPublisher(prisma as unknown as PrismaService,{dispatch} as unknown as JobDispatcherService)};}
