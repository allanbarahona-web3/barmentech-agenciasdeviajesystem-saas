import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  archivePayloadForCommercialAuthority,
  calculateContractDisplayPassengerQuantity,
  calculatePublishedPricingDisplayTotal,
} from "../src/features/contracts-form/published-pricing-display.ts";

test("Pricing-published display retains five-decimal authority through the final multiplication", () => {
  assert.equal(calculatePublishedPricingDisplayTotal("500.12345", 5), "2500.61725");
});

test("display passenger quantity follows the Contract complete-row rule", () => {
  assert.equal(calculateContractDisplayPassengerQuantity({
    companions: [
      { fullName: "Complete companion", idNumber: "C-1" },
      { fullName: "Missing identification", idNumber: "" },
    ],
    minors: [
      { minorName: "Complete minor", minorId: "M-1" },
      { minorName: "Missing identification", minorId: "" },
      { minorName: "", minorId: "M-2" },
    ],
  }), 3);
});

test("Pricing-published archive payload removes the client total while legacy payload preserves it", () => {
  const payload = { travelPackageId: "package-1", totalAmount: "2500.61725", reservationAmount: "0" };

  assert.deepEqual(archivePayloadForCommercialAuthority(payload, true), {
    travelPackageId: "package-1",
    reservationAmount: "0",
  });
  assert.deepEqual(archivePayloadForCommercialAuthority(payload, false), payload);
});

test("published Pricing price and total are display-only in the travel step", () => {
  const travelStep = readFileSync(
    new URL("../src/features/contracts-form/wizard/steps/travel/TravelStep.tsx", import.meta.url),
    "utf8",
  );
  const wizard = readFileSync(
    new URL("../src/features/contracts-form/wizard/ContractsWizard.tsx", import.meta.url),
    "utf8",
  );

  assert.match(travelStep, /Precio publicado por persona USD/);
  assert.match(travelStep, /readOnly=\{pricingPublished\}/);
  assert.match(wizard, /const price = pricingPublished\n\s*\? sourcePrice/);
  assert.match(wizard, /archivePayloadForCommercialAuthority\(archiveState, pricingPublishedForArchive\)/);
});
