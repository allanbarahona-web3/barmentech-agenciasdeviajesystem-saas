import {
  CLIENT_IDENTIFICATION_TYPES,
  ClientIdentificationError,
  normalizeAndValidateClientIdentification,
} from "./client-identification";
import { normalizeLegacyClientIdentificationForRead } from "./utils/normalize-identification";

describe("Client identification canonicalization", () => {
  function expectIdentificationError(
    operation: () => unknown,
    code:
      | "CLIENT_IDENTIFICATION_TYPE_INVALID"
      | "CLIENT_IDENTIFICATION_NUMBER_INVALID",
  ) {
    let error: unknown;
    try {
      operation();
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(ClientIdentificationError);
    expect(error).toMatchObject({ code });
  }

  it("defines the exact closed canonical vocabulary", () => {
    expect(CLIENT_IDENTIFICATION_TYPES).toEqual([
      "CEDULA_FISICA",
      "CEDULA_JURIDICA",
      "DIMEX",
      "NITE",
      "PASAPORTE",
      "OTHER",
    ]);
  });

  it.each([
    ["CEDULA_FISICA", "303570962", "303570962"],
    ["CEDULA_FISICA", "3-357-962", "303570962"],
    ["CEDULA_FISICA", "0303570962", "303570962"],
    ["CEDULA_FISICA", "1-2345-6789", "123456789"],
    ["CEDULA_JURIDICA", "3-101-123456", "3101123456"],
    ["DIMEX", "1-234-56789012", "123456789012"],
    ["NITE", "1-234-567890", "1234567890"],
    ["PASAPORTE", " P-12345 ", "P-12345"],
    ["OTHER", " FOREIGN-ID ", "FOREIGN-ID"],
  ] as const)("normalizes a valid %s identity", (idType, idNumber, expected) => {
    expect(normalizeAndValidateClientIdentification(idType, idNumber)).toEqual({
      idType,
      idNumber: expected,
    });
  });

  it.each([
    ["CEDULA_FISICA", "0012345678"],
    ["CEDULA_JURIDICA", "123456789"],
    ["DIMEX", "223456789012"],
    ["DIMEX", "12345678901"],
    ["NITE", "123456789"],
    ["PASAPORTE", "   "],
    ["OTHER", ""],
  ] as const)("rejects an invalid %s identity", (idType, idNumber) => {
    expectIdentificationError(
      () => normalizeAndValidateClientIdentification(idType, idNumber),
      "CLIENT_IDENTIFICATION_NUMBER_INVALID",
    );
  });

  it.each(["Cedula", "CEDULA", "JURIDICA", "ARBITRARY", "", null])(
    "rejects non-canonical type %p",
    (idType) => {
      expectIdentificationError(
        () => normalizeAndValidateClientIdentification(idType, "123456789"),
        "CLIENT_IDENTIFICATION_TYPE_INVALID",
      );
    },
  );

  it("returns stable domain errors without persisting or guessing a type", () => {
    let error: unknown;
    try {
      normalizeAndValidateClientIdentification("CEDULA_FISICA", "invalid");
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(ClientIdentificationError);
    expect(error).toMatchObject({ code: "CLIENT_IDENTIFICATION_NUMBER_INVALID" });
  });

  it("isolates temporary legacy read normalization from canonical rules", () => {
    expect(normalizeLegacyClientIdentificationForRead("Cedula", "1-2345-6789")).toBe(
      "0123456789",
    );
    expect(
      normalizeLegacyClientIdentificationForRead(
        "CEDULA_FISICA",
        "1-2345-6789",
      ),
    ).toBe("");
  });
});
