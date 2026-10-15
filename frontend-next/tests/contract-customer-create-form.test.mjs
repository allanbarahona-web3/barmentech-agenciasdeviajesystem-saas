import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const createModalSource = readFileSync(
  new URL("../src/features/customers/components/CustomerCreateModal.tsx", import.meta.url),
  "utf8",
);
const holderStepSource = readFileSync(
  new URL("../src/features/contracts-form/wizard/steps/CustomerLookupStep.tsx", import.meta.url),
  "utf8",
);
const mainCustomersSource = readFileSync(
  new URL("../src/app/admin/customers/page.tsx", import.meta.url),
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

test("Main Customers, Contract holder, and Contract companion use one shared foundation customer sheet", () => {
  for (const source of [holderStepSource, companionsStepSource]) {
    assert.match(source, /<CustomerCreateModal[\s\S]*?includePersonalDetails[\s\S]*?onCustomerCreated/);
    assert.doesNotMatch(source, /presentation=/);
  }
  assert.match(mainCustomersSource, /<CustomerCreateModal[\s\S]*?includePersonalDetails/);
  assert.match(createModalSource, /return \(\n\s*<FormSheet/);
  assert.doesNotMatch(createModalSource, /presentation\??:|presentation =|zIndex: 1000|position: 'fixed'/);
  assert.match(createModalSource, /includePersonalDetails = false/);
});

test("shared Contract customer form includes the approved DOB and emergency relationship controls and payload", () => {
  for (const field of [
    'customer-create-full-name', 'customer-create-id-type', 'customer-create-id-number',
    'customer-create-email', 'customer-create-phone', 'customer-create-date-of-birth',
    'customer-create-nationality', 'customer-create-occupation', 'customer-create-marital-status',
    'customer-create-address', 'customer-create-emergency-name', 'customer-create-emergency-phone',
    'customer-create-emergency-relationship',
  ]) {
    assert.match(createModalSource, new RegExp(`id="${field}"`));
  }
  assert.match(createModalSource, /type="date" value=\{formData\.dateOfBirth \|\| ''\}/);
  assert.match(createModalSource, /EMERGENCY_CONTACT_RELATIONSHIP_OPTIONS/);
  assert.match(createModalSource, /label="Especifique parentesco"/);
  assert.match(createModalSource, /dateOfBirth: dateOfBirth \|\| undefined/);
  assert.match(createModalSource, /emergencyContactRelationship: emergencyContactRelationship \|\| undefined/);
});

test("shared Contract customer form excludes emergency email and broader out-of-scope profile fields", () => {
  for (const field of [
    'emergencyContactEmail', 'preferredLanguage', 'bloodType', 'allergies', 'medicalConditions',
    'medications', 'secondaryPhone', 'secondaryEmail', 'leadSource', 'nextFollowUpDate', 'tags',
  ]) {
    assert.doesNotMatch(createModalSource, new RegExp(field));
  }
});

test("shared Contract customer form retains the friendly duplicate-identification error treatment", () => {
  assert.match(createModalSource, /getDuplicateIdentificationErrorPresentation\(err\)/);
  assert.match(createModalSource, /setError\(includePersonalDetails \? getDuplicateIdentificationErrorPresentation\(err\) \?\? genericError : genericError\)/);
});

test("Companion creation hides lookup before opening the sheet and resumes it after create or cancel", () => {
  assert.match(
    companionsStepSource,
    /function handleOpenCustomerCreate\(\) \{\s*setShowLookupModal\(false\);\s*setIsCreateModalOpen\(true\);\s*\}/,
  );
  assert.match(
    companionsStepSource,
    /function handleCloseCustomerCreate\(\) \{\s*setIsCreateModalOpen\(false\);\s*setShowLookupModal\(true\);\s*\}/,
  );
  assert.match(
    companionsStepSource,
    /function handleCustomerCreated\(customer: CustomerInfo\) \{[\s\S]*?setSearchResults[\s\S]*?setSelectedCompanionCustomer\(newCustomerListItem\)[\s\S]*?setIsCreateModalOpen\(false\);\s*setShowLookupModal\(true\);/,
  );
  assert.match(companionsStepSource, /onClick=\{handleOpenCustomerCreate\}/);
  assert.match(companionsStepSource, /onClose=\{handleCloseCustomerCreate\}/);
});

test("existing companion selection and confirmation semantics remain intact", () => {
  assert.match(companionsStepSource, /async function handleConfirmSelection\(\)/);
  assert.match(companionsStepSource, /const profile = await getCustomerProfile\(selectedCompanionCustomer\.id\);/);
  assert.match(companionsStepSource, /const newState = addCompanionFromCustomer\(prev, \{/);
  assert.match(companionsStepSource, /handleValidateCompanionIdentity\(newCompanionId/);
  assert.match(holderStepSource, /function handleCustomerCreated\(customer: CustomerInfo\) \{[\s\S]*?selectCustomer\(\{/);
});

test("the Contract minor step remains separate from the shared holder and companion customer form", () => {
  assert.match(minorsStepSource, /Fecha de nacimiento/);
  assert.doesNotMatch(minorsStepSource, /CustomerCreateModal/);
});
