import { Injectable } from "@nestjs/common";
import {
  AdditionalServiceFinanceEligibilityAdapter,
  ADDITIONAL_SERVICE_ORDER_LINE_SOURCE_TYPE,
} from "./additional-service-finance-eligibility.adapter";
import {
  ContractFinanceEligibilityAdapter,
} from "./contract-finance-eligibility.adapter";
import {
  financeEligibilitySourceKey,
  normalizeFinanceEligibilitySources,
} from "./finance-eligibility-reader.utils";
import type {
  CommercialSourceRef,
  FinanceEligibilityReader,
  FinanceEligibilityResult,
  ReadFinanceEligibilityRequest,
} from "./finance-eligibility-reader.port";

/** Finance-owned source dispatcher for the neutral eligibility boundary. */
@Injectable()
export class FinanceEligibilityReaderAdapter implements FinanceEligibilityReader {
  constructor(
    private readonly contracts: ContractFinanceEligibilityAdapter,
    private readonly additionalServices: AdditionalServiceFinanceEligibilityAdapter,
  ) {}

  async readMany(
    request: ReadFinanceEligibilityRequest,
  ): Promise<FinanceEligibilityResult[]> {
    const sources = normalizeFinanceEligibilitySources(request.sources);
    if (sources.length === 0) return [];

    const contractSources = sources.filter(
      (source) => source.sourceType === "CONTRACT",
    );
    const additionalServiceSources = sources.filter(
      (source) =>
        source.sourceType === ADDITIONAL_SERVICE_ORDER_LINE_SOURCE_TYPE,
    );
    const [contractResults, additionalServiceResults] = await Promise.all([
      contractSources.length
        ? this.contracts.readMany({ ...request, sources: contractSources })
        : Promise.resolve([]),
      additionalServiceSources.length
        ? this.additionalServices.readMany({
            ...request,
            sources: additionalServiceSources,
          })
        : Promise.resolve([]),
    ]);
    const results = new Map<string, FinanceEligibilityResult>();
    for (const result of [...contractResults, ...additionalServiceResults]) {
      results.set(financeEligibilitySourceKey(result.source), result);
    }
    return sources.map(
      (source) =>
        results.get(financeEligibilitySourceKey(source)) ?? {
          source,
          eligibility: "BLOCKED",
          reason: "FINANCIAL_DATA_MISSING",
        },
    );
  }
}
