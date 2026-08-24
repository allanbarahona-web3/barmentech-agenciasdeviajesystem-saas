import { OfficialExchangeRateModule } from "../official-exchange-rates/official-exchange-rate.module";
import { OfficialExchangeRateResolver } from "../official-exchange-rates/official-exchange-rate.resolver";
import { FiscalBillingModule } from "./fiscal-billing.module";
import { FiscalIssuanceClock } from "./fiscal-issuance.clock";
import { BillingDocumentSubmissionPreparationService } from "./billing-document-submission-preparation.service";

describe("FiscalBillingModule official-rate wiring", () => {
  it("imports the existing official-rate module without duplicating its resolver", () => {
    const imports = Reflect.getMetadata("imports", FiscalBillingModule) as unknown[];
    const providers = Reflect.getMetadata("providers", FiscalBillingModule) as unknown[];

    expect(imports.filter((value) => value === OfficialExchangeRateModule)).toHaveLength(1);
    expect(providers).toContain(FiscalIssuanceClock);
    expect(providers).not.toContain(OfficialExchangeRateResolver);
    expect(providers).toContain(BillingDocumentSubmissionPreparationService);
    expect(Reflect.getMetadata("exports",FiscalBillingModule)).toContain(BillingDocumentSubmissionPreparationService);
  });
});
