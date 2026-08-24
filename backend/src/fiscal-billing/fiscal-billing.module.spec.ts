import { OfficialExchangeRateModule } from "../official-exchange-rates/official-exchange-rate.module";
import { OfficialExchangeRateResolver } from "../official-exchange-rates/official-exchange-rate.resolver";
import { FiscalBillingModule } from "./fiscal-billing.module";
import { FiscalIssuanceClock } from "./fiscal-issuance.clock";
import { BillingDocumentSubmissionPreparationService } from "./billing-document-submission-preparation.service";
import { BillingDocumentSubmissionAttemptService } from "./billing-document-submission-attempt.service";
import { BillingDocumentSubmissionExecutorService } from "./billing-document-submission-executor.service";
import { BillingDocumentSubmissionOutcomeService } from "./billing-document-submission-outcome.service";
import { FiscalBillingSubmissionProcessor } from "./jobs/fiscal-billing-submission.processor";
import { FacturaEnCrDocumentStatusAdapter } from "./providers/factura-en-cr-document-status.adapter";
import { ELECTRONIC_DOCUMENT_STATUS_PROVIDER } from "./providers/electronic-document-status.provider";
import { ELECTRONIC_DOCUMENT_SUBMISSION_PROVIDER } from "./providers/electronic-document-submission.provider";
import { FacturaEnCrElectronicSubmissionAdapter } from "./providers/factura-en-cr-electronic-submission.adapter";
import { FACTURA_EN_CR_NUMBERING_PROVIDER } from "./factura-en-cr-numbering.provider";
import { FacturaEnCrNumberingAdapter } from "./factura-en-cr-numbering.adapter";
import { BillingDocumentStatusLookupService } from "./billing-document-status-lookup.service";
import { BillingDocumentStatusPersistenceService } from "./billing-document-status-persistence.service";

describe("FiscalBillingModule official-rate wiring", () => {
  it("imports the existing official-rate module without duplicating its resolver", () => {
    const imports = Reflect.getMetadata("imports", FiscalBillingModule) as unknown[];
    const providers = Reflect.getMetadata("providers", FiscalBillingModule) as unknown[];

    expect(imports.filter((value) => value === OfficialExchangeRateModule)).toHaveLength(1);
    expect(providers).toContain(FiscalIssuanceClock);
    expect(providers).not.toContain(OfficialExchangeRateResolver);
    expect(providers).toContain(BillingDocumentSubmissionPreparationService);
    expect(Reflect.getMetadata("exports",FiscalBillingModule)).toContain(BillingDocumentSubmissionPreparationService);
    expect(providers).toContain(BillingDocumentSubmissionAttemptService);
    expect(Reflect.getMetadata("exports",FiscalBillingModule)).toContain(BillingDocumentSubmissionAttemptService);
    expect(providers).toContain(BillingDocumentSubmissionExecutorService);
    expect(Reflect.getMetadata("exports",FiscalBillingModule)).toContain(BillingDocumentSubmissionExecutorService);
    expect(providers).toContain(BillingDocumentSubmissionOutcomeService);
    expect(Reflect.getMetadata("exports",FiscalBillingModule)).toContain(BillingDocumentSubmissionOutcomeService);
    expect(providers).toContain(FiscalBillingSubmissionProcessor);
    expect(providers.filter((value) => value === BillingDocumentStatusLookupService)).toHaveLength(1);
    expect((Reflect.getMetadata("exports", FiscalBillingModule) as unknown[]).filter((value) => value === BillingDocumentStatusLookupService)).toHaveLength(1);
    expect(providers.filter((value) => value === BillingDocumentStatusPersistenceService)).toHaveLength(1);
    expect((Reflect.getMetadata("exports", FiscalBillingModule) as unknown[]).filter((value) => value === BillingDocumentStatusPersistenceService)).toHaveLength(1);
    expect(providers).toContain(FacturaEnCrDocumentStatusAdapter);
    expect(providers).toContainEqual({
      provide: ELECTRONIC_DOCUMENT_STATUS_PROVIDER,
      useExisting: FacturaEnCrDocumentStatusAdapter,
    });
    expect(Reflect.getMetadata("exports",FiscalBillingModule)).toContain(ELECTRONIC_DOCUMENT_STATUS_PROVIDER);
  });

  it("keeps the status token isolated and uniquely exported without module-time HTTP", () => {
    const fetchMock = jest.spyOn(global, "fetch");
    const providers = Reflect.getMetadata("providers", FiscalBillingModule) as unknown[];
    const exports = Reflect.getMetadata("exports", FiscalBillingModule) as unknown[];
    const bindings = providers.filter(
      (provider): provider is { provide: unknown; useExisting: unknown } =>
        typeof provider === "object" && provider !== null && "provide" in provider,
    );

    expect(bindings.filter(({ provide }) => provide === ELECTRONIC_DOCUMENT_STATUS_PROVIDER)).toEqual([{
      provide: ELECTRONIC_DOCUMENT_STATUS_PROVIDER,
      useExisting: FacturaEnCrDocumentStatusAdapter,
    }]);
    expect(exports.filter((value) => value === ELECTRONIC_DOCUMENT_STATUS_PROVIDER)).toHaveLength(1);
    expect(providers.filter((value) => value === FacturaEnCrDocumentStatusAdapter)).toHaveLength(1);
    expect(bindings).toContainEqual({
      provide: ELECTRONIC_DOCUMENT_SUBMISSION_PROVIDER,
      useExisting: FacturaEnCrElectronicSubmissionAdapter,
    });
    expect(bindings).toContainEqual({
      provide: FACTURA_EN_CR_NUMBERING_PROVIDER,
      useExisting: FacturaEnCrNumberingAdapter,
    });
    expect(bindings).not.toContainEqual(expect.objectContaining({
      provide: ELECTRONIC_DOCUMENT_SUBMISSION_PROVIDER,
      useExisting: FacturaEnCrDocumentStatusAdapter,
    }));
    expect(bindings).not.toContainEqual(expect.objectContaining({
      provide: FACTURA_EN_CR_NUMBERING_PROVIDER,
      useExisting: FacturaEnCrDocumentStatusAdapter,
    }));
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockRestore();
  });
});
