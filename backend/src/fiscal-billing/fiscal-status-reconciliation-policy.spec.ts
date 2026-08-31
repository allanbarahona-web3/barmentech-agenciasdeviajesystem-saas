import { initialFiscalStatusReconciliationSchedule, nextFiscalStatusReconciliationSchedule } from "./fiscal-status-reconciliation-policy";

const SUBMITTED = new Date("2026-08-24T12:00:00.123Z");

describe("fiscal status reconciliation policy", () => {
  it("schedules the initial lookup exactly ten seconds after submission", () => {
    expect(initialFiscalStatusReconciliationSchedule(SUBMITTED)).toEqual({ nextStatusCheckAt: new Date("2026-08-24T12:00:10.123Z"), reconciliationRequired: false });
  });

  it.each([[1,20_000],[2,40_000],[3,60_000],[4,300_000],[99,300_000]] as const)("schedules completed check %i with the required delay", (attempts, delay) => {
    const completed = new Date("2026-08-24T12:01:00.456Z");
    const result = nextFiscalStatusReconciliationSchedule(SUBMITTED, attempts, completed);
    expect(result).toEqual({ nextStatusCheckAt: new Date(completed.getTime() + delay), reconciliationRequired: false });
    expect(result.nextStatusCheckAt?.getMilliseconds()).toBe(456);
  });

  it("treats exactly thirty minutes and an interval crossing the deadline as exhausted", () => {
    expect(nextFiscalStatusReconciliationSchedule(SUBMITTED, 4, new Date(SUBMITTED.getTime()+30*60_000))).toEqual({nextStatusCheckAt:null,reconciliationRequired:true});
    expect(nextFiscalStatusReconciliationSchedule(SUBMITTED, 4, new Date(SUBMITTED.getTime()+26*60_000))).toEqual({nextStatusCheckAt:null,reconciliationRequired:true});
  });

  it.each([[new Date(Number.NaN),1,SUBMITTED],[SUBMITTED,0,SUBMITTED],[SUBMITTED,1,new Date(Number.NaN)],[SUBMITTED,1.5,SUBMITTED]] as const)("rejects malformed policy input", (submitted, attempts, completed) => {
    expect(() => nextFiscalStatusReconciliationSchedule(submitted, attempts, completed)).toThrow();
  });
});
