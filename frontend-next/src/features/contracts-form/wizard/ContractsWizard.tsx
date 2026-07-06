"use client";

import { ContractsForm } from "@/features/contracts-form/ContractsForm";
import { useState, useRef, useMemo, useEffect } from "react";
import { 
  createInitialFormState, 
  getTodayIsoLocal, 
  getDateRangeValidityMessage, 
  getItineraryValidityMessage,
  syncTourDates,
  applyMoneyDerivedValues,
  toLocalDateIso
} from "@/features/contracts-form/utils";
import type { ContractFormState } from "@/features/contracts-form/types";
import type { TravelPackage } from "@/lib/travel-packages-api";
import { getContractDraft, reserveNextContractNumber, saveContractDraft, archiveContract } from "@/lib/contracts-api";
import { bootstrapBillingContract } from "@/lib/billing-api";
import { getTravelPackageById } from "@/lib/travel-packages-api";
import { getInternalTripById } from "@/lib/internal-trips-api";
import { validateCustomerIdentity } from "@/lib/customers-api";
import { getTenantLegalConfig, getTenantConfig, type TenantLegalConfig } from "@/lib/auth-api";
import { getAllBankAccounts } from "@/lib/bank-accounts-api";
import { type TenantLegalInfo, type BankAccountForContract } from "@/features/contracts-form/pdf-template";
import { buildDocumentPackage } from "@/features/documents/builder/document-builder";
import { calculateParticipants } from "@/features/contracts-form/capacity-validation";

/**
 * Contracts Wizard Props
 * 
 * Same interface as ContractsForm to ensure backward compatibility.
 */
export type ContractsWizardProps = {
  agent?: {
    id: string;
    email: string;
    fullName: string;
    role?: string;
  } | null;
  initialDraftId?: string | null;
  initialTravelPackageId?: string | null;
  initialInternalTripId?: string | null;
  mode?: string;
};

/**
 * Contracts Wizard - Orchestration Layer
 * 
 * Owns all state, refs, and computed values.
 * Passes everything to ContractsForm as props.
 */
export function ContractsWizard({ 
  agent = null, 
  initialDraftId = null, 
  initialTravelPackageId = null, 
  initialInternalTripId = null, 
  mode 
}: ContractsWizardProps) {
  // ==================== STATE ====================
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
  const [showValidationErrorModal, setShowValidationErrorModal] = useState(false);
  const [validationErrorMessage, setValidationErrorMessage] = useState("");
  const [showIdentityConflictModal, setShowIdentityConflictModal] = useState(false);
  const [identityConflictMessage, setIdentityConflictMessage] = useState("");
  const [capacityError, setCapacityError] = useState<{
    participantCount: number;
    availableSlots: number;
    packageName: string;
    occupiedSlots: number;
    capacity: number;
  } | null>(null);

  // ==================== REFS ====================
  const autoReservationStarted = useRef(false);
  const loadedDraftIdRef = useRef("");
  const loadedTravelPackageIdRef = useRef("");
  const loadedInternalTripIdRef = useRef("");

  // ==================== COMPUTED VALUES ====================
  const todayIso = useMemo(() => getTodayIsoLocal(), []);
  const isMigrationMode = mode === "migration" || loadedTravelPackage?.travelType === "MIGRATION";
  const hasSelectedPackage = Boolean(initialTravelPackageId);
  const isInternalTrip = Boolean(initialInternalTripId);
  const packageFieldsLocked = hasSelectedPackage || isInternalTrip;
  const rangeMessage = useMemo(() => getDateRangeValidityMessage(state), [state]);
  const itineraryMessage = useMemo(() => getItineraryValidityMessage(state), [state]);

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

  // ==================== HANDLERS ====================
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

  // ==================== EFFECTS ====================
  // Load draft if initialDraftId is provided
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

  // Load travel package if initialTravelPackageId is provided
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

  // Load internal trip if initialInternalTripId is provided
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

  // Auto-reserve contract number on mount
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

  // ==================== HELPERS ====================
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

  // ==================== BUSINESS HANDLERS ====================
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

  /**
   * Validates customer identity against existing contracts.
   * 
   * **Purpose:**
   * - Prevents duplicate contracts for same customer
   * - Catches potential identity conflicts before archiving
   * - Improves UX by catching conflicts early
   * 
   * Triggered on onBlur of clientIdNumber field
   */
  const handleValidateCustomerIdentity = async () => {
    const idNumber = state.clientIdNumber.trim();
    const fullName = state.clientFullName.trim();

    // Skip validation if either field is empty
    if (!idNumber || !fullName) {
      return;
    }

    try {
      const result = await validateCustomerIdentity({
        idNumber,
        fullName,
      });

      if (!result.valid) {
        // Identity conflict detected - show modal immediately
        setIdentityConflictMessage(result.message);
        setShowIdentityConflictModal(true);
      }
      // If valid, do nothing - continue normally
    } catch (error) {
      // Network or unexpected errors - don't block the user
      console.error("Error validating customer identity:", error);
      // Optionally show a subtle warning but don't block
    }
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

      const documentPackage = buildDocumentPackage(state, {
        logoSrc,
        representativeSignSrc,
      }, tenantLegalInfo, bankAccountsForContract);

      setPreviewHtml(documentPackage.documents[0].html);
      setStatus("Vista previa actualizada abajo del formulario.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "No se pudo generar la vista previa del contrato.");
    } finally {
      setPreviewing(false);
    }
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
        const documentPackage = buildDocumentPackage(state, {
          logoSrc,
          representativeSignSrc,
        }, tenantLegalInfo, bankAccountsForContract);
        contractHtml = documentPackage.documents[0].html;
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
      
      // Business validation errors should be displayed in modal
      const errorMessage = error instanceof Error ? error.message : "No se pudo completar el guardado del contrato.";
      
      // Check if this is a business validation error (e.g., identity mismatch)
      const isBusinessValidationError = 
        errorMessage.includes("already exists with this identification") ||
        errorMessage.includes("identity information does not match") ||
        errorMessage.includes("Ya existe un cliente con este número de identificación") ||
        errorMessage.includes("información de identidad no coincide");
      
      if (isBusinessValidationError) {
        // Show validation error in modal, keep user on page
        setValidationErrorMessage(errorMessage);
        setShowValidationErrorModal(true);
      } else {
        // Unexpected errors continue to show in status
        setStatus(errorMessage);
      }
    } finally {
      setSubmitting(false);
      console.log("🔵 [runArchiveFlow] FIN");
    }
  };

  return (
    <ContractsForm
      agent={agent}
      initialDraftId={initialDraftId}
      initialTravelPackageId={initialTravelPackageId}
      initialInternalTripId={initialInternalTripId}
      mode={mode}
      state={state}
      setState={setState}
      status={status}
      setStatus={setStatus}
      internalTripMeta={internalTripMeta}
      setInternalTripMeta={setInternalTripMeta}
      loadedTravelPackage={loadedTravelPackage}
      setLoadedTravelPackage={setLoadedTravelPackage}
      busyNumber={busyNumber}
      setBusyNumber={setBusyNumber}
      savingDraft={savingDraft}
      setSavingDraft={setSavingDraft}
      activeDraftId={activeDraftId}
      setActiveDraftId={setActiveDraftId}
      previewing={previewing}
      setPreviewing={setPreviewing}
      previewHtml={previewHtml}
      setPreviewHtml={setPreviewHtml}
      submitting={submitting}
      setSubmitting={setSubmitting}
      copiedSignerKey={copiedSignerKey}
      setCopiedSignerKey={setCopiedSignerKey}
      latestSigningLinks={latestSigningLinks}
      setLatestSigningLinks={setLatestSigningLinks}
      holderDocs={holderDocs}
      setHolderDocs={setHolderDocs}
      supportDocs={supportDocs}
      setSupportDocs={setSupportDocs}
      reservationProof={reservationProof}
      setReservationProof={setReservationProof}
      companionDocs={companionDocs}
      setCompanionDocs={setCompanionDocs}
      minorDocs={minorDocs}
      setMinorDocs={setMinorDocs}
      showCapacityModal={showCapacityModal}
      setShowCapacityModal={setShowCapacityModal}
      showValidationErrorModal={showValidationErrorModal}
      setShowValidationErrorModal={setShowValidationErrorModal}
      validationErrorMessage={validationErrorMessage}
      setValidationErrorMessage={setValidationErrorMessage}
      showIdentityConflictModal={showIdentityConflictModal}
      setShowIdentityConflictModal={setShowIdentityConflictModal}
      identityConflictMessage={identityConflictMessage}
      setIdentityConflictMessage={setIdentityConflictMessage}
      capacityError={capacityError}
      setCapacityError={setCapacityError}
      autoReservationStarted={autoReservationStarted}
      loadedDraftIdRef={loadedDraftIdRef}
      loadedTravelPackageIdRef={loadedTravelPackageIdRef}
      loadedInternalTripIdRef={loadedInternalTripIdRef}
      todayIso={todayIso}
      isMigrationMode={isMigrationMode}
      isInternalTrip={isInternalTrip}
      packageFieldsLocked={packageFieldsLocked}
      rangeMessage={rangeMessage}
      itineraryMessage={itineraryMessage}
      responsibleAdults={responsibleAdults}
      clientSigningLinks={clientSigningLinks}
      companionSigningLinks={companionSigningLinks}
      saveDraftFlow={saveDraftFlow}
      handleValidateCustomerIdentity={handleValidateCustomerIdentity}
      copySigningUrl={copySigningUrl}
      runPreviewFlow={runPreviewFlow}
      runArchiveFlow={runArchiveFlow}
      collectDocumentsForArchive={collectDocumentsForArchive}
    />
  );
}
