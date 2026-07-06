"use client";

import type { TravelPackage } from "@/lib/travel-packages-api";
import { ConfirmModal } from "@/components/confirm-modal";
import {
  addCompanion,
  addCustomItineraryItem,
  addMinor,
  applyMoneyDerivedValues,
  createInitialFormState,
  toLocalDateIso,
  normalizeMoneyInputValue,
  removeCompanion,
  removeCustomItineraryItem,
  removeMinor,
  addDaysIso,
  updateCompanion,
  updateItineraryItem,
  updateMinor,
} from "@/features/contracts-form/utils";
import type { ContractFormState, IdType } from "@/features/contracts-form/types";
import { TravelStep } from "@/features/contracts-form/wizard/steps/travel/TravelStep";

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
  // Original props
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
  
  // State from wizard
  state: ContractFormState;
  setState: React.Dispatch<React.SetStateAction<ContractFormState>>;
  status: string;
  setStatus: React.Dispatch<React.SetStateAction<string>>;
  internalTripMeta: { tripCode: string; name: string } | null;
  setInternalTripMeta: React.Dispatch<React.SetStateAction<{ tripCode: string; name: string } | null>>;
  loadedTravelPackage: TravelPackage | null;
  setLoadedTravelPackage: React.Dispatch<React.SetStateAction<TravelPackage | null>>;
  busyNumber: boolean;
  setBusyNumber: React.Dispatch<React.SetStateAction<boolean>>;
  savingDraft: boolean;
  setSavingDraft: React.Dispatch<React.SetStateAction<boolean>>;
  activeDraftId: string | null;
  setActiveDraftId: React.Dispatch<React.SetStateAction<string | null>>;
  previewing: boolean;
  setPreviewing: React.Dispatch<React.SetStateAction<boolean>>;
  previewHtml: string;
  setPreviewHtml: React.Dispatch<React.SetStateAction<string>>;
  submitting: boolean;
  setSubmitting: React.Dispatch<React.SetStateAction<boolean>>;
  copiedSignerKey: string;
  setCopiedSignerKey: React.Dispatch<React.SetStateAction<string>>;
  latestSigningLinks: Array<{ signerKey: string; signerName: string; signerEmail: string | null; signingUrl: string }>;
  setLatestSigningLinks: React.Dispatch<React.SetStateAction<Array<{ signerKey: string; signerName: string; signerEmail: string | null; signingUrl: string }>>>;
  holderDocs: { idFront: File | null; idBack: File | null; passport: File | null };
  setHolderDocs: React.Dispatch<React.SetStateAction<{ idFront: File | null; idBack: File | null; passport: File | null }>>;
  supportDocs: File[];
  setSupportDocs: React.Dispatch<React.SetStateAction<File[]>>;
  reservationProof: File | null;
  setReservationProof: React.Dispatch<React.SetStateAction<File | null>>;
  companionDocs: Record<string, { idFront: File | null; idBack: File | null; passport: File | null }>;
  setCompanionDocs: React.Dispatch<React.SetStateAction<Record<string, { idFront: File | null; idBack: File | null; passport: File | null }>>>;
  minorDocs: Record<
    string,
    {
      minorPassport: File | null;
      tutorIdFront: File | null;
      tutorIdBack: File | null;
      tutorPassport: File | null;
    }
  >;
  setMinorDocs: React.Dispatch<
    React.SetStateAction<
      Record<
        string,
        {
          minorPassport: File | null;
          tutorIdFront: File | null;
          tutorIdBack: File | null;
          tutorPassport: File | null;
        }
      >
    >
  >;
  showCapacityModal: boolean;
  setShowCapacityModal: React.Dispatch<React.SetStateAction<boolean>>;
  showValidationErrorModal: boolean;
  setShowValidationErrorModal: React.Dispatch<React.SetStateAction<boolean>>;
  validationErrorMessage: string;
  setValidationErrorMessage: React.Dispatch<React.SetStateAction<string>>;
  showIdentityConflictModal: boolean;
  setShowIdentityConflictModal: React.Dispatch<React.SetStateAction<boolean>>;
  identityConflictMessage: string;
  setIdentityConflictMessage: React.Dispatch<React.SetStateAction<string>>;
  capacityError: {
    participantCount: number;
    availableSlots: number;
    packageName: string;
    occupiedSlots: number;
    capacity: number;
  } | null;
  setCapacityError: React.Dispatch<
    React.SetStateAction<{
      participantCount: number;
      availableSlots: number;
      packageName: string;
      occupiedSlots: number;
      capacity: number;
    } | null>
  >;
  
  // Refs from wizard
  autoReservationStarted: React.MutableRefObject<boolean>;
  loadedDraftIdRef: React.MutableRefObject<string>;
  loadedTravelPackageIdRef: React.MutableRefObject<string>;
  loadedInternalTripIdRef: React.MutableRefObject<string>;
  
  // Computed values from wizard
  todayIso: string;
  isMigrationMode: boolean;
  isInternalTrip: boolean;
  packageFieldsLocked: boolean;
  rangeMessage: string;
  itineraryMessage: string;
  responsibleAdults: string[];
  clientSigningLinks: Array<{ signerKey: string; signerName: string; signerEmail: string | null; signingUrl: string }>;
  companionSigningLinks: Array<{ signerKey: string; signerName: string; signerEmail: string | null; signingUrl: string }>;
  
  // Handlers from wizard
  saveDraftFlow: () => Promise<void>;
  handleValidateCustomerIdentity: () => Promise<void>;
  copySigningUrl: (signingUrl: string, signerKey: string) => Promise<void>;
  runPreviewFlow: () => Promise<void>;
  runArchiveFlow: () => Promise<void>;
  collectDocumentsForArchive: () => File[];
};

export function ContractsForm(props: ContractsFormProps) {
  // Destructure all props
  const {
    agent,
    initialDraftId,
    initialTravelPackageId,
    initialInternalTripId,
    mode,
    state,
    setState,
    status,
    setStatus,
    internalTripMeta,
    setInternalTripMeta,
    loadedTravelPackage,
    setLoadedTravelPackage,
    busyNumber,
    setBusyNumber,
    savingDraft,
    setSavingDraft,
    activeDraftId,
    setActiveDraftId,
    previewing,
    setPreviewing,
    previewHtml,
    setPreviewHtml,
    submitting,
    setSubmitting,
    copiedSignerKey,
    setCopiedSignerKey,
    latestSigningLinks,
    setLatestSigningLinks,
    holderDocs,
    setHolderDocs,
    supportDocs,
    setSupportDocs,
    reservationProof,
    setReservationProof,
    companionDocs,
    setCompanionDocs,
    minorDocs,
    setMinorDocs,
    showCapacityModal,
    setShowCapacityModal,
    showValidationErrorModal,
    setShowValidationErrorModal,
    validationErrorMessage,
    setValidationErrorMessage,
    showIdentityConflictModal,
    setShowIdentityConflictModal,
    identityConflictMessage,
    setIdentityConflictMessage,
    capacityError,
    setCapacityError,
    autoReservationStarted,
    loadedDraftIdRef,
    loadedTravelPackageIdRef,
    loadedInternalTripIdRef,
    todayIso,
    isMigrationMode,
    isInternalTrip,
    packageFieldsLocked,
    rangeMessage,
    itineraryMessage,
    responsibleAdults,
    clientSigningLinks,
    companionSigningLinks,
    saveDraftFlow,
    handleValidateCustomerIdentity,
    copySigningUrl,
    runPreviewFlow,
    runArchiveFlow,
    collectDocumentsForArchive,
  } = props;

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

  const buildWhatsappShareUrl = (signingUrl: string, signerName = "") => {
    const normalizedUrl = String(signingUrl || "").trim();
    const normalizedSigner = String(signerName || "").trim();
    const signerText = normalizedSigner ? ` para ${normalizedSigner}` : "";
    return `https://wa.me/?text=${encodeURIComponent(
      `Hola, te compartimos el enlace para firmar tu contrato de viaje${signerText}: ${normalizedUrl}`,
    )}`;
  };

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

      <TravelStep
        state={state}
        setState={setState}
        isInternalTrip={isInternalTrip}
        internalTripMeta={internalTripMeta}
        packageFieldsLocked={packageFieldsLocked}
        todayIso={todayIso}
        rangeMessage={rangeMessage}
        onMoneyChange={onMoneyChange}
        onMoneyBlur={onMoneyBlur}
      />

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
            onChange={(event) => setState((prev) => ({ ...prev, clientIdType: event.target.value as IdType }))}
          >
            <option value="Cedula">Cédula</option>
            <option value="Pasaporte">Pasaporte</option>
            <option value="DIMEX">DIMEX</option>
          </select>
        </label>

        <label>
          Numero ID
          <input
            value={state.clientIdNumber}
            onChange={(event) => setState((prev) => ({ ...prev, clientIdNumber: event.target.value }))}
            onBlur={handleValidateCustomerIdentity}
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
          Cédula titular (frente)
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
          Cédula titular (reverso)
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
                    <option value="Cédula">Cédula</option>
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
                  Cédula frente
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
                  Cédula reverso
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
                    <option value="Cédula">Cédula</option>
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

        {/* Modal de Error de Validación */}
        {showValidationErrorModal && (
          <ConfirmModal
            isOpen={showValidationErrorModal}
            title="Error de Validación"
            message={validationErrorMessage}
            confirmText="Entendido"
            cancelText="Cerrar"
            confirmVariant="primary"
            onConfirm={() => {
              setShowValidationErrorModal(false);
              setValidationErrorMessage("");
            }}
            onCancel={() => {
              setShowValidationErrorModal(false);
              setValidationErrorMessage("");
            }}
          />
        )}

        {/* Modal de Conflicto de Identidad */}
        {showIdentityConflictModal && (
          <ConfirmModal
            isOpen={showIdentityConflictModal}
            title="Cliente Existente"
            message={identityConflictMessage}
            confirmText="Entendido"
            cancelText=""
            confirmVariant="warning"
            onConfirm={() => {
              setShowIdentityConflictModal(false);
              setIdentityConflictMessage("");
            }}
            onCancel={() => {
              setShowIdentityConflictModal(false);
              setIdentityConflictMessage("");
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
