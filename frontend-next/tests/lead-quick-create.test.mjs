import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  toCreateLeadInput,
  validateLeadQuickCreate,
} from '../src/features/leads/lead-quick-create.ts';

const modalSource = readFileSync(
  new URL('../src/features/leads/components/LeadQuickCreateModal.tsx', import.meta.url),
  'utf8',
);
const apiSource = readFileSync(new URL('../src/lib/leads-api.ts', import.meta.url), 'utf8');

test('el modal de prospecto usa la hoja compartida y muestra únicamente campos comerciales', () => {
  assert.match(modalSource, /<FormSheet\s+open=\{isOpen\}/);
  assert.match(modalSource, /title="Crear prospecto"/);
  assert.match(modalSource, /label="Nombre completo"/);
  assert.match(modalSource, /label="Correo electrónico"/);
  assert.match(modalSource, /label="Teléfono"/);
  assert.match(modalSource, /label="Empresa"/);
  assert.doesNotMatch(modalSource, /Tipo de identificación|Número de identificación|Dirección fiscal|Nacionalidad|Contacto de emergencia/i);
});

test('la validación exige nombre y correo, y conserva los campos opcionales al preparar el envío', () => {
  assert.equal(validateLeadQuickCreate({ fullName: '', email: 'ana@example.com', phone: '', companyName: '' }), 'El nombre completo es requerido.');
  assert.equal(validateLeadQuickCreate({ fullName: 'Ana', email: '', phone: '', companyName: '' }), 'El correo electrónico es requerido.');
  assert.equal(validateLeadQuickCreate({ fullName: 'Ana', email: 'correo-invalido', phone: '', companyName: '' }), 'Ingrese un correo electrónico válido.');
  assert.equal(validateLeadQuickCreate({ fullName: 'Ana', email: 'ana@example.com', phone: '', companyName: '' }), null);
  assert.deepEqual(
    toCreateLeadInput({ fullName: ' Ana ', email: ' ANA@EXAMPLE.COM ', phone: ' 8888-9999 ', companyName: ' Viajes CR ' }),
    { fullName: 'Ana', email: 'ana@example.com', phone: '8888-9999', companyName: 'Viajes CR' },
  );
});

test('la creación usa exclusivamente la API de prospectos y devuelve el resultado al padre', () => {
  assert.match(apiSource, /\$\{apiBase\}\/leads/);
  assert.match(modalSource, /await createLead\(toCreateLeadInput\(values\)\)/);
  assert.match(modalSource, /onLeadCreated\(lead\)/);
  assert.doesNotMatch(modalSource, /customers-api|createCustomer|custom-quotations|createCustomQuotation/i);
});

test('el envío muestra estado de carga y conserva los datos cuando la API falla', () => {
  assert.match(modalSource, /LoaderCircle className="animate-spin"/);
  assert.match(modalSource, /Creando…/);
  assert.match(modalSource, /disabled=\{isSaving\}/);
  assert.match(modalSource, /setError\('No se pudo crear el prospecto\. Verifique los datos e intente nuevamente\.'\)/);
  assert.doesNotMatch(modalSource, /setValues\(emptyLeadQuickCreateValues\);\s*setError\('No se pudo crear el prospecto/);
});
