import { Injectable } from "@nestjs/common";
import { ExchangeRateService } from "../../exchange-rate/exchange-rate.service";
import {
  CurrentExchangeRate,
  ExchangeRateReader,
} from "../../pricing-engine";

@Injectable()
export class CurrentExchangeRateReader implements ExchangeRateReader {
  constructor(
    private readonly exchangeRateService: ExchangeRateService,
  ) {}

  async findCurrent(
    tenantId: string,
  ): Promise<CurrentExchangeRate | null> {
    const rate =
      await this.exchangeRateService.getCurrentExchangeRate(tenantId);

    return rate
      ? {
          id: rate.id,
          date: rate.date,
          buyRate: rate.buyRate,
          sellRate: rate.sellRate,
          source: rate.source,
        }
      : null;
  }
}
