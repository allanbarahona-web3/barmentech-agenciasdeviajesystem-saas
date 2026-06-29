"use client";

import {
  archiveContract,
  getContractDraft,
  reserveNextContractNumber,
  saveContractDraft,
} from "@/lib/contracts-api";
import { bootstrapBillingContract } from "@/lib/billing-api";
import { getTenantLegalConfig, getTenantConfig, type TenantLegalConfig } from "@/lib/auth-api";
import { getTravelPackageById, type TravelPackage } from "@/lib/travel-packages-api";
import { getInternalTripById } from "@/lib/internal-trips-api";
import { getAllBankAccounts } from "@/lib/bank-accounts-api";
import { buildContractPdfHtml, type TenantLegalInfo, type BankAccountForContract } from "@/features/contracts-form/pdf-template";
import { calculateParticipants } from "@/features/contracts-form/capacity-validation";
import { ConfirmModal } from "@/components/confirm-modal";
import {
  addCompanion,
  addCustomItineraryItem,
  addMinor,
  applyMoneyDerivedValues,
  createInitialFormState,
  getDateRangeValidityMessage,
  getItineraryValidityMessage,
  getTodayIsoLocal,
  toLocalDateIso,
  normalizeMoneyInputValue,
  removeCompanion,
  removeCustomItineraryItem,
  removeMinor,
  syncTourDates,
  addDaysIso,
  updateCompanion,
  updateItineraryItem,
  updateMinor,
} from "@/features/contracts-form/utils";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ContractFormState } from "@/features/contracts-form/types";

const NATIONALITY_OPTIONS = [
  "Costa Rica",
  "──────────",
  "Argentina",
  "Antigua y Barbuda",
  "Bahamas",
  "Barbados",
  "Belice",
  "Bolivia",
  "Brasil",
  "Canadá",
  "Chile",
  "Colombia",
  "Cuba",
  "Dominica",
  "Ecuador",
  "El Salvador",
  "Estados Unidos",
  "Granada",
  "Guatemala",
  "Guyana",
  "Haití",
  "Honduras",
  "Jamaica",
  "México",
  "Nicaragua",
  "Panamá",
  "Paraguay",
  "Perú",
  "República Dominicana",
  "San Cristóbal y Nieves",
  "Santa Lucía",
  "San Vicente y las Granadinas",
  "Surinam",
  "Trinidad y Tobago",
  "Uruguay",
  "Venezuela",
  "──────────",
  "Otro",
];

type ContractsFormProps = {
  agent?: {
    id: string;
    email: string;
    fullName: string;
    role?: string;
  } | null;
  initialDraftId?: string | null;
  initialTravelPackageId?: string | null;
  initialInternalTripId?: string | null;  // ← NUEVO: Para viajes internos
  mode?: string;
};

export function ContractsForm({ agent = null, initialDraftId = null, initialTravelPackageId = null, initialInternalTripId = null, mode }: ContractsFormProps) {
  const [state, setState] = useState(() => createInitialFormState(agent || undefined));
  const [status, setStatus] = useState("Listo para iniciar migracion del formulario.");
  const [internalTripMeta, setInternalTripMeta] = useState<{ tripCode: string; name: string } | null>(null);
  const [loadedTravelPackage, setLoadedTravelPackage] = useState<TravelPackage | null>(null);
  const [busyNumber, setBusyNumber] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewHtml, setPreviewHtml] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [copiedSignerKey, setCopiedSignerKey] = useState("");
  const [latestSigningLinks, setLatestSigningLinks] = useState<
    Array<{ signerKey: string; signerName: string; signerEmail: string | null; signingUrl: string }>
  >([]);
  const [holderDocs, setHolderDocs] = useState<{ idFront: File | null; idBack: File | null; passport: File | null }>({
    idFront: null,
    idBack: null,
    passport: null,
  });
  const [supportDocs, setSupportDocs] = useState<File[]>([]);
  const [reservationProof, setReservationProof] = useState<File | null>(null);
  const [companionDocs, setCompanionDocs] = useState<Record<string, { idFront: File | null; idBack: File | null; passport: File | null }>>({});
  const [minorDocs, setMinorDocs] = useState<
    Record<string, {
      minorPassport: File | null;
      tutorIdFront: File | null;
      tutorIdBack: File | null;
      tutorPassport: File | null;
    }>
  >({});
  const [showCapacityModal, setShowCapacityModal] = useState(false);
  const [capacityError, setCapacityError] = useState<{
    participantCount: number;
    availableSlots: number;
    packageName: string;
    occupiedSlots: number;
    capacity: number;
  } | null>(null);
  const autoReservationStarted = useRef(false);
  const loadedDraftIdRef = useRef("");
  const loadedTravelPackageIdRef = useRef("");
  const loadedInternalTripIdRef = useRef("");
  const todayIso = useMemo(() => getTodayIsoLocal(), []);

  // Determinar si los campos de viaje deben estar bloqueados
  // Solo están desbloqueados en modo "migration" manual (sin paquete asociado)
  // Si viene con travelPackageId, SOLO se bloquean: Destino, Fecha inicio, Fecha fin
  const isMigrationMode = mode === "migration" || loadedTravelPackage?.travelType === "MIGRATION";
  const hasSelectedPackage = Boolean(initialTravelPackageId);
  const isInternalTrip = Boolean(initialInternalTripId);  // ← NUEVO: Detecta viajes internos
  // SOLO bloquear campos clave del paquete (destino y fechas), resto editable
  const packageFieldsLocked = hasSelectedPackage || isInternalTrip;

  const rangeMessage = useMemo(() => getDateRangeValidityMessage(state), [state]);
  const itineraryMessage = useMemo(() => getItineraryValidityMessage(state), [state]);

  const requiredDocumentLabelClass = (hasAttachment: boolean) =>
    `doc-required-label ${hasAttachment ? "doc-required-label--done" : "doc-required-label--missing"}`;

  // Helper para manejar file inputs y actualizar el placeholder CSS
  const updateFileInputState = (input: HTMLInputElement, hasFile: boolean) => {
    input.classList.toggle('has-file', hasFile);
  };

  const onMoneyChange = (field: "totalAmount" | "reservationAmount" | "installmentCount", value: string) => {
    setState((prev) => applyMoneyDerivedValues({ ...prev, [field]: value }));
  };

  const onMoneyBlur = (field: "totalAmount" | "reservationAmount") => {
    setState((prev) =>
      applyMoneyDerivedValues({
        ...prev,
        [field]: normalizeMoneyInputValue(prev[field]),
      }),
    );
  };

  const responsibleAdults = useMemo(() => {
    const base = state.clientFullName.trim();
    const names = [base, ...state.companions.map((item) => item.fullName.trim())].filter(Boolean);
    return Array.from(new Set(names));
  }, [state.clientFullName, state.companions]);

  const clientSigningLinks = useMemo(
    () => latestSigningLinks.filter((item) => String(item.signerKey || "").toLowerCase() === "client"),
    [latestSigningLinks],
  );

  const companionSigningLinks = useMemo(
    () => latestSigningLinks.filter((item) => String(item.signerKey || "").toLowerCase() !== "client"),
    [latestSigningLinks],
  );

  const buildWhatsappShareUrl = (signingUrl: string, signerName = "") => {
    const normalizedUrl = String(signingUrl || "").trim();
    const normalizedSigner = String(signerName || "").trim();
    const signerText = normalizedSigner ? ` para ${normalizedSigner}` : "";
    return `https://wa.me/?text=${encodeURIComponent(
      `Hola, te compartimos el enlace para firmar tu contrato de viaje${signerText}: ${normalizedUrl}`,
    )}`;
  };

  const copySigningUrl = async (signingUrl: string, signerKey: string) => {
    const normalized = String(signingUrl || "").trim();
    if (!normalized) {
      setStatus("No hay enlace para copiar.");
      return;
    }

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(normalized);
      } else {
        const input = document.createElement("input");
        input.value = normalized;
        document.body.appendChild(input);
        input.select();
        document.execCommand("copy");
        input.remove();
      }

      setCopiedSignerKey(signerKey);
      setStatus("Link de firma copiado al portapapeles.");
      window.setTimeout(() => {
        setCopiedSignerKey((prev) => (prev === signerKey ? "" : prev));
      }, 1800);
    } catch {
      setStatus("No se pudo copiar automaticamente. Copialo manualmente del campo.");
    }
  };

  const cloneWithPrefix = (file: File, prefix: string): File =>
    new File([file], `${prefix}__${file.name}`, {
      type: file.type,
      lastModified: file.lastModified,
    });

  const collectDocumentsForArchive = (): File[] => {
    const docs: File[] = [];

    if (holderDocs.idFront) docs.push(cloneWithPrefix(holderDocs.idFront, "titular-cedula-frente"));
    if (holderDocs.idBack) docs.push(cloneWithPrefix(holderDocs.idBack, "titular-cedula-reverso"));
    if (holderDocs.passport) docs.push(cloneWithPrefix(holderDocs.passport, "titular-pasaporte"));

    state.companions.forEach((companion, index) => {
      const files = companionDocs[companion.id];
      if (!files) return;
      const idx = index + 1;
      if (files.idFront) docs.push(cloneWithPrefix(files.idFront, `acompanante${idx}-cedula-frente`));
      if (files.idBack) docs.push(cloneWithPrefix(files.idBack, `acompanante${idx}-cedula-reverso`));
      if (files.passport) docs.push(cloneWithPrefix(files.passport, `acompanante${idx}-pasaporte`));
    });

    state.minors.forEach((minor, index) => {
      const files = minorDocs[minor.id];
      if (!files) return;
      const idx = index + 1;
      if (files.minorPassport) docs.push(cloneWithPrefix(files.minorPassport, `menor${idx}-pasaporte`));
      if (files.tutorIdFront) docs.push(cloneWithPrefix(files.tutorIdFront, `menor${idx}-tutor-cedula-frente`));
      if (files.tutorIdBack) docs.push(cloneWithPrefix(files.tutorIdBack, `menor${idx}-tutor-cedula-reverso`));
      if (files.tutorPassport) docs.push(cloneWithPrefix(files.tutorPassport, `menor${idx}-tutor-pasaporte`));
    });

    supportDocs.forEach((file, index) => {
      docs.push(cloneWithPrefix(file, `soporte-${index + 1}`));
    });

    if (reservationProof) {
      docs.push(cloneWithPrefix(reservationProof, "comprobante-reserva-1"));
    }

    return docs;
  };

  /**
   * Helper para mostrar el modal de capacidad insuficiente.
   * Encapsula la lógica de setCapacityError, setShowCapacityModal y setStatus.
   */
  const showCapacityExceededModal = (
    participantCount: number,
    availableSlots: number,
    packageName: string,
    capacity: number,
    occupiedSlots: number
  ) => {
    setCapacityError({
      participantCount,
      availableSlots,
      packageName,
      capacity,
      occupiedSlots,
    });
    setShowCapacityModal(true);
    setStatus("⚠️ No hay capacidad suficiente. Ver modal.");
  };

  const runArchiveFlow = async () => {
    console.log("🔵 [runArchiveFlow] INICIO");
    if (submitting) {
      console.log("❌ Ya está submitting, retornando");
      return;
    }
    if (previewing) {
      console.log("❌ Ya está previewing, retornando");
      return;
    }
    if (!state.contractNumber.trim()) {
      console.log("❌ No hay número de contrato");
      setStatus("No hay numero de contrato reservado todavia.");
      return;
    }
    if (!state.clientFullName.trim() || !state.clientIdNumber.trim() || !state.clientEmail.trim()) {
      console.log("❌ Faltan datos principales del cliente");
      setStatus("Completa los datos principales del cliente antes de guardar.");
      return;
    }
    if (rangeMessage || itineraryMessage) {
      console.log("❌ Hay errores de validación en fechas/itinerario");
      setStatus("Corrige las validaciones de fechas/itinerario antes de guardar.");
      return;
    }
    console.log("====================================");
console.log("🔍 DEBUG CAPACIDAD");
console.log("activeDraftId:", activeDraftId);
console.log("initialTravelPackageId:", initialTravelPackageId);
console.log("initialInternalTripId:", initialInternalTripId);
console.log("isInternalTrip:", isInternalTrip);
console.log("participantCount:", calculateParticipants(state));
console.log("====================================");

    // ✅ VALIDACIÓN PREVENTIVA DE CAPACIDAD (Capa 1 - Frontend)
    // Valida viajes internacionales
    if (initialTravelPackageId && !isInternalTrip) {
      try {
        console.log("🔵 Validando capacidad del viaje internacional...");
        const travelPackage = await getTravelPackageById(initialTravelPackageId);
        const participantCount = calculateParticipants(state);
        const availableSlots = travelPackage.capacity - travelPackage.occupiedSlots;

        if (participantCount > availableSlots) {
          console.log(`⚠️ Capacidad insuficiente: ${participantCount} solicitados, ${availableSlots} disponibles`);
          showCapacityExceededModal(
            participantCount,
            availableSlots,
            travelPackage.name,
            travelPackage.capacity,
            travelPackage.occupiedSlots
          );
          return; // ← Detener flujo
        }
        console.log(`✅ Capacidad OK: ${participantCount} solicitados, ${availableSlots} disponibles`);
      } catch (error) {
        console.warn("[runArchiveFlow] Capacidad check falló, delegando al backend:", error);
        // Continuar: el backend lo validará en Capa 2 y 3
      }
    }

    // Valida viajes internos
    if (initialInternalTripId && isInternalTrip) {
      try {
        console.log("🔵 Validando capacidad del viaje interno...");
        const internalTrip = await getInternalTripById(initialInternalTripId);
        const participantCount = calculateParticipants(state);
        const availableSlots = internalTrip.capacity - internalTrip.occupiedSlots;

        if (participantCount > availableSlots) {
          console.log(`⚠️ Capacidad insuficiente: ${participantCount} solicitados, ${availableSlots} disponibles`);
          showCapacityExceededModal(
            participantCount,
            availableSlots,
            internalTrip.name,
            internalTrip.capacity,
            internalTrip.occupiedSlots
          );
          return; // ← Detener flujo
        }
        console.log(`✅ Capacidad OK: ${participantCount} solicitados, ${availableSlots} disponibles`);
      } catch (error) {
        console.warn("[runArchiveFlow] Capacidad check falló, delegando al backend:", error);
        // Continuar: el backend lo validará en Capa 2 y 3
      }
    }

    console.log("✅ Validaciones pasadas, iniciando submit");
    setSubmitting(true);
    setLatestSigningLinks([]);
    try {
      console.log("🔵 Paso 1: Preparando contrato...");
      setStatus("Preparando contrato...");
      
      // Variables para datos del contrato (solo internacionales)
      let contractHtml = "";
      
      // SOLO VIAJES INTERNACIONALES: Obtener configuración y generar PDF
      if (!isInternalTrip) {
        // Obtener información legal del tenant
        console.log("🔵 Obteniendo configuración legal del tenant...");
        const tenantLegalInfo: TenantLegalInfo = await getTenantLegalConfig();
        console.log("✅ Configuración legal obtenida:", tenantLegalInfo.name);
        
        // Obtener configuración de branding del tenant (logo y firma)
        const tenantConfig = await getTenantConfig();
        console.log("✅ Configuración de branding obtenida:", tenantConfig.name);
        
        // Validar que el tenant tenga logo y firma configurados
        if (!tenantConfig.logoUrl) {
          setStatus("Error: El logo de la empresa no está configurado. Por favor, configure el logo en la página de Ajustes.");
          setSubmitting(false);
          return;
        }
        if (!tenantConfig.signatureUrl) {
          setStatus("Error: La firma del representante no está configurada. Por favor, configure la firma en la página de Ajustes.");
          setSubmitting(false);
          return;
        }
        
        // Obtener cuentas bancarias activas
        console.log("🔵 Obteniendo cuentas bancarias activas...");
        const allBankAccounts = await getAllBankAccounts({ isActive: "true" });
        const bankAccountsForContract: BankAccountForContract[] = allBankAccounts.map(acc => ({
          bankName: acc.bankName,
          accountNumber: acc.accountNumber,
          accountType: acc.accountType,
          currency: acc.currency,
          sinpeNumber: acc.sinpeNumber || null,
          accountHolderName: acc.accountHolderName,
        }));
        console.log("✅ Cuentas bancarias activas:", bankAccountsForContract.length);
        
        const logoSrc = tenantConfig.logoUrl;
        const representativeSignSrc = tenantConfig.signatureUrl;
        
        console.log("✅ Assets configurados:", { logoSrc: "✓", signatureSrc: "✓" });

        console.log("🔵 Paso 2: Construyendo HTML del contrato...");
        contractHtml = buildContractPdfHtml(state, {
          logoSrc,
          representativeSignSrc,
        }, tenantLegalInfo, bankAccountsForContract);
        console.log("✅ HTML construido, longitud:", contractHtml.length);
      } else {
        console.log("⚠️ Viaje interno: Skip generación de PDF/HTML");
      }

      console.log("🔵 Paso 3: Recolectando documentos...");
      const docs = collectDocumentsForArchive();
      console.log("✅ Documentos recolectados:", docs.length);

      console.log("🔵 Paso 4: Verificando tamaños de campos...");
      const payloadJson = JSON.stringify(state);
      console.log("====================================");
      console.log("📏 TAMAÑOS DE CAMPOS A ENVIAR:");
      console.log("====================================");
      console.log(`contractNumber: "${state.contractNumber}" (${state.contractNumber.length} chars) - límite: 120`);
      console.log(`clientFullName: "${state.clientFullName}" (${state.clientFullName.length} chars) - límite: 200`);
      console.log(`clientIdNumber: "${state.clientIdNumber}" (${state.clientIdNumber.length} chars) - límite: 80`);
      console.log(`clientEmail: "${state.clientEmail}" (${state.clientEmail.length} chars) - sin límite específico`);
      console.log(`destination: "${state.destination}" (${state.destination.length} chars) - límite: 160`);
      console.log(`issuedAt: "${state.issuedAt}" (${state.issuedAt?.length || 0} chars) - límite: 40`);
      console.log(`startDate: "${state.startDate}" (${state.startDate?.length || 0} chars) - límite: 40`);
      console.log(`endDate: "${state.endDate}" (${state.endDate?.length || 0} chars) - límite: 40`);
      console.log(`payloadJson: ${payloadJson.length} chars - sin límite en DTO`);
      console.log(`contractHtml: ${contractHtml.length} chars - sin límite en DTO`);
      console.log("====================================");

      console.log("🔵 Paso 5: Enviando al backend...");
      setStatus(isInternalTrip ? "Guardando formulario en base de datos..." : "Guardando contrato en base de datos...");
      const archived = await archiveContract({
        draftId: activeDraftId || undefined,
        contractNumber: state.contractNumber,
        clientFullName: state.clientFullName,
        clientIdNumber: state.clientIdNumber,
        clientEmail: state.clientEmail,
        destination: state.destination,
        issuedAt: state.issuedAt,
        startDate: state.startDate,
        endDate: state.endDate,
        payloadJson,
        contractHtml,
        documents: docs,
        source: isInternalTrip ? "INTERNAL_TRIP" : (isMigrationMode ? "MIGRATION" : "SCHEDULED_TRIP"),
        internalTripId: initialInternalTripId || undefined,
      });
      console.log("✅ Respuesta del backend recibida:", archived);

      if (archived.pdfUrl) {
        window.open(archived.pdfUrl, "_blank", "noopener,noreferrer");
      }

      // Inicializar el sistema de billing (crea factura + pago de reserva)
      console.log("🔵 Paso 6: Inicializando billing...");
      setStatus(isInternalTrip ? "Enviando formulario/comprobante para aprobación..." : "Creando pago de reserva...");
      try {
        await bootstrapBillingContract(archived.id);
        console.log("✅ Billing inicializado correctamente");
      } catch (billingError) {
        console.error("⚠️ Error al inicializar billing:", billingError);
        // No bloqueamos el flujo, pero advertimos al usuario
        setStatus("Contrato guardado, pero hubo un error al crear el pago de reserva. Contacta al admin.");
      }

      console.log("🔵 Paso 7: Reseteando formulario...");
      await resetFormForNextContract(
        isInternalTrip
          ? "Formulario enviado correctamente. El comprobante de reserva quedará pendiente de aprobación del admin."
          : "Contrato guardado correctamente. El pago de reserva quedará pendiente de aprobación del admin.",
      );
      console.log("✅ Formulario reseteado");
    } catch (error) {
      console.error("❌ ERROR en runArchiveFlow:", error);
      
      setStatus(error instanceof Error ? error.message : "No se pudo completar el guardado del contrato.");
    } finally {
      setSubmitting(false);
      console.log("🔵 [runArchiveFlow] FIN");
    }
  };

  const runPreviewFlow = async () => {
    if (isInternalTrip) {
      setStatus("La vista previa no aplica para viajes internos.");
      return;
    }

    if (previewing || submitting) return;

    if (!state.contractNumber.trim()) {
      setStatus("No hay numero de contrato reservado todavia.");
      return;
    }
    if (!state.clientFullName.trim() || !state.clientIdNumber.trim() || !state.clientEmail.trim()) {
      setStatus("Completa los datos principales del cliente antes de generar la vista previa.");
      return;
    }
    if (rangeMessage || itineraryMessage) {
      setStatus("Corrige las validaciones de fechas/itinerario antes de generar la vista previa.");
      return;
    }

    setPreviewing(true);
    try {
      setStatus("Generando vista previa...");

      // Obtener información legal del tenant
      const tenantLegalInfo: TenantLegalInfo = await getTenantLegalConfig();

      // Obtener configuración de branding del tenant (logo y firma)
      const tenantConfig = await getTenantConfig();

      // Validar que el tenant tenga logo y firma configurados
      if (!tenantConfig.logoUrl) {
        setStatus("Error: El logo de la empresa no está configurado. Por favor, configure el logo en la página de Ajustes.");
        return;
      }
      if (!tenantConfig.signatureUrl) {
        setStatus("Error: La firma del representante no está configurada. Por favor, configure la firma en la página de Ajustes.");
        return;
      }

      // Obtener cuentas bancarias activas
      const allBankAccounts = await getAllBankAccounts({ isActive: "true" });
      const bankAccountsForContract: BankAccountForContract[] = allBankAccounts.map(acc => ({
        bankName: acc.bankName,
        accountNumber: acc.accountNumber,
        accountType: acc.accountType,
        currency: acc.currency,
        sinpeNumber: acc.sinpeNumber || null,
        accountHolderName: acc.accountHolderName,
      }));

      const logoSrc = tenantConfig.logoUrl;
      const representativeSignSrc = tenantConfig.signatureUrl;

      const contractHtml = buildContractPdfHtml(state, {
        logoSrc,
        representativeSignSrc,
      }, tenantLegalInfo, bankAccountsForContract);

      setPreviewHtml(contractHtml);
      setStatus("Vista previa actualizada abajo del formulario.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "No se pudo generar la vista previa del contrato.");
    } finally {
      setPreviewing(false);
    }
  };

  const reserveNumber = async ({ silent = false }: { silent?: boolean } = {}) => {
    if (busyNumber) {
      console.log("⚠️ Ya se está reservando un número, saltando...");
      return;
    }

    console.log("🔵 [reserveNumber] Iniciando reserva...");
    setBusyNumber(true);
    if (!silent) {
      setStatus("Reservando numero...");
    }
    try {
      const contractNumber = await reserveNextContractNumber();
      console.log(`✅ [reserveNumber] Número reservado: ${contractNumber}`);
      setState((prev) => ({ ...prev, contractNumber }));
      if (!silent) {
        setStatus(`Numero asignado: ${contractNumber}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo reservar numero.";
      console.error("❌ [reserveNumber] Error:", message);
      setStatus(message);
    } finally {
      setBusyNumber(false);
    }
  };

  const saveDraftFlow = async () => {
    if (savingDraft || submitting || previewing || busyNumber) return;
    if (!state.contractNumber.trim()) {
      setStatus("No hay numero de contrato reservado para guardar el borrador.");
      return;
    }

    setSavingDraft(true);
    try {
      const saved = await saveContractDraft({
        id: activeDraftId || undefined,
        contractNumber: state.contractNumber,
        clientFullName: state.clientFullName || undefined,
        clientIdNumber: state.clientIdNumber || undefined,
        clientEmail: state.clientEmail || undefined,
        clientPhone: state.clientPhone || undefined,
        destination: state.destination || undefined,
        payloadJson: JSON.stringify(state),
      });

      setActiveDraftId(saved.id);
      const nextBaseState = createInitialFormState(agent || undefined);
      setState(nextBaseState);
      setHolderDocs({ idFront: null, idBack: null, passport: null });
      setSupportDocs([]);
      setReservationProof(null);
      setCompanionDocs({});
      setMinorDocs({});
      setPreviewHtml("");
      setLatestSigningLinks([]);
      setCopiedSignerKey("");
      setActiveDraftId(null);

      try {
        const nextNumber = await reserveNextContractNumber();
        setState((prev) => ({ ...prev, contractNumber: nextNumber }));
        setStatus(`Borrador guardado (${saved.contractNumber}). Formulario limpio y listo para nuevo contrato (${nextNumber}).`);
      } catch {
        setStatus(`Borrador guardado (${saved.contractNumber}). Formulario limpio; usa Reintentar para reservar numero.`);
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "No se pudo guardar el borrador.");
    } finally {
      setSavingDraft(false);
    }
  };

  const resetFormForNextContract = async (successMessage: string) => {
    const nextBaseState = createInitialFormState(agent || undefined);
    setState(nextBaseState);
    setHolderDocs({ idFront: null, idBack: null, passport: null });
    setSupportDocs([]);
    setReservationProof(null);
    setCompanionDocs({});
    setMinorDocs({});
    setPreviewHtml("");
    setLatestSigningLinks([]);
    setCopiedSignerKey("");
    setActiveDraftId(null);

    try {
      const nextNumber = await reserveNextContractNumber();
      setState((prev) => ({ ...prev, contractNumber: nextNumber }));
      setStatus(`${successMessage} Formulario limpiado y listo para nuevo contrato (${nextNumber}).`);
    } catch {
      setStatus(`${successMessage} Formulario limpiado. Usa "Reintentar" para reservar nuevo numero.`);
    }
  };

  useEffect(() => {
    const draftId = String(initialDraftId || "").trim();
    if (!draftId) {
      loadedDraftIdRef.current = "";
      return;
    }
    if (loadedDraftIdRef.current === draftId) {
      return;
    }

    loadedDraftIdRef.current = draftId;
    setStatus("Cargando borrador...");

    void getContractDraft(draftId)
      .then((draft) => {
        const payload = draft.payload;
        if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
          throw new Error("El borrador no contiene informacion valida del formulario.");
        }

        const base = createInitialFormState(agent || undefined);
        const payloadState = payload as Partial<ContractFormState>;
        
        // Restaurar el estado del borrador
        const restoredState = {
          ...base,
          ...payloadState,
          companions: Array.isArray(payloadState.companions) ? payloadState.companions : base.companions,
          minors: Array.isArray(payloadState.minors) ? payloadState.minors : base.minors,
          itinerary: Array.isArray(payloadState.itinerary) ? payloadState.itinerary : base.itinerary,
          contractDocumentsNames: Array.isArray(payloadState.contractDocumentsNames)
            ? payloadState.contractDocumentsNames
            : base.contractDocumentsNames,
          generatedByAgentName: base.generatedByAgentName,
          generatedByAgentEmail: base.generatedByAgentEmail,
        };

        // Recalcular paymentDueDate y valores monetarios derivados para asegurar consistencia
        const withUpdatedDates = syncTourDates(restoredState, "start", restoredState.startDate);
        const withCalculations = applyMoneyDerivedValues(withUpdatedDates);
        
        setState(withCalculations);
        setActiveDraftId(draft.id);
        setPreviewHtml("");
        setLatestSigningLinks([]);
        setCopiedSignerKey("");
        setHolderDocs({ idFront: null, idBack: null, passport: null });
        setSupportDocs([]);
        setCompanionDocs({});
        setMinorDocs({});
        setStatus(`Borrador ${draft.contractNumber} cargado. Continua completando la informacion.`);
      })
      .catch((error) => {
        setActiveDraftId(null);
        setStatus(error instanceof Error ? error.message : "No se pudo cargar el borrador.");
      });
  }, [agent, initialDraftId]);

  // Cargar paquete de viaje si viene desde /trips
  useEffect(() => {
    const packageId = String(initialTravelPackageId || "").trim();
    if (!packageId) {
      loadedTravelPackageIdRef.current = "";
      return;
    }
    // No cargar si ya se cargó este paquete
    if (loadedTravelPackageIdRef.current === packageId) {
      return;
    }
    // No cargar si hay un borrador activo
    if (String(initialDraftId || "").trim()) {
      return;
    }

    loadedTravelPackageIdRef.current = packageId;
    setStatus("Cargando información del viaje...");

    void getTravelPackageById(packageId)
      .then((travelPackage) => {
        // Almacenar el paquete cargado para detectar el tipo
        setLoadedTravelPackage(travelPackage);
        
        // Pre-llenar el formulario con los datos del paquete
        setState((prev) => {
          const price = travelPackage.packagePrice
            ? String(typeof travelPackage.packagePrice === 'string' 
                ? parseFloat(travelPackage.packagePrice).toFixed(2) 
                : travelPackage.packagePrice.toFixed(2))
            : "";

          const reservationPrice = travelPackage.minReservation !== null && travelPackage.minReservation !== undefined
            ? String(
                typeof travelPackage.minReservation === "string"
                  ? parseFloat(travelPackage.minReservation).toFixed(2)
                  : travelPackage.minReservation.toFixed(2),
              )
            : "";

          // Primero sincronizar las fechas del tour para actualizar paymentDueDate
          const withDates = syncTourDates({
            ...prev,
            travelPackageId: packageId,
            destination: travelPackage.destination,
            startDate: toLocalDateIso(travelPackage.departureDate),
            endDate: toLocalDateIso(travelPackage.returnDate),
            totalAmount: price,
            reservationAmount: reservationPrice,
          }, "start", toLocalDateIso(travelPackage.departureDate));

          // Luego aplicar los cálculos monetarios derivados
          return applyMoneyDerivedValues(withDates);
        });
        setStatus(`Viaje "${travelPackage.name}" cargado. Completa la información del cliente.`);
      })
      .catch((error) => {
        setStatus(error instanceof Error ? error.message : "No se pudo cargar el viaje.");
      });
  }, [initialTravelPackageId, initialDraftId]);

  // Cargar viaje interno si viene desde /internal-trips/[id]/book
  useEffect(() => {
    const tripId = String(initialInternalTripId || "").trim();
    if (!tripId) {
      loadedInternalTripIdRef.current = "";
      setInternalTripMeta(null);
      return;
    }
    // No cargar si ya se cargó este viaje interno
    if (loadedInternalTripIdRef.current === tripId) {
      return;
    }
    // No cargar si hay un borrador activo
    if (String(initialDraftId || "").trim()) {
      return;
    }

    loadedInternalTripIdRef.current = tripId;
    setStatus("Cargando información del viaje interno...");

    void getInternalTripById(tripId)
      .then((trip) => {
        setInternalTripMeta({
          tripCode: String(trip.tripCode || "").trim(),
          name: String(trip.name || "").trim(),
        });

        setState((prev) => {
          const totalPrice = trip.price
            ? String(typeof trip.price === "string" ? Number.parseFloat(trip.price).toFixed(2) : trip.price.toFixed(2))
            : "";

          const reservationPrice = trip.minReservation !== null && trip.minReservation !== undefined
            ? String(
                typeof trip.minReservation === "string"
                  ? Number.parseFloat(trip.minReservation).toFixed(2)
                  : trip.minReservation.toFixed(2),
              )
            : "";

          const departure = toLocalDateIso(trip.departureDate || "") || prev.startDate;
          const ret = toLocalDateIso(trip.returnDate || "") || prev.endDate;

          const withDates = syncTourDates(
            {
              ...prev,
              destination: trip.destination,
              lodgingType: "N/A",
              accommodationType: "N/A",
              startDate: departure,
              endDate: ret,
              totalAmount: totalPrice,
              reservationAmount: reservationPrice,
            },
            "start",
            departure,
          );

          return applyMoneyDerivedValues(withDates);
        });

        setStatus(
          `Viaje interno "${trip.name}" (${trip.tripCode}) cargado. Completa la información del cliente.`,
        );
      })
      .catch((error) => {
        setInternalTripMeta(null);
        setStatus(error instanceof Error ? error.message : "No se pudo cargar el viaje interno.");
      });
  }, [initialInternalTripId, initialDraftId]);

  useEffect(() => {
    if (autoReservationStarted.current) {
      return;
    }
    autoReservationStarted.current = true;
    if (String(initialDraftId || "").trim()) {
      return;
    }
    console.log("🔵 Auto-reservando número de contrato...");
    void reserveNumber({ silent: false });
    // Contract number must be automatic and immutable; reserve once when form mounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialDraftId]);

  return (
    <section className="card contracts-card">
      <h1>
        {isInternalTrip ? "Formulario de Reserva Interna - Etapa 2" : "Formulario de Contrato - Etapa 2"}
        {isMigrationMode && (
          <span
            style={{
              marginLeft: 12,
              padding: "6px 14px",
              fontSize: "0.75rem",
              fontWeight: 600,
              background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
              color: "white",
              borderRadius: 8,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              boxShadow: "0 2px 8px rgba(16, 185, 129, 0.3)",
            }}
          >
            📄 Modo Migración
          </span>
        )}
      </h1>
      {isMigrationMode ? (
        <p style={{ color: "#059669", fontWeight: 500 }}>
          ✓ Todos los campos son editables. Completa manualmente la información del contrato y viaje.
        </p>
      ) : (
        <p>
          {isInternalTrip
            ? "Formulario interno: cliente, acompañantes, menores y comprobantes para aprobación administrativa."
            : "Migracion ampliada: contrato, cliente, acompanantes, menores, itinerario, equipaje y adjuntos."}
        </p>
      )}
      <p className="agent-line">
        Elaborado por: <strong>{agent?.fullName || "Agente no identificado"}</strong>
        {agent?.email ? ` (${agent.email})` : ""}
      </p>

      <div className="contracts-workspace">
        <div className="contracts-editor">

      <div className="form-section-card">
        <h2 className="section-title">Datos del Contrato</h2>

      <div className="contracts-grid">
        <label>
          Numero de contrato
          <input 
            value={state.contractNumber} 
            readOnly 
            placeholder="Generando automaticamente..." 
            className="font-mono text-sm"
            title={state.contractNumber || "Esperando asignación automática..."}
          />
        </label>

        {isInternalTrip && (
          <label>
            Codigo viaje interno
            <input
              value={internalTripMeta?.tripCode || "Cargando..."}
              readOnly
              title={internalTripMeta?.name || "Viaje interno seleccionado"}
              className="font-mono text-sm"
              style={{ backgroundColor: "#f3f4f6" }}
            />
          </label>
        )}

        <label>
          Fecha de emision
          <input type="date" value={state.issuedAt} readOnly />
        </label>

        <label>
          Destino
          <input
            value={state.destination}
            onChange={(event) => setState((prev) => ({ ...prev, destination: event.target.value }))}
            placeholder="Ej. España"
            readOnly={packageFieldsLocked}
            style={packageFieldsLocked ? { backgroundColor: "#f3f4f6", cursor: "not-allowed" } : undefined}
          />
        </label>

        <label>
          Tipo de hospedaje
          <select
            value={state.lodgingType}
            onChange={(event) => setState((prev) => ({ ...prev, lodgingType: event.target.value }))}
          >
            <option value="N/A">N/A</option>
            <option value="Hotel">Hotel</option>
            <option value="Hostel">Hostel</option>
            <option value="Airbnb">Airbnb</option>
          </select>
        </label>

        <label>
          Tipo de acomodacion
          <select
            value={state.accommodationType}
            onChange={(event) => setState((prev) => ({ ...prev, accommodationType: event.target.value }))}
          >
            <option value="N/A">N/A</option>
            <option value="Sencilla">Sencilla</option>
            <option value="Doble">Doble</option>
            <option value="Triple">Triple</option>
            <option value="Cuadruple">Cuadruple</option>
          </select>
        </label>

        <label>
          Fecha inicio tour
          <input
            type="date"
            value={state.startDate}
            min={todayIso}
            onChange={(event) => {
              const selected = String(event.target.value || "");
              const safe = selected && selected < todayIso ? todayIso : selected;
              setState((prev) => applyMoneyDerivedValues(syncTourDates(prev, "start", safe)));
            }}
            readOnly={packageFieldsLocked}
            style={packageFieldsLocked ? { backgroundColor: "#f3f4f6", cursor: "not-allowed" } : undefined}
          />
        </label>

        <label>
          Fecha fin tour
          <input
            type="date"
            value={state.endDate}
            min={state.startDate ? addDaysIso(state.startDate, 1) : addDaysIso(todayIso, 1)}
            onChange={(event) =>
              setState((prev) => applyMoneyDerivedValues(syncTourDates(prev, "end", event.target.value)))
            }
            readOnly={packageFieldsLocked}
            style={packageFieldsLocked ? { backgroundColor: "#f3f4f6", cursor: "not-allowed" } : undefined}
          />
        </label>

        {rangeMessage ? <p className="form-error full-row">{rangeMessage}</p> : null}

        <label>
          Monto total USD
          <input
            type="number"
            step="0.01"
            value={state.totalAmount}
            placeholder="Ej. 1250.00"
            onChange={(event) => onMoneyChange("totalAmount", event.target.value)}
            onBlur={() => onMoneyBlur("totalAmount")}
          />
        </label>

        <label>
          Reserva USD
          <input
            type="number"
            step="0.01"
            value={state.reservationAmount}
            placeholder="Ej. 300.00"
            onChange={(event) => onMoneyChange("reservationAmount", event.target.value)}
            onBlur={() => onMoneyBlur("reservationAmount")}
          />
        </label>

        <label>
          Saldo pendiente USD
          <input value={state.balanceAmount} readOnly placeholder="Se calcula automaticamente" />
        </label>

        <label>
          Frecuencia de pago
          <select
            value={state.paymentFrequency}
            onChange={(event) =>
              setState((prev) =>
                applyMoneyDerivedValues({
                  ...prev,
                  paymentFrequency: event.target.value as "QUINCENAL" | "MENSUAL",
                }),
              )
            }
          >
            <option value="MENSUAL">Mensual (cada 30 dias)</option>
            <option value="QUINCENAL">Quincenal (cada 15 dias)</option>
          </select>
        </label>

        <label>
          Cantidad de cuotas (automatico)
          <input value={state.installmentCount} readOnly placeholder="Se calcula automaticamente" />
        </label>

        <div className="col-span-full payment-summary-grid">
          <label className="payment-summary-field">
            Monto por cuota USD (regular)
            <input value={state.monthlyInstallmentAmount} readOnly placeholder="Saldo / plazo" />
          </label>

          <label className="payment-summary-field">
            Ultima cuota USD
            <input value={state.lastInstallmentAmount} readOnly placeholder="Ajuste de fraccion" />
            <small>Si hay fraccion, se ajusta en la ultima cuota.</small>
          </label>

          <label className="payment-summary-field">
            Fecha limite de pago total
            <input value={state.paymentDueDate} type="date" readOnly />
            <small>Todo debe quedar cancelado 22 dias antes de iniciar el viaje.</small>
          </label>
        </div>
      </div>
      </div>

      <div className="form-section-card">
        <h2 className="section-title">Datos del Cliente</h2>

      <div className="contracts-grid">
        <label>
          Nombre completo
          <input
            value={state.clientFullName}
            onChange={(event) => setState((prev) => ({ ...prev, clientFullName: event.target.value }))}
          />
        </label>

        <label>
          Tipo ID
          <select
            value={state.clientIdType}
            onChange={(event) => setState((prev) => ({ ...prev, clientIdType: event.target.value as "Cedula" | "Pasaporte" | "DIMEX" }))}
          >
            <option value="Cedula">Cedula</option>
            <option value="Pasaporte">Pasaporte</option>
            <option value="DIMEX">DIMEX</option>
          </select>
        </label>

        <label>
          Numero ID
          <input
            value={state.clientIdNumber}
            onChange={(event) => setState((prev) => ({ ...prev, clientIdNumber: event.target.value }))}
          />
        </label>

        <label>
          Correo
          <input
            type="email"
            value={state.clientEmail}
            onChange={(event) => setState((prev) => ({ ...prev, clientEmail: event.target.value }))}
          />
        </label>

        <label>
          Telefono
          <input
            value={state.clientPhone}
            onChange={(event) => setState((prev) => ({ ...prev, clientPhone: event.target.value }))}
          />
        </label>

        <label>
          Direccion
          <input
            value={state.clientAddress}
            onChange={(event) => setState((prev) => ({ ...prev, clientAddress: event.target.value }))}
          />
        </label>

        <label>
          Contacto emergencia
          <input
            value={state.emergencyContactName}
            onChange={(event) => setState((prev) => ({ ...prev, emergencyContactName: event.target.value }))}
          />
        </label>

        <label>
          Telefono emergencia
          <input
            value={state.emergencyContactPhone}
            onChange={(event) => setState((prev) => ({ ...prev, emergencyContactPhone: event.target.value }))}
          />
        </label>

        <label>
          Estado civil
          <select
            value={state.civilStatus}
            onChange={(event) =>
              setState((prev) => ({
                ...prev,
                civilStatus: event.target.value as "Soltero" | "Casado" | "Divorciado" | "Viudo",
              }))
            }
          >
            <option value="Soltero">Soltero</option>
            <option value="Casado">Casado</option>
            <option value="Divorciado">Divorciado</option>
            <option value="Viudo">Viudo</option>
          </select>
        </label>

        <label>
          Profesion
          <input
            value={state.profession}
            onChange={(event) => setState((prev) => ({ ...prev, profession: event.target.value }))}
          />
        </label>

        <label>
          Nacionalidad
          <select
            value={state.clientNationality}
            onChange={(event) => setState((prev) => ({ ...prev, clientNationality: event.target.value }))}
          >
            {NATIONALITY_OPTIONS.map((country, idx) => (
              <option key={idx} value={country} disabled={country === "──────────"}>
                {country}
              </option>
            ))}
          </select>
        </label>

        <label className={requiredDocumentLabelClass(Boolean(holderDocs.idFront))}>
          Cedula titular (frente)
          <input
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.webp"
            onChange={(event) => {
              const file = event.target.files?.[0] || null;
              updateFileInputState(event.target, !!file);
              setHolderDocs((prev) => ({ ...prev, idFront: file }));
              setState((prev) => ({
                ...prev,
                idFrontDocumentName: file?.name || "",
              }));
            }}
          />
        </label>

        <label className={requiredDocumentLabelClass(Boolean(holderDocs.idBack))}>
          Cedula titular (reverso)
          <input
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.webp"
            onChange={(event) => {
              const file = event.target.files?.[0] || null;
              updateFileInputState(event.target, !!file);
              setHolderDocs((prev) => ({ ...prev, idBack: file }));
              setState((prev) => ({
                ...prev,
                idBackDocumentName: file?.name || "",
              }));
            }}
          />
        </label>

        {/* Pasaporte: SOLO para viajes internacionales */}
        {!isInternalTrip && (
          <label className={requiredDocumentLabelClass(Boolean(holderDocs.passport))}>
            Pasaporte titular
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp"
              onChange={(event) => {
                const file = event.target.files?.[0] || null;
                updateFileInputState(event.target, !!file);
                setHolderDocs((prev) => ({ ...prev, passport: file }));
                setState((prev) => ({
                  ...prev,
                  passportDocumentName: file?.name || "",
                }));
              }}
            />
          </label>
        )}
      </div>
      </div>

      <div className="itinerary-box">
        <div className="itinerary-head">
          <h2>Acompanantes</h2>
          <button 
            type="button" 
            className="btn-secondary" 
            onClick={() => setState((prev) => addCompanion(prev))}
          >
            + Agregar acompanante
          </button>
        </div>

        <div className="itinerary-list">
          {state.companions.length === 0 ? <p className="m-0 text-[#4b6790] text-sm">Aun no hay acompanantes.</p> : null}
          {state.companions.map((companion, index) => (
            <article key={companion.id} className="subcard">
              <div className="itinerary-head">
                <h3>Acompanante {index + 1}</h3>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setCompanionDocs((prev) => {
                      const next = { ...prev };
                      delete next[companion.id];
                      return next;
                    });
                    setState((prev) => removeCompanion(prev, companion.id));
                  }}
                >
                  Eliminar
                </button>
              </div>

              <div className="contracts-grid">
                <label>
                  Nombre completo
                  <input
                    value={companion.fullName}
                    onChange={(event) =>
                      setState((prev) => updateCompanion(prev, companion.id, "fullName", event.target.value))
                    }
                  />
                </label>
                <label>
                  Tipo ID
                  <select
                    value={companion.idType}
                    onChange={(event) =>
                      setState((prev) => updateCompanion(prev, companion.id, "idType", event.target.value))
                    }
                  >
                    <option value="Cedula">Cedula</option>
                    <option value="Pasaporte">Pasaporte</option>
                    <option value="DIMEX">DIMEX</option>
                  </select>
                </label>
                <label>
                  Numero ID
                  <input
                    value={companion.idNumber}
                    onChange={(event) =>
                      setState((prev) => updateCompanion(prev, companion.id, "idNumber", event.target.value))
                    }
                  />
                </label>
                <label>
                  Correo
                  <input
                    type="email"
                    value={companion.email}
                    onChange={(event) =>
                      setState((prev) => updateCompanion(prev, companion.id, "email", event.target.value))
                    }
                  />
                </label>
                <label>
                  Telefono
                  <input
                    value={companion.phone}
                    onChange={(event) =>
                      setState((prev) => updateCompanion(prev, companion.id, "phone", event.target.value))
                    }
                  />
                </label>
                <label>
                  Contacto emergencia
                  <input
                    value={companion.emergencyContactName}
                    onChange={(event) =>
                      setState((prev) =>
                        updateCompanion(prev, companion.id, "emergencyContactName", event.target.value)
                      )
                    }
                  />
                </label>
                <label>
                  Telefono emergencia
                  <input
                    value={companion.emergencyContactPhone}
                    onChange={(event) =>
                      setState((prev) =>
                        updateCompanion(prev, companion.id, "emergencyContactPhone", event.target.value)
                      )
                    }
                  />
                </label>
                <label>
                  Direccion
                  <input
                    value={companion.address}
                    onChange={(event) =>
                      setState((prev) => updateCompanion(prev, companion.id, "address", event.target.value))
                    }
                  />
                </label>
                <label>
                  Estado civil
                  <select
                    value={companion.civilStatus}
                    onChange={(event) =>
                      setState((prev) => updateCompanion(prev, companion.id, "civilStatus", event.target.value))
                    }
                  >
                    <option value="Soltero">Soltero</option>
                    <option value="Casado">Casado</option>
                    <option value="Divorciado">Divorciado</option>
                    <option value="Viudo">Viudo</option>
                  </select>
                </label>
                <label>
                  Profesion
                  <input
                    value={companion.profession}
                    onChange={(event) =>
                      setState((prev) => updateCompanion(prev, companion.id, "profession", event.target.value))
                    }
                  />
                </label>
                <label>
                  Nacionalidad
                  <select
                    value={companion.nationality}
                    onChange={(event) =>
                      setState((prev) => updateCompanion(prev, companion.id, "nationality", event.target.value))
                    }
                  >
                    {NATIONALITY_OPTIONS.map((country, idx) => (
                      <option key={idx} value={country} disabled={country === "──────────"}>
                        {country}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={requiredDocumentLabelClass(Boolean(companionDocs[companion.id]?.idFront))}>
                  Cedula frente
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.webp"
                    onChange={(event) => {
                      const file = event.target.files?.[0] || null;
                      updateFileInputState(event.target, !!file);
                      setCompanionDocs((prev) => ({
                        ...prev,
                        [companion.id]: {
                          idFront: file,
                          idBack: prev[companion.id]?.idBack || null,
                          passport: prev[companion.id]?.passport || null,
                        },
                      }));
                      setState((prev) => updateCompanion(prev, companion.id, "idFrontDocumentName", file?.name || ""));
                    }}
                  />
                </label>
                <label className={requiredDocumentLabelClass(Boolean(companionDocs[companion.id]?.idBack))}>
                  Cedula reverso
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.webp"
                    onChange={(event) => {
                      const file = event.target.files?.[0] || null;
                      updateFileInputState(event.target, !!file);
                      setCompanionDocs((prev) => ({
                        ...prev,
                        [companion.id]: {
                          idFront: prev[companion.id]?.idFront || null,
                          idBack: file,
                          passport: prev[companion.id]?.passport || null,
                        },
                      }));
                      setState((prev) => updateCompanion(prev, companion.id, "idBackDocumentName", file?.name || ""));
                    }}
                  />
                </label>
                {/* Pasaporte acompañante: SOLO internacional */}
                {!isInternalTrip && (
                <label className={requiredDocumentLabelClass(Boolean(companionDocs[companion.id]?.passport))}>
                  Pasaporte
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.webp"
                    onChange={(event) => {
                      const file = event.target.files?.[0] || null;
                      updateFileInputState(event.target, !!file);
                      setCompanionDocs((prev) => ({
                        ...prev,
                        [companion.id]: {
                          idFront: prev[companion.id]?.idFront || null,
                          idBack: prev[companion.id]?.idBack || null,
                          passport: file,
                        },
                      }));
                      setState((prev) => updateCompanion(prev, companion.id, "passportDocumentName", file?.name || ""));
                    }}
                  />
                </label>
                )}
              </div>
            </article>
          ))}
        </div>
      </div>

      <div className="itinerary-box">
        <div className="itinerary-head">
          <h2>Menores</h2>
          <div className="inline-actions">
            <label className="check-inline">
              <input
                type="checkbox"
                checked={state.hasMinorCompanion}
                onChange={(event) => {
                  const enabled = event.target.checked;
                  setState((prev) => ({
                    ...prev,
                    hasMinorCompanion: enabled,
                    minors: enabled ? (prev.minors.length ? prev.minors : prev.minors) : [],
                  }));
                }}
              />
              Viajan menores
            </label>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setState((prev) => addMinor(prev))}
              disabled={!state.hasMinorCompanion}
            >
              + Agregar menor
            </button>
          </div>
        </div>

        {!state.hasMinorCompanion ? <p className="m-0 text-[#4b6790] text-sm">Marca la casilla si hay menores en el viaje.</p> : null}

        <div className="itinerary-list">
          {state.hasMinorCompanion && state.minors.length === 0 ? <p className="m-0 text-[#4b6790] text-sm">Aun no hay menores.</p> : null}
          {state.minors.map((minor, index) => (
            <article key={minor.id} className="subcard">
              <div className="itinerary-head">
                <h3>Menor {index + 1}</h3>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setMinorDocs((prev) => {
                      const next = { ...prev };
                      delete next[minor.id];
                      return next;
                    });
                    setState((prev) => removeMinor(prev, minor.id));
                  }}
                >
                  Eliminar
                </button>
              </div>

              <div className="contracts-grid">
                <label>
                  Nombre del menor
                  <input
                    value={minor.minorName}
                    onChange={(event) => setState((prev) => updateMinor(prev, minor.id, "minorName", event.target.value))}
                  />
                </label>
                <label>
                  Identificacion del menor
                  <input
                    value={minor.minorId}
                    onChange={(event) => setState((prev) => updateMinor(prev, minor.id, "minorId", event.target.value))}
                  />
                </label>
                <label>
                  Nombre tutor legal
                  <input
                    value={minor.tutorName}
                    onChange={(event) => setState((prev) => updateMinor(prev, minor.id, "tutorName", event.target.value))}
                  />
                </label>
                <label>
                  Tipo ID tutor
                  <select
                    value={minor.tutorIdType}
                    onChange={(event) => setState((prev) => updateMinor(prev, minor.id, "tutorIdType", event.target.value))}
                  >
                    <option value="Cedula">Cedula</option>
                    <option value="Pasaporte">Pasaporte</option>
                    <option value="DIMEX">DIMEX</option>
                  </select>
                </label>
                <label>
                  ID tutor
                  <input
                    value={minor.tutorId}
                    onChange={(event) => setState((prev) => updateMinor(prev, minor.id, "tutorId", event.target.value))}
                  />
                </label>
                <label>
                  Adulto que viaja con el menor
                  <select
                    value={minor.travelingWith}
                    onChange={(event) =>
                      setState((prev) => updateMinor(prev, minor.id, "travelingWith", event.target.value))
                    }
                  >
                    <option value="">Seleccionar</option>
                    {responsibleAdults.map((name) => (
                      <option key={`${minor.id}-${name}`} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
                {/* Pasaporte menor: SOLO internacional */}
                {!isInternalTrip && (
                <label className={requiredDocumentLabelClass(Boolean(minorDocs[minor.id]?.minorPassport))}>
                  Pasaporte menor
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.webp"
                    onChange={(event) => {
                      const file = event.target.files?.[0] || null;
                      updateFileInputState(event.target, !!file);
                      setMinorDocs((prev) => ({
                        ...prev,
                        [minor.id]: {
                          minorPassport: file,
                          tutorIdFront: prev[minor.id]?.tutorIdFront || null,
                          tutorIdBack: prev[minor.id]?.tutorIdBack || null,
                          tutorPassport: prev[minor.id]?.tutorPassport || null,
                        },
                      }));
                      setState((prev) => updateMinor(prev, minor.id, "minorPassportDocumentName", file?.name || ""));
                    }}
                  />
                </label>
                )}
                <label className={requiredDocumentLabelClass(Boolean(minorDocs[minor.id]?.tutorIdFront))}>
                  Cedula tutor frente
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.webp"
                    onChange={(event) => {
                      const file = event.target.files?.[0] || null;
                      updateFileInputState(event.target, !!file);
                      setMinorDocs((prev) => ({
                        ...prev,
                        [minor.id]: {
                          minorPassport: prev[minor.id]?.minorPassport || null,
                          tutorIdFront: file,
                          tutorIdBack: prev[minor.id]?.tutorIdBack || null,
                          tutorPassport: prev[minor.id]?.tutorPassport || null,
                        },
                      }));
                      setState((prev) => updateMinor(prev, minor.id, "tutorIdFrontDocumentName", file?.name || ""));
                    }}
                  />
                </label>
                <label className={requiredDocumentLabelClass(Boolean(minorDocs[minor.id]?.tutorIdBack))}>
                  Cedula tutor reverso
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.webp"
                    onChange={(event) => {
                      const file = event.target.files?.[0] || null;
                      updateFileInputState(event.target, !!file);
                      setMinorDocs((prev) => ({
                        ...prev,
                        [minor.id]: {
                          minorPassport: prev[minor.id]?.minorPassport || null,
                          tutorIdFront: prev[minor.id]?.tutorIdFront || null,
                          tutorIdBack: file,
                          tutorPassport: prev[minor.id]?.tutorPassport || null,
                        },
                      }));
                      setState((prev) => updateMinor(prev, minor.id, "tutorIdBackDocumentName", file?.name || ""));
                    }}
                  />
                </label>
                {/* Pasaporte tutor: SOLO internacional */}
                {!isInternalTrip && (
                <label className={requiredDocumentLabelClass(Boolean(minorDocs[minor.id]?.tutorPassport))}>
                  Pasaporte tutor
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.webp"
                    onChange={(event) => {
                      const file = event.target.files?.[0] || null;
                      updateFileInputState(event.target, !!file);
                      setMinorDocs((prev) => ({
                        ...prev,
                        [minor.id]: {
                          minorPassport: prev[minor.id]?.minorPassport || null,
                          tutorIdFront: prev[minor.id]?.tutorIdFront || null,
                          tutorIdBack: prev[minor.id]?.tutorIdBack || null,
                          tutorPassport: file,
                        },
                      }));
                      setState((prev) => updateMinor(prev, minor.id, "tutorPassportDocumentName", file?.name || ""));
                    }}
                  />
                </label>
                )}
              </div>
            </article>
          ))}
        </div>
      </div>

      {/* Itinerario: SOLO para viajes internacionales */}
      {!isInternalTrip && (
      <div className="itinerary-box">
        <div className="itinerary-head">
          <h2>Itinerario</h2>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setState((prev) => addCustomItineraryItem(prev))}
            disabled={Boolean(rangeMessage) || Boolean(itineraryMessage)}
          >
            + Agregar actividad
          </button>
        </div>

        {itineraryMessage ? <p className="form-error">{itineraryMessage}</p> : null}

        <div className="itinerary-list">
          {state.itinerary.map((item) => {
            const isFixed = item.kind === "opening" || item.kind === "closing";
            const label = item.kind === "opening" ? "Inicio del Viaje" : item.kind === "closing" ? "Fin del Viaje" : "Actividad";

            return (
              <div key={item.id} className="itinerary-row">
                <label>
                  Tipo
                  <input value={label} readOnly />
                </label>

                <label>
                  Fecha
                  <input
                    type="date"
                    value={item.date}
                    min={!rangeMessage ? state.startDate || undefined : undefined}
                    max={!rangeMessage ? state.endDate || undefined : undefined}
                    readOnly={isFixed}
                    onChange={(event) =>
                      setState((prev) => updateItineraryItem(prev, item.id, "date", event.target.value))
                    }
                  />
                </label>

                <label>
                  Detalle
                  <input
                    value={item.detail}
                    placeholder="Tour a X lugar"
                    onChange={(event) =>
                      setState((prev) => updateItineraryItem(prev, item.id, "detail", event.target.value))
                    }
                  />
                </label>

                <div className="itinerary-actions">
                  {item.kind === "custom" ? (
                    <button
                      type="button"
                      className="btn-secondary"
                      disabled={Boolean(itineraryMessage)}
                      onClick={() => setState((prev) => removeCustomItineraryItem(prev, item.id))}
                    >
                      Eliminar
                    </button>
                  ) : (
                    <span className="hint-pill">No eliminar</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      )}

      {/* Equipaje: SOLO para viajes internacionales */}
      {!isInternalTrip && (
      <div className="form-section-card">
        <h2 className="section-title">Equipaje</h2>
      <div className="contracts-grid">
        <label className="col-span-full">
          Clausula de equipaje permitido
          <textarea
            rows={4}
            value={state.luggageClause}
            onChange={(event) => setState((prev) => ({ ...prev, luggageClause: event.target.value }))}
          />
        </label>
      </div>
      </div>
      )}

      <div className="form-section-card">
        <h2 className="section-title">Adjuntos del Contrato</h2>
      <div className="contracts-grid">
        <label className="col-span-full">
          Comprobante de pago de reserva
          <input
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.webp"
            onChange={(event) => {
              const file = event.target.files?.[0] || null;
              updateFileInputState(event.target, !!file);
              setReservationProof(file);
            }}
          />
          {reservationProof ? (
            <ul className="simple-list">
              <li>{reservationProof.name}</li>
            </ul>
          ) : (
            <small>Sube el comprobante del dep&#243;sito de reserva. Ser&#225; visible para el admin al momento de aprobar.</small>
          )}
        </label>
        <label className="col-span-full">
          Documentos de soporte adicionales (opcional, m&#250;ltiple)
          <input
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.webp"
            multiple
            onChange={(event) => {
              const files = Array.from(event.target.files || []);
              updateFileInputState(event.target, files.length > 0);
              setSupportDocs(files);
              setState((prev) => ({
                ...prev,
                contractDocumentsNames: files.map((file) => file.name),
              }));
            }}
          />
          {state.contractDocumentsNames.length ? (
            <ul className="simple-list">
              {state.contractDocumentsNames.map((name) => (
                <li key={name}>{name}</li>
              ))}
            </ul>
          ) : (
            <small>No hay adjuntos aun.</small>
          )}
        </label>
      </div>
      </div>

      <div className="flex gap-2 flex-wrap mt-3.5">
        <button
          type="button"
          className="btn-secondary"
          disabled={savingDraft || submitting || previewing || busyNumber || !state.contractNumber}
          onClick={() => {
            void saveDraftFlow();
          }}
        >
          {savingDraft ? "Guardando borrador..." : (isInternalTrip ? "Guardar formulario como borrador" : "Guardar borrador")}
        </button>

        {!isInternalTrip && (
          <button
            type="button"
            className="btn-secondary"
            disabled={savingDraft || submitting || previewing || busyNumber || !state.contractNumber}
            onClick={() => {
              void runPreviewFlow();
            }}
          >
            {previewing ? "Generando vista previa..." : "Vista previa"}
          </button>
        )}

        <button
          type="button"
          className="btn-primary"
          disabled={savingDraft || submitting || previewing || busyNumber || !state.contractNumber}
          onClick={() => {
            void runArchiveFlow();
          }}
        >
          {submitting ? "Guardando..." : (isInternalTrip ? "Enviar formulario/comprobante" : "Guardar contrato y reportar reserva")}
        </button>
      </div>

      {/* Enlaces de Firma: SOLO para viajes internacionales */}
      {!isInternalTrip && latestSigningLinks.length ? (
        <div className="itinerary-box">
          <div className="itinerary-head">
            <h2>Enlaces de firma</h2>
          </div>

          {clientSigningLinks.length ? (
            <div className="itinerary-head" style={{ marginTop: 8 }}>
              <h3>Link principal del cliente</h3>
            </div>
          ) : null}
          <div className="itinerary-list">
            {clientSigningLinks.map((item) => (
              <article key={`${item.signerKey}-${item.signingUrl}`} className="subcard">
                <p>
                  <strong>{item.signerName || item.signerKey}</strong>
                  {item.signerEmail ? ` (${item.signerEmail})` : ""}
                </p>
                <div className="contracts-grid" style={{ marginTop: 8 }}>
                  <label className="col-span-full">
                    Link de firma
                    <input type="text" value={item.signingUrl} readOnly />
                  </label>
                </div>
                <div className="flex gap-2 flex-wrap mt-2">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => {
                      void copySigningUrl(item.signingUrl, item.signerKey);
                    }}
                  >
                    {copiedSignerKey === item.signerKey ? "✓ Copiado" : "Copiar link"}
                  </button>
                  <a
                    className="btn-secondary no-underline inline-flex items-center justify-center"
                    href={buildWhatsappShareUrl(item.signingUrl, item.signerName || item.signerKey)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Compartir por WhatsApp
                  </a>
                </div>
              </article>
            ))}

            {companionSigningLinks.length ? (
              <div className="itinerary-head" style={{ marginTop: 8 }}>
                <h3>Links de firma de acompanantes</h3>
              </div>
            ) : null}

            {companionSigningLinks.map((item) => (
              <article key={`${item.signerKey}-${item.signingUrl}`} className="subcard">
                <p>
                  <strong>{item.signerName || item.signerKey}</strong>
                  {item.signerEmail ? ` (${item.signerEmail})` : ""}
                </p>
                <div className="contracts-grid" style={{ marginTop: 8 }}>
                  <label className="col-span-full">
                    Link de firma
                    <input type="text" value={item.signingUrl} readOnly />
                  </label>
                </div>
                <div className="flex gap-2 flex-wrap mt-2">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => {
                      void copySigningUrl(item.signingUrl, item.signerKey);
                    }}
                  >
                    {copiedSignerKey === item.signerKey ? "✓ Copiado" : "Copiar link"}
                  </button>
                  <a
                    className="btn-secondary no-underline inline-flex items-center justify-center"
                    href={buildWhatsappShareUrl(item.signingUrl, item.signerName || item.signerKey)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Compartir por WhatsApp
                  </a>
                </div>
              </article>
            ))}
          </div>
        </div>
      ) : null}

      <p className="status-line">{status}</p>

        </div>

        {/* Modal de Capacidad Insuficiente */}
        {showCapacityModal && capacityError && (
          <ConfirmModal
            isOpen={showCapacityModal}
            title="⚠️ CAPACIDAD INSUFICIENTE"
            message={`Este contrato supera la capacidad disponible del viaje. El viaje "${capacityError.packageName}" no tiene capacidad suficiente.\n\n📦 Viaje: ${capacityError.packageName}\n👥 Solicitados: ${capacityError.participantCount} personas\n✓ Disponibles: ${capacityError.availableSlots} cupos\n(Ocupados: ${capacityError.occupiedSlots} / ${capacityError.capacity})\n\nOpciones:\n1. Guardar como borrador \n2. Contactar con el administrador`}
            confirmText="Guardar como borrador"
            cancelText="Cerrar"
            confirmVariant="warning"
            onConfirm={() => {
              setShowCapacityModal(false);
              void saveDraftFlow();
            }}
            onCancel={() => {
              setShowCapacityModal(false);
              setCapacityError(null);
              setStatus("⚠️ Contacta al administrador para revisar opciones de capacidad.");
            }}
          />
        )}

        {!isInternalTrip && (
          <aside className="contracts-preview-panel">
            <section className="contract-preview-wrap">
              <div className="contract-preview-head">
                <h2>Vista previa del contrato</h2>
                <p>Formato de lectura tipo A4 para revisar y corregir sin salir del formulario.</p>
              </div>
              <div className="contract-preview-stage">
                {previewHtml ? (
                  <iframe
                    title="Vista previa del contrato"
                    className="contract-preview-iframe"
                    srcDoc={previewHtml}
                  />
                ) : (
                  <div className="contract-preview-placeholder">
                    Completa los datos y pulsa Vista previa para mostrar el contrato aqui.
                  </div>
                )}
              </div>
            </section>
          </aside>
        )}
      </div>
    </section>
  );
}
