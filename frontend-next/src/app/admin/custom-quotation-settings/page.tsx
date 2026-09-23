"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Pencil, Plus } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PageLoader } from "@/components/loading-spinner";
import { FormField } from "@/components/patterns/form-field";
import { PageHeader } from "@/components/patterns/page-header";
import { SectionCard } from "@/components/patterns/section-card";
import { ToastNotification, useToast } from "@/components/toast-notification";
import {
  FiscalCatalogSelection,
  type FiscalCatalogSelectionState,
} from "@/features/fiscal-catalog/fiscal-catalog-selection";
import { getHomeRouteForRole, getStoredSession } from "@/lib/auth-api";
import {
  createTenantFiscalClassification,
  createTenantPricingPolicy,
  listTenantFiscalClassifications,
  listTenantPricingPolicies,
  updateTenantFiscalClassification,
  updateTenantFiscalClassificationDefault,
  updateTenantFiscalClassificationStatus,
  updateTenantPricingPolicy,
  updateTenantPricingPolicyDefault,
  updateTenantPricingPolicyStatus,
  type TenantFiscalClassification,
  type TenantFiscalClassificationInput,
  type TenantPricingPolicy,
  type TenantPricingPolicyInput,
} from "@/lib/custom-quotation-admin-settings-api";
import { confirmFiscalCatalogCabys } from "@/lib/fiscal-catalog-api";

type PricingPolicyForm = Required<
  Pick<
    TenantPricingPolicyInput,
    | "name"
    | "operationalCostsAmountDefault"
    | "riskMarginPercent"
    | "targetProfitMarginPercent"
    | "salesCommissionPercent"
    | "bankCommissionPercent"
    | "applicableTaxPercent"
  >
> & { description: string };

type FiscalClassificationForm = Required<TenantFiscalClassificationInput> & {
  description: string;
};

const emptyPricingForm: PricingPolicyForm = {
  name: "",
  description: "",
  operationalCostsAmountDefault: "0",
  riskMarginPercent: "0",
  targetProfitMarginPercent: "0",
  salesCommissionPercent: "0",
  bankCommissionPercent: "0",
  applicableTaxPercent: "0",
};

const emptyFiscalForm: FiscalClassificationForm = {
  displayName: "",
  description: "",
  fiscalItemCategory: "SERVICE",
  cabysCode: "",
  unitOfMeasureCode: "",
  taxCode: "",
  taxRateCode: "",
};

function policyToForm(policy: TenantPricingPolicy): PricingPolicyForm {
  return {
    name: policy.name,
    description: policy.description ?? "",
    operationalCostsAmountDefault: policy.operationalCostsAmountDefault,
    riskMarginPercent: policy.riskMarginPercent,
    targetProfitMarginPercent: policy.targetProfitMarginPercent,
    salesCommissionPercent: policy.salesCommissionPercent,
    bankCommissionPercent: policy.bankCommissionPercent,
    applicableTaxPercent: policy.applicableTaxPercent,
  };
}

function fiscalToForm(
  classification: TenantFiscalClassification,
): FiscalClassificationForm {
  return {
    displayName: classification.displayName,
    description: classification.description ?? "",
    fiscalItemCategory: classification.fiscalItemCategory,
    cabysCode: classification.cabysCode,
    unitOfMeasureCode: classification.unitOfMeasureCode,
    taxCode: classification.taxCode,
    taxRateCode: classification.taxRateCode,
  };
}

function messageForSettingsError(error: unknown, fallback: string): string {
  const code = error instanceof Error ? error.message.toUpperCase() : "";
  if (code.includes("DEFAULT_INACTIVE") || code.includes("DEFAULT_REQUIRES_ACTIVE")) {
    return "Una configuración inactiva no puede ser predeterminada.";
  }
  if (code.includes("CONFLICT")) {
    return "Hay un conflicto con la configuración predeterminada. Actualiza la lista e inténtalo de nuevo.";
  }
  if (code.includes("FISCAL") || code.includes("CABYS") || code.includes("TAX")) {
    return "Revisa la combinación de clasificación fiscal, CABYS e impuestos.";
  }
  if (code.includes("403") || code.includes("FORBIDDEN")) {
    return "No tienes permiso para administrar esta configuración.";
  }
  return fallback;
}

function PricingPolicyEditor({
  policy,
  form,
  onChange,
  onSave,
  onClose,
  saving,
  error,
}: {
  policy: TenantPricingPolicy | null;
  form: PricingPolicyForm;
  onChange: (form: PricingPolicyForm) => void;
  onSave: () => void;
  onClose: () => void;
  saving: boolean;
  error: string;
}) {
  const set = <K extends keyof PricingPolicyForm>(key: K, value: PricingPolicyForm[K]) =>
    onChange({ ...form, [key]: value });
  const input = (key: keyof PricingPolicyForm, label: string) => (
    <FormField htmlFor={`pricing-${key}`} label={label} required>
      <Input
        id={`pricing-${key}`}
        type="text"
        inputMode="decimal"
        value={form[key]}
        onChange={(event) => set(key, event.target.value)}
        disabled={saving}
      />
    </FormField>
  );

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
      <DialogContent className="max-w-3xl" showCloseButton={!saving}>
        <DialogHeader>
          <DialogTitle>{policy ? "Editar política de precios" : "Crear política de precios"}</DialogTitle>
          <DialogDescription>
            Los valores se envían como texto exacto. El motor de precios valida y aplica la política.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <FormField htmlFor="pricing-name" label="Nombre" required className="md:col-span-2">
            <Input id="pricing-name" value={form.name} onChange={(event) => set("name", event.target.value)} disabled={saving} />
          </FormField>
          <FormField htmlFor="pricing-description" label="Descripción" className="md:col-span-2">
            <Textarea id="pricing-description" value={form.description} onChange={(event) => set("description", event.target.value)} disabled={saving} />
          </FormField>
          {input("operationalCostsAmountDefault", "Costos operativos predeterminados")}
          {input("riskMarginPercent", "Margen de riesgo (%)")}
          {input("targetProfitMarginPercent", "Margen de utilidad objetivo (%)")}
          {input("salesCommissionPercent", "Comisión de venta (%)")}
          {input("bankCommissionPercent", "Comisión bancaria (%)")}
          {input("applicableTaxPercent", "Impuesto aplicable (%)")}
        </div>
        {error ? <Alert variant="destructive" className="mt-4"><AlertDescription>{error}</AlertDescription></Alert> : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button type="button" onClick={onSave} disabled={saving}>
            {saving ? "Guardando..." : "Guardar política"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FiscalClassificationEditor({
  classification,
  form,
  onChange,
  onSave,
  onClose,
  saving,
  error,
}: {
  classification: TenantFiscalClassification | null;
  form: FiscalClassificationForm;
  onChange: (form: FiscalClassificationForm) => void;
  onSave: () => void;
  onClose: () => void;
  saving: boolean;
  error: string;
}) {
  const set = <K extends keyof FiscalClassificationForm>(key: K, value: FiscalClassificationForm[K]) =>
    onChange({ ...form, [key]: value });
  const [catalogState, setCatalogState] = useState<FiscalCatalogSelectionState>({
    complete: false,
    selectedRate: null,
    unavailable: { cabys: false, unit: false, tax: false, rate: false },
  });
  return (
    <Dialog open onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
      <DialogContent className="max-w-3xl" showCloseButton={!saving}>
        <DialogHeader>
          <DialogTitle>{classification ? "Editar clasificación fiscal" : "Crear clasificación fiscal"}</DialogTitle>
          <DialogDescription>
            El porcentaje de impuesto se obtiene del catálogo fiscal en el backend y no se edita aquí.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <FormField htmlFor="fiscal-name" label="Descripción comercial" required className="md:col-span-2">
            <Input id="fiscal-name" value={form.displayName} onChange={(event) => set("displayName", event.target.value)} disabled={saving} />
          </FormField>
          <FormField htmlFor="fiscal-description" label="Descripción interna" className="md:col-span-2">
            <Textarea id="fiscal-description" value={form.description} onChange={(event) => set("description", event.target.value)} disabled={saving} />
          </FormField>
          <FormField htmlFor="fiscal-category" label="Categoría fiscal" required>
            <Select id="fiscal-category" value={form.fiscalItemCategory} onChange={(event) => set("fiscalItemCategory", event.target.value as FiscalClassificationForm["fiscalItemCategory"])} disabled={saving}>
              <option value="SERVICE">Servicio</option>
              <option value="MERCHANDISE">Mercancía</option>
            </Select>
          </FormField>
          <div className="md:col-span-2">
            <FiscalCatalogSelection
              idPrefix="custom-quotation-fiscal"
              value={form}
              onChange={(next) => onChange({ ...form, ...next })}
              onStateChange={setCatalogState}
              disabled={saving}
              persistedTaxPercentage={classification && form.taxCode === classification.taxCode && form.taxRateCode === classification.taxRateCode ? classification.taxPercentage : null}
            />
          </div>
        </div>
        {!catalogState.complete ? <Alert variant="info" className="mt-4"><AlertDescription>Seleccione valores activos del catálogo fiscal antes de guardar.</AlertDescription></Alert> : null}
        {error ? <Alert variant="destructive" className="mt-4"><AlertDescription>{error}</AlertDescription></Alert> : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button type="button" onClick={onSave} disabled={saving || !catalogState.complete}>
            {saving ? "Guardando..." : "Guardar clasificación"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function CustomQuotationSettingsPage() {
  const router = useRouter();
  const { toasts, showError, showSuccess, dismissToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [policies, setPolicies] = useState<TenantPricingPolicy[]>([]);
  const [classifications, setClassifications] = useState<TenantFiscalClassification[]>([]);
  const [pricingEditor, setPricingEditor] = useState<TenantPricingPolicy | null | undefined>(undefined);
  const [fiscalEditor, setFiscalEditor] = useState<TenantFiscalClassification | null | undefined>(undefined);
  const [pricingForm, setPricingForm] = useState<PricingPolicyForm>(emptyPricingForm);
  const [fiscalForm, setFiscalForm] = useState<FiscalClassificationForm>(emptyFiscalForm);
  const [editorError, setEditorError] = useState("");
  const [saving, setSaving] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [policyPage, fiscalPage] = await Promise.all([
        listTenantPricingPolicies(),
        listTenantFiscalClassifications(),
      ]);
      setPolicies(policyPage.items);
      setClassifications(fiscalPage.items);
    } catch (error) {
      showError(messageForSettingsError(error, "No se pudo cargar la configuración de cotizaciones personalizadas."));
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    const session = getStoredSession();
    if (!session?.user?.id) {
      router.replace("/");
      return;
    }
    const role = String(session.user.role || "").toUpperCase();
    if (role !== "ADMIN") {
      router.replace(getHomeRouteForRole(role));
      return;
    }
    void load();
  }, [load, router]);

  const openPricingEditor = (policy?: TenantPricingPolicy) => {
    setPricingEditor(policy ?? null);
    setPricingForm(policy ? policyToForm(policy) : emptyPricingForm);
    setEditorError("");
  };
  const openFiscalEditor = (classification?: TenantFiscalClassification) => {
    setFiscalEditor(classification ?? null);
    setFiscalForm(classification ? fiscalToForm(classification) : emptyFiscalForm);
    setEditorError("");
  };
  const closeEditors = () => {
    if (saving) return;
    setPricingEditor(undefined);
    setFiscalEditor(undefined);
    setEditorError("");
  };

  const savePricingPolicy = async () => {
    if (saving || pricingEditor === undefined) return;
    setSaving(true);
    setEditorError("");
    const input: TenantPricingPolicyInput = {
      ...pricingForm,
      description: pricingForm.description.trim() || null,
    };
    try {
      if (pricingEditor) await updateTenantPricingPolicy(pricingEditor.id, input);
      else await createTenantPricingPolicy(input);
      setPricingEditor(undefined);
      setEditorError("");
      await load();
      showSuccess(pricingEditor ? "Política de precios actualizada." : "Política de precios creada.");
    } catch (error) {
      setEditorError(messageForSettingsError(error, "No se pudo guardar la política de precios."));
    } finally {
      setSaving(false);
    }
  };

  const saveFiscalClassification = async () => {
    if (saving || fiscalEditor === undefined) return;
    setSaving(true);
    setEditorError("");
    const input: TenantFiscalClassificationInput = {
      ...fiscalForm,
      description: fiscalForm.description.trim() || null,
    };
    try {
      const confirmedCabys = await confirmFiscalCatalogCabys(input.cabysCode);
      const authoritativeInput = { ...input, cabysCode: confirmedCabys.code };
      if (fiscalEditor) await updateTenantFiscalClassification(fiscalEditor.id, authoritativeInput);
      else await createTenantFiscalClassification(authoritativeInput);
      setFiscalEditor(undefined);
      setEditorError("");
      await load();
      showSuccess(fiscalEditor ? "Clasificación fiscal actualizada." : "Clasificación fiscal creada.");
    } catch (error) {
      setEditorError(messageForSettingsError(error, "No se pudo guardar la clasificación fiscal."));
    } finally {
      setSaving(false);
    }
  };

  const runAction = async (id: string, action: () => Promise<unknown>, success: string) => {
    setActionId(id);
    try {
      await action();
      await load();
      showSuccess(success);
    } catch (error) {
      showError(messageForSettingsError(error, "No se pudo actualizar la configuración."));
    } finally {
      setActionId(null);
    }
  };

  if (loading) return <PageLoader message="Cargando configuración de cotizaciones personalizadas..." />;

  const hasPricingDefault = policies.some((policy) => policy.isDefaultForCustomQuotations);
  const hasFiscalDefault = classifications.some((classification) => classification.isDefaultForCustomQuotations);
  const busy = (id: string) => actionId === id;

  return (
    <main className="app-shell space-y-6">
      <ToastNotification toasts={toasts} onDismiss={dismissToast} />
      <PageHeader
        eyebrow="Configuración"
        title="Cotizaciones personalizadas"
        description="Define las políticas comerciales y fiscales predeterminadas que el sistema aplicará al emitir cotizaciones."
      />

      <SectionCard
        title="Política de precios"
        description="Las cotizaciones usan una política activa predeterminada; los cálculos siguen siendo autoridad del backend."
        actions={<Button type="button" onClick={() => openPricingEditor()}><Plus aria-hidden="true" />Crear política</Button>}
      >
        {!hasPricingDefault && policies.length > 0 ? <Alert variant="warning" className="mb-4"><AlertTitle>Falta una predeterminada</AlertTitle><AlertDescription>No hay una configuración predeterminada para cotizaciones personalizadas.</AlertDescription></Alert> : null}
        {policies.length === 0 ? (
          <Alert variant="info"><AlertTitle>No hay una política de precios configurada.</AlertTitle><AlertDescription>Crea una política activa y márcala como predeterminada para cotizaciones personalizadas.</AlertDescription></Alert>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {policies.map((policy) => (
              <article key={policy.id} className="rounded-xl border border-border bg-card p-4 shadow-ui-xs">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div><h2 className="font-semibold text-foreground">{policy.name}</h2>{policy.description ? <p className="mt-1 text-sm text-muted-foreground">{policy.description}</p> : null}</div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant={policy.active ? "success" : "secondary"}>{policy.active ? "Activa" : "Inactiva"}</Badge>
                    {policy.isDefaultForCustomQuotations ? <Badge variant="info"><Check aria-hidden="true" className="size-3" />Predeterminada para cotizaciones personalizadas</Badge> : null}
                  </div>
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <div><dt className="text-muted-foreground">Costos operativos</dt><dd className="font-medium">{policy.operationalCostsAmountDefault}</dd></div>
                  <div><dt className="text-muted-foreground">Margen de riesgo</dt><dd className="font-medium">{policy.riskMarginPercent}%</dd></div>
                  <div><dt className="text-muted-foreground">Utilidad objetivo</dt><dd className="font-medium">{policy.targetProfitMarginPercent}%</dd></div>
                  <div><dt className="text-muted-foreground">Comisión de venta</dt><dd className="font-medium">{policy.salesCommissionPercent}%</dd></div>
                  <div><dt className="text-muted-foreground">Comisión bancaria</dt><dd className="font-medium">{policy.bankCommissionPercent}%</dd></div>
                  <div><dt className="text-muted-foreground">Impuesto aplicable</dt><dd className="font-medium">{policy.applicableTaxPercent}%</dd></div>
                </dl>
                <div className="mt-5 flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => openPricingEditor(policy)}><Pencil aria-hidden="true" />Editar</Button>
                  <Button type="button" size="sm" variant="outline" disabled={busy(`policy-status-${policy.id}`)} onClick={() => void runAction(`policy-status-${policy.id}`, () => updateTenantPricingPolicyStatus(policy.id, !policy.active), policy.active ? "Política desactivada." : "Política activada.")}>{policy.active ? "Desactivar" : "Activar"}</Button>
                  <Button type="button" size="sm" disabled={!policy.active || busy(`policy-default-${policy.id}`)} onClick={() => void runAction(`policy-default-${policy.id}`, () => updateTenantPricingPolicyDefault(policy.id, !policy.isDefaultForCustomQuotations), policy.isDefaultForCustomQuotations ? "Política predeterminada retirada." : "Política predeterminada actualizada.")}>{policy.isDefaultForCustomQuotations ? "Quitar predeterminada" : "Usar como predeterminada"}</Button>
                </div>
              </article>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Configuración fiscal"
        description="La clasificación activa predeterminada se congela al emitir una cotización; los valores fiscales los valida el backend."
        actions={<Button type="button" onClick={() => openFiscalEditor()}><Plus aria-hidden="true" />Crear clasificación</Button>}
      >
        {!hasFiscalDefault && classifications.length > 0 ? <Alert variant="warning" className="mb-4"><AlertTitle>Falta una predeterminada</AlertTitle><AlertDescription>No hay una configuración predeterminada para cotizaciones personalizadas.</AlertDescription></Alert> : null}
        {classifications.length === 0 ? (
          <Alert variant="info"><AlertTitle>No hay una clasificación fiscal configurada.</AlertTitle><AlertDescription>Crea una clasificación activa y márcala como predeterminada para cotizaciones personalizadas.</AlertDescription></Alert>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {classifications.map((classification) => (
              <article key={classification.id} className="rounded-xl border border-border bg-card p-4 shadow-ui-xs">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div><h2 className="font-semibold text-foreground">{classification.displayName}</h2>{classification.description ? <p className="mt-1 text-sm text-muted-foreground">{classification.description}</p> : null}</div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant={classification.isActive ? "success" : "secondary"}>{classification.isActive ? "Activa" : "Inactiva"}</Badge>
                    {classification.isDefaultForCustomQuotations ? <Badge variant="info"><Check aria-hidden="true" className="size-3" />Predeterminada para cotizaciones personalizadas</Badge> : null}
                  </div>
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <div><dt className="text-muted-foreground">Categoría</dt><dd className="font-medium">{classification.fiscalItemCategory === "SERVICE" ? "Servicio" : "Mercancía"}</dd></div>
                  <div><dt className="text-muted-foreground">CABYS</dt><dd className="font-medium">{classification.cabysCode}</dd></div>
                  <div><dt className="text-muted-foreground">Unidad de medida</dt><dd className="font-medium">{classification.unitOfMeasureCode}</dd></div>
                  <div><dt className="text-muted-foreground">Código de impuesto</dt><dd className="font-medium">{classification.taxCode}</dd></div>
                  <div><dt className="text-muted-foreground">Código de tarifa</dt><dd className="font-medium">{classification.taxRateCode}</dd></div>
                  <div><dt className="text-muted-foreground">Porcentaje de impuesto</dt><dd className="font-medium">{classification.taxPercentage}%</dd></div>
                </dl>
                <div className="mt-5 flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => openFiscalEditor(classification)}><Pencil aria-hidden="true" />Editar</Button>
                  <Button type="button" size="sm" variant="outline" disabled={busy(`fiscal-status-${classification.id}`)} onClick={() => void runAction(`fiscal-status-${classification.id}`, () => updateTenantFiscalClassificationStatus(classification.id, !classification.isActive), classification.isActive ? "Clasificación desactivada." : "Clasificación activada.")}>{classification.isActive ? "Desactivar" : "Activar"}</Button>
                  <Button type="button" size="sm" disabled={!classification.isActive || busy(`fiscal-default-${classification.id}`)} onClick={() => void runAction(`fiscal-default-${classification.id}`, () => updateTenantFiscalClassificationDefault(classification.id, !classification.isDefaultForCustomQuotations), classification.isDefaultForCustomQuotations ? "Clasificación predeterminada retirada." : "Clasificación predeterminada actualizada.")}>{classification.isDefaultForCustomQuotations ? "Quitar predeterminada" : "Usar como predeterminada"}</Button>
                </div>
              </article>
            ))}
          </div>
        )}
      </SectionCard>

      {pricingEditor !== undefined ? <PricingPolicyEditor policy={pricingEditor} form={pricingForm} onChange={setPricingForm} onSave={() => void savePricingPolicy()} onClose={closeEditors} saving={saving} error={editorError} /> : null}
      {fiscalEditor !== undefined ? <FiscalClassificationEditor classification={fiscalEditor} form={fiscalForm} onChange={setFiscalForm} onSave={() => void saveFiscalClassification()} onClose={closeEditors} saving={saving} error={editorError} /> : null}
    </main>
  );
}
