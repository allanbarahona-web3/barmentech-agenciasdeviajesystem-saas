"use client";

import React from "react";
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
import { CustomerLookupStep } from "@/features/contracts-form/wizard/steps/CustomerLookupStep";
import { HolderStep } from "@/features/contracts-form/wizard/steps/holder/HolderStep";
import { CompanionsStep } from "@/features/contracts-form/wizard/steps/companions/CompanionsStep";
import { MinorsStep } from "@/features/contracts-form/wizard/steps/minors/MinorsStep";
import { ItineraryStep } from "@/features/contracts-form/wizard/steps/itinerary/ItineraryStep";
import { DocumentsStep } from "@/features/contracts-form/wizard/steps/documents/DocumentsStep";
import { InsuranceStep } from "@/features/contracts-form/wizard/steps/insurance/InsuranceStep";
import { SummaryStep } from "@/features/contracts-form/wizard/steps/summary/SummaryStep";
import { contractsStepRegistry } from "@/features/contracts-form/wizard/registry";
import { getStepById } from "@/features/contracts-form/wizard/navigation/navigation-helpers";
import { NATIONALITY_OPTIONS } from './constants';

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
  existingCustomerDocuments: {
    idFront: { id: string; fileName: string; mimeType: string } | null;
    idBack: { id: string; fileName: string; mimeType: string } | null;
    passport: { id: string; fileName: string; mimeType: string } | null;
  };
  companionCustomerDocuments: Record<string, {
    customerId: string;
    idFront: { id: string; fileName: string; mimeType: string } | null;
    idBack: { id: string; fileName: string; mimeType: string } | null;
    passport: { id: string; fileName: string; mimeType: string } | null;
  }>;
  onViewDocument: (customerId: string, documentId: string) => void;
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
  saveStepDraft: () => Promise<void>;
  handleValidateCustomerIdentity: () => Promise<void>;
  handleValidateCompanionIdentity: (companionId: string, idNumber: string, fullName: string) => Promise<void>;
  copySigningUrl: (signingUrl: string, signerKey: string) => Promise<void>;
  runPreviewFlow: () => Promise<void>;
  runArchiveFlow: () => Promise<void>;
  collectDocumentsForArchive: () => File[];
  
  // Navigation props from wizard
  currentStepId: string;
  onNext: () => void;
  onPrevious: () => void;
  canGoNext: boolean;
  canGoPrevious: boolean;
  
  // Progress props from wizard
  currentStepNumber: number;
  totalSteps: number;
  completedSteps: number;
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
    existingCustomerDocuments,
    companionCustomerDocuments,
    onViewDocument,
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
    saveStepDraft,
    handleValidateCustomerIdentity,
    handleValidateCompanionIdentity,
    copySigningUrl,
    runPreviewFlow,
    runArchiveFlow,
    collectDocumentsForArchive,
    currentStepId,
    onNext,
    onPrevious,
    canGoNext,
    canGoPrevious,
    currentStepNumber,
    totalSteps,
    completedSteps,
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

      {/* Wizard Progress Indicator */}
      <div className="mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-gray-700">Paso {currentStepNumber} de {totalSteps}</span>
          <div className="flex items-center gap-2">
            <span className="text-gray-500">{completedSteps} completados</span>
            <button
              type="button"
              className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={() => void saveStepDraft()}
              disabled={savingDraft || submitting || previewing || busyNumber || !state.contractNumber}
              title="Guardar borrador y continuar editando"
            >
              {savingDraft ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </div>
        <div className="mt-2 h-2 bg-gray-200 rounded-full overflow-hidden">
          <div 
            className="h-full bg-blue-600 transition-all duration-300" 
            style={{ width: `${(completedSteps / totalSteps) * 100}%` }}
          />
        </div>
      </div>

      {/* Dynamic Step Rendering - Registry-Driven Navigation */}
      {(() => {
        // Map step IDs to their rendered components with props
        const stepComponents: Record<string, React.ReactElement> = {
          travel: (
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
          ),
          'customer-lookup': (
            <CustomerLookupStep
              state={state}
              setState={setState}
            />
          ),
          holder: (
            <HolderStep
              state={state}
              setState={setState}
              isInternalTrip={isInternalTrip}
              holderDocs={holderDocs}
              setHolderDocs={setHolderDocs}
              existingCustomerDocuments={existingCustomerDocuments}
              onViewDocument={onViewDocument}
              nationalityOptions={NATIONALITY_OPTIONS}
              requiredDocumentLabelClass={requiredDocumentLabelClass}
              updateFileInputState={updateFileInputState}
              handleValidateCustomerIdentity={handleValidateCustomerIdentity}
            />
          ),
          companions: (
            <CompanionsStep
              state={state}
              setState={setState}
              isInternalTrip={isInternalTrip}
              companionDocs={companionDocs}
              setCompanionDocs={setCompanionDocs}
              companionCustomerDocuments={companionCustomerDocuments}
              onViewDocument={onViewDocument}
              handleValidateCompanionIdentity={handleValidateCompanionIdentity}
              nationalityOptions={NATIONALITY_OPTIONS}
              requiredDocumentLabelClass={requiredDocumentLabelClass}
              updateFileInputState={updateFileInputState}
            />
          ),
          minors: (
            <MinorsStep
              state={state}
              setState={setState}
              isInternalTrip={isInternalTrip}
              minorDocs={minorDocs}
              setMinorDocs={setMinorDocs}
              responsibleAdults={responsibleAdults}
              requiredDocumentLabelClass={requiredDocumentLabelClass}
              updateFileInputState={updateFileInputState}
            />
          ),
          itinerary: (
            <ItineraryStep
              state={state}
              setState={setState}
              isInternalTrip={isInternalTrip}
              rangeMessage={rangeMessage}
              itineraryMessage={itineraryMessage}
            />
          ),
          documents: (
            <DocumentsStep
              state={state}
              setState={setState}
              reservationProof={reservationProof}
              setReservationProof={setReservationProof}
              supportDocs={supportDocs}
              setSupportDocs={setSupportDocs}
              updateFileInputState={updateFileInputState}
            />
          ),
          insurance: (
            <InsuranceStep
              state={state}
              setState={setState}
            />
          ),
          summary: (
            <SummaryStep
              isInternalTrip={isInternalTrip}
              savingDraft={savingDraft}
              submitting={submitting}
              previewing={previewing}
              busyNumber={busyNumber}
              contractNumber={state.contractNumber}
              status={status}
              previewHtml={previewHtml}
              latestSigningLinks={latestSigningLinks}
              clientSigningLinks={clientSigningLinks}
              companionSigningLinks={companionSigningLinks}
              copiedSignerKey={copiedSignerKey}
              saveDraftFlow={saveDraftFlow}
              runPreviewFlow={runPreviewFlow}
              runArchiveFlow={runArchiveFlow}
              copySigningUrl={copySigningUrl}
              buildWhatsappShareUrl={buildWhatsappShareUrl}
            />
          ),
        };

        // Validate current step exists in registry
        const currentStep = getStepById(contractsStepRegistry, currentStepId);
        if (!currentStep) {
          return <div className="form-error">Invalid step: {currentStepId}</div>;
        }

        // Render the component from the map
        return stepComponents[currentStepId] || <div className="form-error">Step component not found: {currentStepId}</div>;
      })()}

      {/* Navigation Buttons - Centralized at Wizard Level */}
      <div className="flex gap-3 items-center justify-between mt-6 pt-4 border-t border-gray-200">
        <button
          type="button"
          className="btn-secondary"
          onClick={onPrevious}
          disabled={!canGoPrevious}
          style={{ visibility: canGoPrevious ? 'visible' : 'hidden' }}
        >
          ← Anterior
        </button>
        
        {canGoNext && (
          <button
            type="button"
            className="btn-primary"
            onClick={onNext}
          >
            Siguiente →
          </button>
        )}
      </div>

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
