import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  EMERGENCY_CONTACT_RELATIONSHIP_OPTIONS,
  EMERGENCY_CONTACT_RELATIONSHIP_OTHER,
  getEmergencyContactRelationshipFormValue,
  resolveEmergencyContactRelationship,
} from '../src/features/customers/emergency-contact-relationship.ts';
import { getDuplicateIdentificationErrorPresentation } from '../src/features/customers/customer-request-error.ts';
import { isMinorCustomerAge } from '../src/features/customers/customer-age-presentation.ts';

const apiSource = readFileSync(new URL('../src/lib/customers-api.ts', import.meta.url), 'utf8');
const createModalSource = readFileSync(new URL('../src/features/customers/components/CustomerCreateModal.tsx', import.meta.url), 'utf8');
const editModalSource = readFileSync(new URL('../src/features/customers/components/CustomerEditModal.tsx', import.meta.url), 'utf8');
const editFormSource = readFileSync(new URL('../src/features/customers/components/CustomerForm.tsx', import.meta.url), 'utf8');
const customerListSource = readFileSync(new URL('../src/app/admin/customers/page.tsx', import.meta.url), 'utf8');
const profileSource = readFileSync(new URL('../src/app/admin/customers/[id]/page.tsx', import.meta.url), 'utf8');
const profileHeaderSource = profileSource.match(/<PageHeader[\s\S]*?\/>\n\n      <nav/)?.[0] ?? '';
const customerInformationSource = profileSource.match(/\/\* Section 1: Customer Information \*\/[\s\S]*?\/\* Section 2: Statistics \*\//)?.[0] ?? '';

test('customer API types expose DOB, relationship, and backend-derived age', () => {
  assert.match(apiSource, /dateOfBirth: string \| null;/);
  assert.match(apiSource, /age: number \| null;/);
  assert.match(apiSource, /emergencyContactRelationship: string \| null;/);
  assert.match(apiSource, /export interface UpdateCustomerDto[\s\S]*emergencyContactRelationship\?: string \| null[\s\S]*dateOfBirth\?: string \| null/);
  assert.match(apiSource, /export interface CreateCustomerDto[\s\S]*emergencyContactRelationship\?: string \| null[\s\S]*dateOfBirth\?: string \| null/);
});

test('admin customer creation renders DOB and all compact relationship options', () => {
  assert.match(customerListSource, /<CustomerCreateModal[\s\S]*includePersonalDetails/);
  assert.match(createModalSource, /label="Fecha de nacimiento"/);
  assert.match(createModalSource, /id="customer-create-date-of-birth" type="date"/);
  assert.match(createModalSource, /label="Parentesco"/);
  assert.deepEqual(EMERGENCY_CONTACT_RELATIONSHIP_OPTIONS, [
    'Padre / Madre', 'Hermano(a)', 'Hijo(a)', 'Tío(a)', 'Abuelo(a)', 'Sobrino(a)', 'Pareja / Cónyuge', 'Otro',
  ]);
  assert.match(createModalSource, /dateOfBirth: dateOfBirth \|\| undefined/);
  assert.match(createModalSource, /emergencyContactRelationship: emergencyContactRelationship \|\| undefined/);
});

test('create and edit use the same applicable foundation field order and relationship controls', () => {
  const createFieldOrder = [
    'customer-create-full-name', 'customer-create-id-type', 'customer-create-id-number', 'customer-create-email',
    'customer-create-phone', 'customer-create-date-of-birth', 'customer-create-occupation',
    'customer-create-emergency-name', 'customer-create-emergency-phone', 'customer-create-emergency-relationship',
    'customer-create-nationality', 'customer-create-marital-status', 'customer-create-address',
  ];
  const editFieldOrder = createFieldOrder.map((field) => field.replace('customer-create', 'customer-edit'));
  let previousIndex = -1;
  for (const field of createFieldOrder) {
    const index = createModalSource.indexOf(`id="${field}"`);
    assert.ok(index > previousIndex, `${field} follows the Create layout order`);
    previousIndex = index;
  }
  previousIndex = -1;
  for (const field of editFieldOrder) {
    const index = editFormSource.indexOf(`id="${field}"`);
    assert.ok(index > previousIndex, `${field} follows the Edit layout order`);
    previousIndex = index;
  }
  assert.match(editFormSource, /readOnly aria-readonly="true"/);
  assert.match(createModalSource, /EMERGENCY_CONTACT_RELATIONSHIP_OPTIONS/);
  assert.match(editFormSource, /EMERGENCY_CONTACT_RELATIONSHIP_OPTIONS/);
});

test('profile editing preloads DOB and relationship state and sends explicit null when cleared', () => {
  assert.match(editModalSource, /getEmergencyContactRelationshipFormValue\(customer\.emergencyContactRelationship\)\.option/);
  assert.match(editModalSource, /getEmergencyContactRelationshipFormValue\(customer\.emergencyContactRelationship\)\.customValue/);
  assert.match(editModalSource, /dateOfBirth: customer\.dateOfBirth \|\| ''/);
  assert.match(editModalSource, /dateOfBirth: dateOfBirth \|\| null/);
  assert.match(editModalSource, /emergencyContactRelationship,/);
  assert.match(editFormSource, /id="customer-edit-date-of-birth" type="date"/);
  assert.match(editFormSource, /id="customer-edit-emergency-relationship"/);
  assert.match(profileSource, /dateOfBirth: formData\.dateOfBirth \?\? null/);
  assert.match(profileSource, /emergencyContactRelationship: formData\.emergencyContactRelationship \?\? null/);
});

test('predefined relationships persist their displayed value and Otro persists trimmed custom text', () => {
  for (const relationship of ['Padre / Madre', 'Hermano(a)', 'Pareja / Cónyuge']) {
    assert.equal(resolveEmergencyContactRelationship({ option: relationship, customValue: 'stale value' }), relationship);
  }
  assert.equal(resolveEmergencyContactRelationship({ option: EMERGENCY_CONTACT_RELATIONSHIP_OTHER, customValue: '  Tutor legal  ' }), 'Tutor legal');
  assert.equal(resolveEmergencyContactRelationship({ option: EMERGENCY_CONTACT_RELATIONSHIP_OTHER, customValue: '   ' }), null);
});

test('historical relationships preload either a matching option or Otro with the preserved custom value', () => {
  assert.deepEqual(getEmergencyContactRelationshipFormValue('Padre / Madre'), { option: 'Padre / Madre', customValue: '' });
  assert.deepEqual(getEmergencyContactRelationshipFormValue('Tutor legal'), { option: 'Otro', customValue: 'Tutor legal' });
  assert.deepEqual(getEmergencyContactRelationshipFormValue(null), { option: '', customValue: '' });
  assert.match(createModalSource, /label="Especifique parentesco"/);
  assert.match(editFormSource, /label="Especifique parentesco"/);
});

test('switching away from Otro clears stale custom text and an empty selection resolves to null', () => {
  assert.match(createModalSource, /setRelationshipOption\([^]*setCustomRelationship\(''\)/);
  assert.match(editFormSource, /emergencyContactRelationshipOption:[^]*emergencyContactRelationshipCustom: ''/);
  assert.equal(resolveEmergencyContactRelationship({ option: '', customValue: 'Tutor legal' }), null);
});

test('profile card renders only the approved MVP fields, including backend age and DOB', () => {
  assert.match(profileHeaderSource, /customer\.age != null \? <span[^>]*>\{customer\.age\} años<\/span> : null/);
  assert.doesNotMatch(profileHeaderSource, /customer\.idNumber|customer\.email/);
  assert.match(profileSource, /formatBusinessDate\(customer\.dateOfBirth\)/);
  assert.doesNotMatch(profileSource, /calculateAge|dateOfBirth.*getFullYear|age.*dateOfBirth/);
  assert.match(customerInformationSource, /Cédula\/ID/);
  assert.match(customerInformationSource, /Email/);
  assert.match(customerInformationSource, /Fecha de nacimiento/);
  assert.match(customerInformationSource, /Edad/);
  assert.match(customerInformationSource, /Nacionalidad|Ocupación|Dirección/);
  assert.match(customerInformationSource, /Contacto de emergencia — nombre/);
  assert.match(customerInformationSource, /Contacto de emergencia — teléfono/);
  assert.match(customerInformationSource, /Contacto de emergencia — parentesco/);
  assert.match(customerInformationSource, /customer\.emergencyContactRelationship \|\| '-'/);
  assert.match(customerInformationSource, /Estado del cliente/);
  for (const outOfScopeField of [
    'Idioma preferido', 'Tipo de sangre', 'Alergias', 'Condiciones médicas', 'Medicamentos',
    'Ciudad', 'País', 'Código postal', 'Teléfono secundario', 'Email secundario',
    'Fuente de lead', 'Último contacto', 'Próximo seguimiento', 'Etiquetas',
  ]) {
    assert.doesNotMatch(customerInformationSource, new RegExp(outOfScopeField));
  }
  assert.doesNotMatch(profileSource, /Contacto de emergencia — correo/);
  assert.doesNotMatch(profileSource, /Información adicional del perfil/);
  assert.match(profileSource, /Estadísticas/);
  assert.match(profileSource, /Notas operativas/);
});

test('minor icon is derived only from backend age and remains beside the customer name', () => {
  assert.equal(isMinorCustomerAge(17), true);
  assert.equal(isMinorCustomerAge(18), false);
  assert.equal(isMinorCustomerAge(null), false);
  assert.match(profileHeaderSource, /isCustomerMinor \? <Baby aria-hidden="true"/);
  assert.match(profileHeaderSource, /\{customer\.age\} años/);
});

test('duplicate-identification conflicts present a friendly message with the existing customer name', () => {
  const presentation = getDuplicateIdentificationErrorPresentation(new Error(JSON.stringify({
    statusCode: 409,
    error: 'Conflict',
    message: 'Ya existe un cliente con este número de identificación pero la información no coincide. Cliente existente: "Allan Barahona".',
  })));

  assert.deepEqual(presentation, {
    title: 'Número de identificación ya registrado',
    message: 'Este número de identificación ya está asociado a: Allan Barahona.',
    guidance: 'Verifique el número ingresado o utilice el cliente existente.',
  });
  assert.doesNotMatch(`${presentation?.title} ${presentation?.message}`, /statusCode|Conflict|\{"/);
  assert.match(createModalSource, /getDuplicateIdentificationErrorPresentation\(err\)/);
  assert.match(editModalSource, /getDuplicateIdentificationErrorPresentation\(err\)/);
});

test('duplicate-identification conflicts fall back safely without a name and unrelated errors keep their existing handling', () => {
  const fallback = getDuplicateIdentificationErrorPresentation(new Error(JSON.stringify({
    statusCode: 409,
    error: 'Conflict',
    message: 'Ya existe un cliente con este número de identificación.',
  })));
  assert.deepEqual(fallback, {
    title: 'Número de identificación ya registrado',
    message: 'Ya existe un cliente con este número de identificación.',
    guidance: 'Verifique el número ingresado o utilice el cliente existente.',
  });
  assert.equal(getDuplicateIdentificationErrorPresentation(new Error('No se pudo conectar con el servidor')), null);
});

test('active customer create and edit forms do not render an emergency-contact email input', () => {
  assert.doesNotMatch(createModalSource, /emergencyContactEmail|Contacto de emergencia.*correo|Email de emergencia/);
  assert.doesNotMatch(editModalSource, /emergencyContactEmail|Contacto de emergencia.*correo|Email de emergencia/);
  assert.doesNotMatch(editFormSource, /emergencyContactEmail|Contacto de emergencia.*correo|Email de emergencia/);
});

test('shared modals leave contract and quotation callers on their existing field set', () => {
  assert.match(createModalSource, /includePersonalDetails = false/);
  assert.match(editModalSource, /includePersonalDetails = false/);
  assert.match(createModalSource, /includePersonalDetails[\s\S]*\? \{[\s\S]*dateOfBirth/);
  assert.match(editModalSource, /includePersonalDetails[\s\S]*\? \{[\s\S]*dateOfBirth/);
});
