import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const editModalSource = readFileSync(
  new URL("../src/features/customers/components/CustomerEditModal.tsx", import.meta.url),
  "utf8",
);
const profileSource = readFileSync(
  new URL("../src/app/admin/customers/[id]/page.tsx", import.meta.url),
  "utf8",
);
const holderStepSource = readFileSync(
  new URL("../src/features/contracts-form/wizard/steps/CustomerLookupStep.tsx", import.meta.url),
  "utf8",
);
const companionsStepSource = readFileSync(
  new URL("../src/features/contracts-form/wizard/steps/companions/CompanionsStep.tsx", import.meta.url),
  "utf8",
);
const minorsStepSource = readFileSync(
  new URL("../src/features/contracts-form/wizard/steps/minors/MinorsStep.tsx", import.meta.url),
  "utf8",
);

test("all active customer edit callers use the shared foundation sheet", () => {
  assert.match(editModalSource, /return \(\n\s*<FormSheet/);
  assert.match(editModalSource, /<CustomerForm[\s\S]*?presentation="foundation"/);
  assert.doesNotMatch(editModalSource, /presentation\??:|presentation =|zIndex: 1000|position: 'fixed'/);

  for (const source of [profileSource, holderStepSource, companionsStepSource]) {
    assert.match(source, /<CustomerEditModal[\s\S]*?includePersonalDetails/);
    assert.doesNotMatch(source, /<CustomerEditModal[\s\S]*?presentation=/);
  }
});

test("Holder edit keeps its profile refresh and selected-customer callback path", () => {
  assert.match(holderStepSource, /async function handleEditCustomer\(\)[\s\S]*?getCustomerProfile\(selectedCustomer\.id\)[\s\S]*?setIsEditModalOpen\(true\)/);
  assert.match(holderStepSource, /async function handleSaveCustomer\([\s\S]*?updateCustomer\(selectedCustomer\.id, formData\)[\s\S]*?setSelectedCustomer\([\s\S]*?setState\(/);
  assert.match(holderStepSource, /<CustomerEditModal[\s\S]*?includePersonalDetails[\s\S]*?onSave=\{handleSaveCustomer\}/);
});

test("Companion edit hides lookup before the sheet, then restores it after save or cancel", () => {
  assert.match(
    companionsStepSource,
    /async function handleEditSelectedCompanion\(\)[\s\S]*?getCustomerProfile\(selectedCompanionCustomer\.id\)[\s\S]*?setShowLookupModal\(false\);\s*setShouldResumeLookupAfterEdit\(true\);\s*setIsEditModalOpen\(true\)/,
  );
  assert.match(
    companionsStepSource,
    /function handleCloseCustomerEdit\(\) \{[\s\S]*?setIsEditModalOpen\(false\);[\s\S]*?if \(shouldResumeLookupAfterEdit\) \{\s*setShowLookupModal\(true\);\s*\}/,
  );
  assert.match(companionsStepSource, /<CustomerEditModal[\s\S]*?includePersonalDetails[\s\S]*?onClose=\{handleCloseCustomerEdit\}[\s\S]*?onSave=\{handleSaveCustomerEdit\}/);
  assert.match(companionsStepSource, /handleSaveCustomerEdit[\s\S]*?setSearchResults[\s\S]*?setSelectedCompanionCustomer[\s\S]*?setIsEditModalOpen\(false\)/);
});

test("shared editor retains DOB, relationship, and friendly duplicate-identification behavior", () => {
  assert.match(editModalSource, /dateOfBirth: customer\.dateOfBirth \|\| ''/);
  assert.match(editModalSource, /getEmergencyContactRelationshipFormValue\(customer\.emergencyContactRelationship\)/);
  assert.match(editModalSource, /resolveEmergencyContactRelationship/);
  assert.match(editModalSource, /getDuplicateIdentificationErrorPresentation\(err\)/);
  assert.doesNotMatch(editModalSource, /emergencyContactEmail|preferredLanguage|bloodType|allergies|medicalConditions|secondaryPhone|secondaryEmail/);
});

test("the specialized Minor step remains outside customer editing", () => {
  assert.doesNotMatch(minorsStepSource, /CustomerEditModal/);
});
