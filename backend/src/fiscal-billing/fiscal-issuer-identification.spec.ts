import { HttpException } from "@nestjs/common";
import { normalizeAndValidateIssuerIdentification } from "./fiscal-issuer-identification";

describe("fiscal issuer CR identification", () => {
  it.each([
    ["3-102-884562", "3102884562"],
    ["3 102 884562", "3102884562"],
    ["3102884562", "3102884562"],
    ["0012345678", "0012345678"],
  ])("normalizes %p to the canonical string %p", (input, expected) => {
    const result = normalizeAndValidateIssuerIdentification("CR", "02", input);
    expect(result).toBe(expected);
    expect(typeof result).toBe("string");
  });

  it.each(["3A102884562", "3.102884562", "3/102884562", "3_102884562"])(
    "rejects unsupported input %p",
    (input) => expectInvalid("02", input),
  );

  it.each([
    ["01", "123456789"],
    ["02", "1234567890"],
    ["03", "12345678901"],
    ["03", "123456789012"],
    ["04", "1234567890"],
  ])("accepts type %s with number %s", (type, number) => {
    expect(normalizeAndValidateIssuerIdentification("CR", type, number)).toBe(number);
  });

  it.each([
    ["01", "1234567890"],
    ["02", "123456789"],
    ["03", "1234567890"],
    ["03", "1234567890123"],
    ["04", "123456789"],
  ])("rejects type %s with number %s", (type, number) => {
    expectInvalid(type, number);
  });

  it("does not apply CR lengths to a non-CR issuer", () => {
    expect(normalizeAndValidateIssuerIdentification("US", "99", " AB-12 ")).toBe("AB-12");
  });

  it("returns safe details without the identification number", () => {
    try {
      normalizeAndValidateIssuerIdentification("CR", "01", "1234567890");
      throw new Error("Expected validation to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      const exception = error as HttpException;
      expect(exception.getStatus()).toBe(422);
      expect(exception.getResponse()).toMatchObject({
        code: "FISCAL_ISSUER_IDENTIFICATION_INVALID",
        message: "El número de identificación no corresponde al tipo seleccionado.",
        details: {
          identificationTypeCode: "01",
          expectedCanonicalFormat: "9 dígitos",
          receivedCanonicalLength: 10,
        },
      });
      expect(JSON.stringify(exception.getResponse())).not.toContain("1234567890");
    }
  });
});

function expectInvalid(type: string, number: string) {
  expect(() =>
    normalizeAndValidateIssuerIdentification("CR", type, number),
  ).toThrow(
    expect.objectContaining({
      response: expect.objectContaining({
        code: "FISCAL_ISSUER_IDENTIFICATION_INVALID",
      }),
    }),
  );
}
