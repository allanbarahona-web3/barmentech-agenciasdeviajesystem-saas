import { Injectable } from "@nestjs/common";
import { AdditionalServiceOperationalWorkSourceAdapter } from "../../additional-services/operations-read/additional-service-operational-work-source.adapter";
import { ADDITIONAL_SERVICE_ORDER_LINE_SOURCE } from "./operations-intake-outbox.constants";
import {
  OperationalWorkMaterializationError,
  type OperationalWorkSourceItem,
  type OperationalWorkSourceReader,
  type OperationalWorkSourceReference,
} from "./operational-work-source-reader.port";
import {
  TRAVEL_PACKAGE_COST_COMPONENT_SOURCE_TYPE,
  TravelPackageCostComponentOperationalWorkSourceAdapter,
} from "./travel-package-cost-component-operational-work-source.adapter";

@Injectable()
export class CompositeOperationalWorkSourceReader implements OperationalWorkSourceReader {
  constructor(
    private readonly additionalServices: AdditionalServiceOperationalWorkSourceAdapter,
    private readonly travelPackageCostComponents: TravelPackageCostComponentOperationalWorkSourceAdapter,
  ) {}

  readSourceItem(reference: OperationalWorkSourceReference): Promise<OperationalWorkSourceItem> {
    switch (reference.sourceType) {
      case ADDITIONAL_SERVICE_ORDER_LINE_SOURCE:
        return this.additionalServices.readSourceItem(reference);
      case TRAVEL_PACKAGE_COST_COMPONENT_SOURCE_TYPE:
        return this.travelPackageCostComponents.readSourceItem(reference);
      default:
        throw new OperationalWorkMaterializationError("SOURCE_NOT_FOUND", false, {
          sourceType: reference.sourceType,
        });
    }
  }
}
