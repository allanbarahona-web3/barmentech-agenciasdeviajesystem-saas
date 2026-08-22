import { PrismaModule } from "../prisma/prisma.module";
import { BccrOfficialExchangeRateAdapter } from "./bccr-official-exchange-rate.adapter";
import { OfficialExchangeRateModule } from "./official-exchange-rate.module";
import { OFFICIAL_EXCHANGE_RATE_PROVIDER } from "./official-exchange-rate.provider";
import { OFFICIAL_EXCHANGE_RATE_REPOSITORY } from "./official-exchange-rate.repository";
import { OfficialExchangeRateResolver } from "./official-exchange-rate.resolver";
import { PrismaOfficialExchangeRateRepository } from "./prisma-official-exchange-rate.repository";

describe("OfficialExchangeRateModule", () => {
  it("wires the existing provider and global repository without performing work", () => {
    const providers = Reflect.getMetadata("providers", OfficialExchangeRateModule);
    const imports = Reflect.getMetadata("imports", OfficialExchangeRateModule);
    const exports = Reflect.getMetadata("exports", OfficialExchangeRateModule);

    expect(imports).toEqual([PrismaModule]);
    expect(providers).toEqual(expect.arrayContaining([
      BccrOfficialExchangeRateAdapter,
      PrismaOfficialExchangeRateRepository,
      OfficialExchangeRateResolver,
      { provide: OFFICIAL_EXCHANGE_RATE_PROVIDER, useExisting: BccrOfficialExchangeRateAdapter },
      { provide: OFFICIAL_EXCHANGE_RATE_REPOSITORY, useExisting: PrismaOfficialExchangeRateRepository },
    ]));
    expect(exports).toEqual([OfficialExchangeRateResolver]);
  });
});
