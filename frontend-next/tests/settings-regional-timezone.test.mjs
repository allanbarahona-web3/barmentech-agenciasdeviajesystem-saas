import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");
const settings = source("app/settings/page.tsx");
const authApi = source("lib/auth-api.ts");
const provider = source("shared/regional/tenant-regional-provider.tsx");
const fiscalPage = source("app/admin/fiscal-billing/page.tsx");
const fiscalApi = source("lib/fiscal-billing-admin-api.ts");

test("tenant settings contract loads and conditionally saves the general timezone", () => {
  assert.match(authApi, /timeZone: string/);
  assert.match(authApi, /timeZone\?: string/);
  assert.match(settings, /setTimeZone\(data\.timeZone \|\| ""\)/);
  assert.match(settings, /setSavedTimeZone\(data\.timeZone \|\| ""\)/);
  assert.match(settings, /const timeZoneChanged = normalizedTimeZone !== savedTimeZone\.trim\(\)/);
  assert.match(settings, /\.\.\.\(timeZoneChanged \? \{ timeZone: normalizedTimeZone \} : \{\}\)/);
});

test("regional settings offer searchable IANA choices without replacing invalid stored data", () => {
  assert.match(settings, /Configuración regional/);
  assert.match(settings, /Zona horaria/);
  assert.match(settings, /Intl\.supportedValuesOf\?\.\("timeZone"\)/);
  assert.match(settings, /America\/Costa_Rica/);
  assert.match(settings, /America\/Lima/);
  assert.match(settings, /Argentina, Buenos Aires — America\/Argentina\/Buenos_Aires/);
  assert.match(settings, /Buscar por país, ciudad o identificador IANA/);
  assert.match(settings, /Perú, Lima o America\/Lima/);
  assert.match(settings, /<Select/);
  assert.match(settings, /valueIsValid && currentTimeZone && !timeZoneOptions\.includes\(currentTimeZone\)/);
  assert.match(settings, /no se seleccionará ni guardará un reemplazo automático/);
  assert.match(settings, /Seleccione una zona horaria IANA válida antes de guardar\./);
});

test("a successful timezone write refreshes regional displays separately from save failure", () => {
  assert.match(settings, /await refreshRegionalConfiguration\(\)/);
  assert.match(settings, /La configuración se guardó, pero no se pudo actualizar la zona horaria activa/);
  assert.match(settings, /if \(saving\) return/);
  assert.match(provider, /refreshRegionalConfiguration: \(\) => Promise<void>/);
  assert.match(provider, /const requestId = requestSequence\.current \+ 1/);
  assert.match(provider, /token !== getStoredToken\(\)/);
  assert.match(provider, /requestId !== requestSequence\.current/);
  assert.match(provider, /normalizeTenantTimeZone\(profile\.tenant\?\.fiscalTimezone\)/);
});

test("fiscal configuration no longer edits or submits the tenant timezone", () => {
  const fiscalSave = fiscalPage.slice(
    fiscalPage.indexOf("await updateTenantBillingConfiguration({"),
    fiscalPage.indexOf("setConfigured(response.configured)"),
  );
  const fiscalUpdateType = fiscalApi.slice(
    fiscalApi.indexOf("export type UpdateTenantBillingConfiguration"),
    fiscalApi.indexOf("export type FiscalBillingAdminErrorDetails"),
  );

  assert.doesNotMatch(fiscalPage, /Zona horaria fiscal/);
  assert.doesNotMatch(fiscalSave, /fiscalTimezone/);
  assert.doesNotMatch(fiscalUpdateType, /\| 'fiscalTimezone'/);
});
