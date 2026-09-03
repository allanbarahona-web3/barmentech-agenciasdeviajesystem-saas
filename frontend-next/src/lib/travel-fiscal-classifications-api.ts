import { apiGet } from './api-client';
import type {
  TravelFiscalClassificationOption,
  TravelFiscalClassificationUsage,
} from './travel-fiscal-classification';

export function listTravelFiscalClassifications(
  usage: TravelFiscalClassificationUsage,
): Promise<TravelFiscalClassificationOption[]> {
  return apiGet('/additional-services/catalog/travel-fiscal-classifications', {
    params: { usage },
  });
}
