import { useState } from 'react';
import type { ContractFormState, IdType } from "@/features/contracts-form/types";

export interface HolderStepProps {
  state: ContractFormState;
  setState: React.Dispatch<React.SetStateAction<ContractFormState>>;
  isInternalTrip: boolean;
  holderDocs: { idFront: File | null; idBack: File | null; passport: File | null };
  setHolderDocs: React.Dispatch<React.SetStateAction<{ idFront: File | null; idBack: File | null; passport: File | null }>>;
  existingCustomerDocuments: {
    idFront: { id: string; fileName: string; mimeType: string } | null;
    idBack: { id: string; fileName: string; mimeType: string } | null;
    passport: { id: string; fileName: string; mimeType: string } | null;
  };
  onViewDocument: (customerId: string, documentId: string) => void;
  nationalityOptions: string[];
  requiredDocumentLabelClass: (hasAttachment: boolean) => string;
  updateFileInputState: (input: HTMLInputElement, hasFile: boolean) => void;
  handleValidateCustomerIdentity: () => Promise<void>;
}

/**
 * HolderStep - Customer/Holder Information Section
 * 
 * Extracted from ContractsForm as part of incremental component extraction.
 * Contains the complete "Datos del Cliente" section including:
 * - Personal information (name, ID, email, phone, address)
 * - Emergency contact information
 * - Civil status and profession
 * - Nationality
 * - Document uploads (ID front/back, passport)
 * - Identity validation
 * 
 * This component is designed for high reusability across:
 * - Contract Wizard
 * - CRM modules
 * - Customer Management
 * - Reservation systems
 * 
 * This is a pure extraction with zero functional changes.
 */
export function HolderStep({
  state,
  setState,
  isInternalTrip,
  holderDocs,
  setHolderDocs,
  existingCustomerDocuments,
  onViewDocument,
  nationalityOptions,
  requiredDocumentLabelClass,
  updateFileInputState,
  handleValidateCustomerIdentity,
}: HolderStepProps) {
  // Track which documents are being replaced
  const [replacingDocs, setReplacingDocs] = useState<{
    idFront: boolean;
    idBack: boolean;
    passport: boolean;
  }>({ idFront: false, idBack: false, passport: false });
  const [showMenu, setShowMenu] = useState<string | null>(null);

  const hasExistingIdFront = Boolean(existingCustomerDocuments.idFront);
  const hasExistingIdBack = Boolean(existingCustomerDocuments.idBack);
  const hasExistingPassport = Boolean(existingCustomerDocuments.passport);
  const hasAttachment = (docType: 'idFront' | 'idBack' | 'passport') => 
    Boolean(holderDocs[docType]) || Boolean(existingCustomerDocuments[docType]);

  return (
    <div className="form-section-card">
      <h2 className="section-title">Datos del Cliente</h2>

      <div className="contracts-grid">
        <label>
          Nombre completo
          <input
            value={state.clientFullName}
            readOnly
            style={{ backgroundColor: "#f3f4f6", cursor: "not-allowed" }}
          />
        </label>

        <label>
          Tipo ID
          <input
            value={state.clientIdType}
            readOnly
            style={{ backgroundColor: "#f3f4f6", cursor: "not-allowed" }}
          />
        </label>

        <label>
          Numero ID
          <input
            value={state.clientIdNumber}
            readOnly
            style={{ backgroundColor: "#f3f4f6", cursor: "not-allowed" }}
          />
        </label>

        <label>
          Correo
          <input
            type="email"
            value={state.clientEmail}
            readOnly
            style={{ backgroundColor: "#f3f4f6", cursor: "not-allowed" }}
          />
        </label>

        <label>
          Telefono
          <input
            value={state.clientPhone}
            readOnly
            style={{ backgroundColor: "#f3f4f6", cursor: "not-allowed" }}
          />
        </label>

        <label>
          Direccion
          <input
            value={state.clientAddress}
            readOnly
            style={{ backgroundColor: "#f3f4f6", cursor: "not-allowed" }}
          />
        </label>

        <label>
          Contacto emergencia
          <input
            value={state.emergencyContactName}
            readOnly
            style={{ backgroundColor: "#f3f4f6", cursor: "not-allowed" }}
          />
        </label>

        <label>
          Telefono emergencia
          <input
            value={state.emergencyContactPhone}
            readOnly
            style={{ backgroundColor: "#f3f4f6", cursor: "not-allowed" }}
          />
        </label>

        <label>
          Estado civil
          <input
            value={state.civilStatus}
            readOnly
            style={{ backgroundColor: "#f3f4f6", cursor: "not-allowed" }}
          />
        </label>

        <label>
          Profesion
          <input
            value={state.profession}
            readOnly
            style={{ backgroundColor: "#f3f4f6", cursor: "not-allowed" }}
          />
        </label>

        <label>
          Nacionalidad
          <input
            value={state.clientNationality}
            readOnly
            style={{ backgroundColor: "#f3f4f6", cursor: "not-allowed" }}
          />
        </label>

        {/* Cédula (frente) - Existing or Upload */}
        <label className={requiredDocumentLabelClass(hasAttachment('idFront'))}>
          Cédula titular (frente)
          {hasExistingIdFront && !replacingDocs.idFront ? (
            <div style={{ position: 'relative', marginTop: '8px' }}>
              <button
                type="button"
                onClick={() => setShowMenu(showMenu === 'idFront' ? null : 'idFront')}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  background: 'white',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: '14px',
                  color: '#374151'
                }}
              >
                <span>✓ Existing document</span>
                <span>▼</span>
              </button>
              {showMenu === 'idFront' && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  marginTop: '4px',
                  background: 'white',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                  zIndex: 10,
                  overflow: 'hidden'
                }}>
                  <button
                    type="button"
                    onClick={() => {
                      onViewDocument(state.selectedCustomerId!, existingCustomerDocuments.idFront!.id);
                      setShowMenu(null);
                    }}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      background: 'white',
                      border: 'none',
                      cursor: 'pointer',
                      textAlign: 'left',
                      fontSize: '14px'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#f9fafb'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
                  >
                    View document
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setReplacingDocs(prev => ({ ...prev, idFront: true }));
                      setShowMenu(null);
                    }}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      background: 'white',
                      border: 'none',
                      borderTop: '1px solid #f3f4f6',
                      cursor: 'pointer',
                      textAlign: 'left',
                      fontSize: '14px'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#f9fafb'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
                  >
                    Replace document
                  </button>
                </div>
              )}
            </div>
          ) : (
            <>
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                key={holderDocs.idFront ? holderDocs.idFront.name : 'empty-idFront'}
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
              {holderDocs.idFront && (
                <small style={{ color: '#1a8a4e', fontWeight: 600 }}>✓ {holderDocs.idFront.name}</small>
              )}
              {replacingDocs.idFront && (
                <button
                  type="button"
                  onClick={() => setReplacingDocs(prev => ({ ...prev, idFront: false }))}
                  style={{
                    marginTop: '6px',
                    padding: '4px 10px',
                    background: '#ef4444',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '11px'
                  }}
                >
                  Cancelar
                </button>
              )}
            </>
          )}
        </label>

        {/* Cédula (reverso) - Existing or Upload */}
        <label className={requiredDocumentLabelClass(hasAttachment('idBack'))}>
          Cédula titular (reverso)
          {hasExistingIdBack && !replacingDocs.idBack ? (
            <div style={{ position: 'relative', marginTop: '8px' }}>
              <button
                type="button"
                onClick={() => setShowMenu(showMenu === 'idBack' ? null : 'idBack')}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  background: 'white',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: '14px',
                  color: '#374151'
                }}
              >
                <span>✓ Existing document</span>
                <span>▼</span>
              </button>
              {showMenu === 'idBack' && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  marginTop: '4px',
                  background: 'white',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                  zIndex: 10,
                  overflow: 'hidden'
                }}>
                  <button
                    type="button"
                    onClick={() => {
                      onViewDocument(state.selectedCustomerId!, existingCustomerDocuments.idBack!.id);
                      setShowMenu(null);
                    }}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      background: 'white',
                      border: 'none',
                      cursor: 'pointer',
                      textAlign: 'left',
                      fontSize: '14px'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#f9fafb'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
                  >
                    View document
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setReplacingDocs(prev => ({ ...prev, idBack: true }));
                      setShowMenu(null);
                    }}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      background: 'white',
                      border: 'none',
                      borderTop: '1px solid #f3f4f6',
                      cursor: 'pointer',
                      textAlign: 'left',
                      fontSize: '14px'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#f9fafb'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
                  >
                    Replace document
                  </button>
                </div>
              )}
            </div>
          ) : (
            <>
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                key={holderDocs.idBack ? holderDocs.idBack.name : 'empty-idBack'}
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
              {holderDocs.idBack && (
                <small style={{ color: '#1a8a4e', fontWeight: 600 }}>✓ {holderDocs.idBack.name}</small>
              )}
              {replacingDocs.idBack && (
                <button
                  type="button"
                  onClick={() => setReplacingDocs(prev => ({ ...prev, idBack: false }))}
                  style={{
                    marginTop: '6px',
                    padding: '4px 10px',
                    background: '#ef4444',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '11px'
                  }}
                >
                  Cancelar
                </button>
              )}
            </>
          )}
        </label>

        {/* Pasaporte: SOLO para viajes internacionales - Existing or Upload */}
        {!isInternalTrip && (
          <label className={requiredDocumentLabelClass(hasAttachment('passport'))}>
            Pasaporte titular
            {hasExistingPassport && !replacingDocs.passport ? (
              <div style={{ position: 'relative', marginTop: '8px' }}>
                <button
                  type="button"
                  onClick={() => setShowMenu(showMenu === 'passport' ? null : 'passport')}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    background: 'white',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: '14px',
                    color: '#374151'
                  }}
                >
                  <span>✓ Existing document</span>
                  <span>▼</span>
                </button>
                {showMenu === 'passport' && (
                  <div style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    marginTop: '4px',
                    background: 'white',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                    zIndex: 10,
                    overflow: 'hidden'
                  }}>
                    <button
                      type="button"
                      onClick={() => {
                        onViewDocument(state.selectedCustomerId!, existingCustomerDocuments.passport!.id);
                        setShowMenu(null);
                      }}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        background: 'white',
                        border: 'none',
                        cursor: 'pointer',
                        textAlign: 'left',
                        fontSize: '14px'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = '#f9fafb'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
                    >
                      View document
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setReplacingDocs(prev => ({ ...prev, passport: true }));
                        setShowMenu(null);
                      }}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        background: 'white',
                        border: 'none',
                        borderTop: '1px solid #f3f4f6',
                        cursor: 'pointer',
                        textAlign: 'left',
                        fontSize: '14px'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = '#f9fafb'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
                    >
                      Replace document
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <>
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp"
                  key={holderDocs.passport ? holderDocs.passport.name : 'empty-passport'}
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
                {holderDocs.passport && (
                  <small style={{ color: '#1a8a4e', fontWeight: 600 }}>✓ {holderDocs.passport.name}</small>
                )}
                {replacingDocs.passport && (
                  <button
                    type="button"
                    onClick={() => setReplacingDocs(prev => ({ ...prev, passport: false }))}
                    style={{
                      marginTop: '6px',
                      padding: '4px 10px',
                      background: '#ef4444',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '11px'
                    }}
                  >
                    Cancelar
                  </button>
                )}
              </>
            )}
          </label>
        )}
      </div>
    </div>
  );
}
