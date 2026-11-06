import { BadRequestException } from "@nestjs/common";
import {
  additionalServiceQuotationValidityCalendarDate,
  additionalServiceQuotationValidityDate,
  assertAdditionalServiceQuotationNotExpired,
} from "./additional-service-quotation-validity";

describe("Additional Service quotation validity", () => {
  it("persists a strict calendar date as its UTC-midnight carrier", () => {
    const value = additionalServiceQuotationValidityDate("2026-11-23");

    expect(value.toISOString()).toBe("2026-11-23T00:00:00.000Z");
    expect(additionalServiceQuotationValidityCalendarDate(value)).toBe(
      "2026-11-23",
    );
  });

  it.each(["2026-02-29", "2026-11-31", "2026-2-03", "2026-11-23T00:00:00.000Z"])(
    "rejects invalid calendar-date input %s",
    (value) => {
      expect(() => additionalServiceQuotationValidityDate(value)).toThrow(
        BadRequestException,
      );
    },
  );

  it.each([
    ["America/Costa_Rica", "2026-11-24T05:59:59.999Z", false],
    ["America/Costa_Rica", "2026-11-24T06:00:00.000Z", true],
    ["America/Lima", "2026-11-24T04:59:59.999Z", false],
    ["America/Lima", "2026-11-24T05:00:00.000Z", true],
  ])(
    "allows the selected date through tenant midnight and expires after it in %s",
    async (fiscalTimezone, now, expired) => {
      const database = {
        tenantBillingConfiguration: {
          findUnique: jest.fn().mockResolvedValue({ fiscalTimezone }),
        },
      };
      const validity = additionalServiceQuotationValidityDate("2026-11-23");

      const assertion = assertAdditionalServiceQuotationNotExpired(
        database,
        "tenant-1",
        validity,
        new Date(now),
      );

      if (expired) {
        await expect(assertion).rejects.toMatchObject({
          response: { message: "ADDITIONAL_SERVICE_QUOTATION_EXPIRED" },
        });
      } else {
        await expect(assertion).resolves.toBe(fiscalTimezone);
      }
    },
  );

  it("preserves omitted validity", async () => {
    const database = {
      tenantBillingConfiguration: {
        findUnique: jest.fn().mockResolvedValue({ fiscalTimezone: "America/Lima" }),
      },
    };

    await expect(
      assertAdditionalServiceQuotationNotExpired(
        database,
        "tenant-1",
        null,
        new Date("2026-11-24T05:00:00.000Z"),
      ),
    ).resolves.toBe("America/Lima");
  });
});
