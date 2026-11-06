import { BadRequestException } from "@nestjs/common";
import { assertCustomQuotationVersionNotExpired } from "./custom-quotation-approval.service";
import {
  canonicalCustomQuotationValidityDate,
  customQuotationValidityDate,
  formatCustomQuotationValidityDate,
  isCustomQuotationValidityExpired,
} from "./custom-quotation-validity";
import { CustomQuotationDeliveryEmailMapper } from "./custom-quotation-delivery-email.mapper";
import { customQuotationProposalTemplate } from "./custom-quotation-proposal.template";

describe("CustomQuotation validity calendar date", () => {
  it.each([
    ["2026-02-28"],
    ["2028-02-29"],
    ["2026-12-31"],
  ])("stores strict calendar date %s at its unchanged UTC-midnight carrier", (value) => {
    const stored = customQuotationValidityDate(value);
    expect(stored.toISOString()).toBe(`${value}T00:00:00.000Z`);
    expect(canonicalCustomQuotationValidityDate(stored)).toBe(value);
  });

  it.each(["2026-02-29", "2026-13-01", "2026-00-01", "2026-04-31", "2026-01-01T12:00:00.000Z", "01/01/2026"])(
    "rejects invalid or non-calendar-only input %s",
    (value) => expect(() => customQuotationValidityDate(value)).toThrow("CUSTOM_QUOTATION_VALID_UNTIL_INVALID"),
  );

  it("reports a legacy non-midnight stored value as ambiguous without rewriting it", () => {
    const legacy = new Date("2026-09-20T12:00:00.000Z");
    expect(() => canonicalCustomQuotationValidityDate(legacy)).toThrow("CUSTOM_QUOTATION_VALID_UNTIL_LEGACY_ENCODING_AMBIGUOUS");
    expect(legacy.toISOString()).toBe("2026-09-20T12:00:00.000Z");
  });

  it.each([
    ["America/Costa_Rica", "2026-09-21T05:59:59.999Z", "2026-09-21T06:00:00.000Z"],
    ["America/Lima", "2026-09-21T04:59:59.999Z", "2026-09-21T05:00:00.000Z"],
    ["America/Argentina/Buenos_Aires", "2026-09-21T02:59:59.999Z", "2026-09-21T03:00:00.000Z"],
  ])("is valid throughout its selected local date in %s", (timezone, lastMoment, expiry) => {
    const validUntil = customQuotationValidityDate("2026-09-20");
    expect(isCustomQuotationValidityExpired(validUntil, timezone, new Date(lastMoment))).toBe(false);
    expect(isCustomQuotationValidityExpired(validUntil, timezone, new Date(expiry))).toBe(true);
  });

  it("uses the DST-observing tenant calendar rather than UTC day boundaries", () => {
    const validUntil = customQuotationValidityDate("2026-03-08");
    expect(isCustomQuotationValidityExpired(validUntil, "America/New_York", new Date("2026-03-09T03:59:59.999Z"))).toBe(false);
    expect(isCustomQuotationValidityExpired(validUntil, "America/New_York", new Date("2026-03-09T04:00:00.000Z"))).toBe(true);
  });

  it.each([
    ["America/Costa_Rica", "2028-02-29", "2028-03-01T05:59:59.999Z", "2028-03-01T06:00:00.000Z"],
    ["America/Argentina/Buenos_Aires", "2026-12-31", "2027-01-01T02:59:59.999Z", "2027-01-01T03:00:00.000Z"],
  ])("handles leap-day and year boundaries in %s", (timezone, validUntil, lastMoment, expiry) => {
    const date = customQuotationValidityDate(validUntil);
    expect(isCustomQuotationValidityExpired(date, timezone, new Date(lastMoment))).toBe(false);
    expect(isCustomQuotationValidityExpired(date, timezone, new Date(expiry))).toBe(true);
  });

  it("uses the quotation tenant configuration for approval and keeps absent validity valid", async () => {
    const tx = {
      tenantBillingConfiguration: { findUnique: jest.fn().mockResolvedValue({ fiscalTimezone: "America/Argentina/Buenos_Aires" }) },
    } as any;
    const validUntil = customQuotationValidityDate("2026-09-20");

    await expect(assertCustomQuotationVersionNotExpired(tx, "tenant-a", validUntil, new Date("2026-09-21T02:59:59.999Z"))).resolves.toBe("America/Argentina/Buenos_Aires");
    await expect(assertCustomQuotationVersionNotExpired(tx, "tenant-a", validUntil, new Date("2026-09-21T03:00:00.000Z"))).rejects.toBeInstanceOf(BadRequestException);
    await expect(assertCustomQuotationVersionNotExpired(tx, "tenant-a", null, new Date("2026-09-21T03:00:00.000Z"))).resolves.toBe("America/Argentina/Buenos_Aires");
    expect(tx.tenantBillingConfiguration.findUnique).toHaveBeenCalledWith({ where: { tenantId: "tenant-a" }, select: { fiscalTimezone: true } });
  });

  it("renders the canonical selected date in delivery email without timezone projection", () => {
    const message = new CustomQuotationDeliveryEmailMapper().map({
      customerName: "Ana", quotationNumber: "CQ-1", title: null, currency: "USD", finalSellingPrice: "1",
      quotationValidUntil: customQuotationValidityDate("2026-09-20"), approvalUrl: "https://example.test/approval",
    });
    expect(formatCustomQuotationValidityDate(customQuotationValidityDate("2026-09-20"))).toBe("20/09/2026");
    expect(message.templateData.message).toContain("Vigencia: 20/09/2026.");
  });

  it("renders the canonical selected date in newly generated proposal content", () => {
    const html = customQuotationProposalTemplate({
      company: { name: "Viajes", legalId: null, contactEmail: null, contactPhone: null, logoSrc: null, primaryColor: null },
      quotationNumber: "CQ-1", versionNumber: 1, issuedAt: new Date("2026-09-20T03:00:00.000Z"),
      quotationValidUntil: customQuotationValidityDate("2026-09-20"), timezone: "America/Argentina/Buenos_Aires",
      customer: { fullName: "Ana", identification: null, email: null, phone: null }, title: null,
      lines: [{ displayOrder: 1, description: "Servicio", quantity: "1", commercialNote: null }],
      paymentConditionType: null, paymentTermValue: null, paymentTermUnit: null, commercialObservations: null,
      currency: "USD", finalSellingPrice: "1",
    });
    expect(html).toContain("20/09/2026");
  });
});
