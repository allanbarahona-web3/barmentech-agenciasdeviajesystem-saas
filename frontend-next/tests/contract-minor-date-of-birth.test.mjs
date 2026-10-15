import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getMinorDateOfBirthValidationError } from "../src/features/contracts-form/minor-date-of-birth.ts";

const minorsStepSource = readFileSync(
  new URL("../src/features/contracts-form/wizard/steps/minors/MinorsStep.tsx", import.meta.url),
  "utf8",
);
const wizardSource = readFileSync(
  new URL("../src/features/contracts-form/wizard/ContractsWizard.tsx", import.meta.url),
  "utf8",
);
const typesSource = readFileSync(
  new URL("../src/features/contracts-form/types.ts", import.meta.url),
  "utf8",
);
const utilsSource = readFileSync(
  new URL("../src/features/contracts-form/utils.ts", import.meta.url),
  "utf8",
);
const stepValidationSource = readFileSync(
  new URL("../src/features/contracts-form/wizard/validation/step-validation.ts", import.meta.url),
  "utf8",
);

test("MinorsStep renders a required date-only Fecha de nacimiento input without an age field", () => {
  assert.match(minorsStepSource, /Fecha de nacimiento/);
  assert.match(minorsStepSource, /type="date"[\s\S]*?value=\{minor\.dateOfBirth\}[\s\S]*?max=\{getTodayIsoLocal\(\)\}[\s\S]*?required/);
  assert.match(minorsStepSource, /updateMinor\(prev, minor\.id, "dateOfBirth", event\.target\.value\)/);
  assert.doesNotMatch(minorsStepSource, /passengerAge|currentAge|\bAge\b/);
});

test("minor DOB validation requires a value and rejects future values without persisting age", () => {
  assert.equal(
    getMinorDateOfBirthValidationError([{ dateOfBirth: "" }], "2026-10-14"),
    "La fecha de nacimiento es requerida para cada menor.",
  );
  assert.equal(
    getMinorDateOfBirthValidationError([{ dateOfBirth: "2026-10-15" }], "2026-10-14"),
    "La fecha de nacimiento de un menor no puede ser futura.",
  );
  assert.equal(getMinorDateOfBirthValidationError([{ dateOfBirth: "2014-02-28" }], "2026-10-14"), null);
  assert.match(stepValidationSource, /minors: validateMinorsStep/);
  assert.match(typesSource, /export type Minor = \{[\s\S]*?dateOfBirth: string;/);
  assert.match(utilsSource, /minorName: "",\n  dateOfBirth: "",/);
  assert.doesNotMatch(typesSource.slice(typesSource.indexOf("export type Minor"), typesSource.indexOf("export type ItineraryItem")), /age|Age/);
});

test("DOB remains in minor wizard state and is forwarded to the existing resolver and archive payload", () => {
  assert.match(wizardSource, /getMinorDateOfBirthValidationError\([\s\S]*?state\.minors[\s\S]*?getTodayIsoLocal\(\)/);
  assert.match(wizardSource, /resolveMinorCustomer\(\{[\s\S]*?idNumber: minor\.minorId,[\s\S]*?dateOfBirth: minor\.dateOfBirth,/);
  assert.match(wizardSource, /resolvedArchiveState: ContractFormState = \{[\s\S]*?minors: resolvedMinors,/);
  assert.match(wizardSource, /archivePayloadForCommercialAuthority\(archiveState, pricingPublishedForArchive\)/);
});

test("holder, companion, passenger quantity, and commercial totals retain their existing paths", () => {
  assert.match(wizardSource, /!state\.clientFullName\.trim\(\) \|\| !state\.clientIdNumber\.trim\(\) \|\| !state\.clientEmail\.trim\(\)/);
  assert.match(utilsSource, /export const updateCompanion/);
  assert.match(utilsSource, /calculateContractDisplayPassengerQuantity\(\{/);
  assert.match(utilsSource, /recalculateTravelPackageAmounts/);
});
