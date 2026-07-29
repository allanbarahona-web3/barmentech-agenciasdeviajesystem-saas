import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from "@nestjs/common";
import {
  ExchangeRateMissingError,
  InvalidPricingInputError,
  PricingConfigurationMissingError,
} from "../../pricing-engine";

@Catch(
  PricingConfigurationMissingError,
  InvalidPricingInputError,
  ExchangeRateMissingError,
)
export class PricingEngineBusinessErrorFilter
  implements ExceptionFilter
{
  catch(
    exception:
      | PricingConfigurationMissingError
      | InvalidPricingInputError
      | ExchangeRateMissingError,
    host: ArgumentsHost,
  ): void {
    host
      .switchToHttp()
      .getResponse()
      .status(HttpStatus.UNPROCESSABLE_ENTITY)
      .json({
        statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        code: exception.code,
        message: exception.message,
      });
  }
}
