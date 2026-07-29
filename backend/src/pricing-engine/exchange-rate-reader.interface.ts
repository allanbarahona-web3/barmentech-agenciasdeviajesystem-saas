export const EXCHANGE_RATE_READER = Symbol("EXCHANGE_RATE_READER");

export interface CurrentExchangeRate {
  id: string;
  date: Date;
  buyRate: number;
  sellRate: number;
  source: string;
}

export interface ExchangeRateReader {
  findCurrent(tenantId: string): Promise<CurrentExchangeRate | null>;
}
