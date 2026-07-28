import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from "@nestjs/common";
import {
  InvalidPricingInputError,
  PricingConfigurationMissingError,
} from "../../pricing-engine";

@Catch(
  PricingConfigurationMissingError,
  InvalidPricingInputError,
)
export class PricingEngineBusinessErrorFilter
  implements ExceptionFilter
{
  catch(
    exception:
      | PricingConfigurationMissingError
      | InvalidPricingInputError,
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
