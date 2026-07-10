import { useState } from 'react';
import type { ContractFormState } from "@/features/contracts-form/types";
import { addCompanion, addCompanionFromCustomer, removeCompanion, updateCompanion } from "@/features/contracts-form/utils";
import { getCustomers, getCustomerProfile, updateCustomer, type CustomerListItem, type CustomerInfo } from '@/lib/customers-api';
import { CustomerEditModal } from '@/features/customers/components/CustomerEditModal';

export interface CompanionsStepProps {
  state: ContractFormState;
  setState: React.Dispatch<React.SetStateAction<ContractFormState>>;
  isInternalTrip: boolean;
  companionDocs: Record<string, { idFront: File | null; idBack: File | null; passport: File | null }>;
  setCompanionDocs: React.Dispatch<React.SetStateAction<Record<string, { idFront: File | null; idBack: File | null; passport: File | null }>>>;
  companionCustomerDocuments: Record<string, {
    customerId: string;
    idFront: { id: string; fileName: string; mimeType: string } | null;
    idBack: { id: string; fileName: string; mimeType: string } | null;
    passport: { id: string; fileName: string; mimeType: string } | null;
  }>;
  onViewDocument: (customerId: string, documentId: string) => void;
  handleValidateCompanionIdentity: (companionId: string, idNumber: string, fullName: string) => Promise<void>;
  nationalityOptions: string[];
  requiredDocumentLabelClass: (hasAttachment: boolean) => string;
  updateFileInputState: (input: HTMLInputElement, hasFile: boolean) => void;
}

/**
 * CompanionsStep - Companions/Travel Companions Section
 * 
 * Extracted from ContractsForm as part of incremental component extraction.
 * Contains the complete "Acompanantes" section including:
 * - Companion list management
 * - Add/remove companion functionality
 * - Companion personal information
 * - Companion identification and contact details
 * - Companion document uploads (ID, passport for international trips)
 * - Conditional rendering for international vs internal trips
 * 
 * This component manages the list of adults traveling with the holder.
 * Each companion shares similar fields to HolderStep but can be added/removed dynamically.
 * 
 * This is a pure extraction with zero functional changes.
 */
export function CompanionsStep({
  state,
  setState,
  isInternalTrip,
  companionDocs,
  setCompanionDocs,
  companionCustomerDocuments,
  onViewDocument,
  handleValidateCompanionIdentity,
  nationalityOptions,
  requiredDocumentLabelClass,
  updateFileInputState,
}: CompanionsStepProps) {
  const [replacingDocs, setReplacingDocs] = useState<Record<string, { idFront: boolean; idBack: boolean; passport: boolean }>>({});
  const [showMenu, setShowMenu] = useState<string | null>(null);
  const [showLookupModal, setShowLookupModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<CustomerListItem[]>([]);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [selectedCompanionCustomer, setSelectedCompanionCustomer] = useState<CustomerListItem | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [customerToEdit, setCustomerToEdit] = useState<CustomerInfo | null>(null);
  const [editingCompanionId, setEditingCompanionId] = useState<string | null>(null);

  async function handleSearchCompanion() {
    if (!searchQuery.trim()) {
      setLookupError('Por favor ingrese un número de identificación');
      return;
    }

    setSearching(true);
    setLookupError(null);

    try {
      const response = await getCustomers({ search: searchQuery.trim(), pageSize: 10 });
      setSearchResults(response.customers);
      if (response.customers.length === 0) {
        setLookupError('No se encontraron clientes con esa identificación');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error al buscar clientes';
      setLookupError(errorMessage);
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }

  async function handleSelectCompanionCustomer(customer: CustomerListItem) {
    setSelectedCompanionCustomer(customer);
  }

  function handleClearSelection() {
    setSelectedCompanionCustomer(null);
  }

  async function handleConfirmSelection() {
    if (!selectedCompanionCustomer) return;

    try {
      // Fetch full customer profile
      const profile = await getCustomerProfile(selectedCompanionCustomer.id);
      const customerData = profile.customer;

      // Create companion with customer data and capture the new state
      let newCompanionId: string | null = null;
      setState((prev) => {
        const newState = addCompanionFromCustomer(prev, {
          fullName: customerData.fullName,
          idNumber: customerData.idNumber,
          email: customerData.email,
          phone: customerData.phone || '',
          emergencyContactName: customerData.emergencyContactName || '',
          emergencyContactPhone: customerData.emergencyContactPhone || '',
          address: customerData.address || '',
        });
        // Capture the newly created companion's ID (it's the last one)
        newCompanionId = newState.companions[newState.companions.length - 1]?.id || null;
        return newState;
      });

      // Wait for React to process the state update, then load documents
      setTimeout(() => {
        if (newCompanionId) {
          handleValidateCompanionIdentity(newCompanionId, customerData.idNumber, customerData.fullName);
        }
      }, 50);

      // Close modal
      setShowLookupModal(false);
      setSearchQuery('');
      setSearchResults([]);
      setLookupError(null);
      setSelectedCompanionCustomer(null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error al cargar cliente';
      setLookupError(errorMessage);
    }
  }

  async function handleEditSelectedCompanion() {
    if (!selectedCompanionCustomer) return;

    try {
      const profile = await getCustomerProfile(selectedCompanionCustomer.id);
      setCustomerToEdit(profile.customer);
      setIsEditModalOpen(true);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error al cargar cliente';
      setLookupError(errorMessage);
    }
  }

  function handleSkipLookup() {
    setState((prev) => addCompanion(prev));
    setShowLookupModal(false);
    setSearchQuery('');
    setSearchResults([]);
    setLookupError(null);
    setSelectedCompanionCustomer(null);
  }

  async function handleEditCompanionCustomer(companionId: string, customerId: string) {
    try {
      // Fetch full customer profile
      const profile = await getCustomerProfile(customerId);
      setCustomerToEdit(profile.customer);
      setEditingCompanionId(companionId);
      setIsEditModalOpen(true);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error al cargar cliente';
      console.error(errorMessage);
    }
  }

  async function handleSaveCustomerEdit(formData: {
    fullName: string;
    idType: string;
    email: string;
    phone: string;
    maritalStatus: string;
    nationality: string;
    occupation: string;
    address: string;
    emergencyContactName: string;
    emergencyContactPhone: string;
  }) {
    if (!customerToEdit) return;

    try {
      // Update customer via API
      const updatedProfile = await updateCustomer(customerToEdit.id, formData);
      const updatedCustomer = updatedProfile.customer;

      // If editing a companion already in the list
      if (editingCompanionId) {
        // Update companion fields with the updated customer data
        setState((prev) => {
          const updatedCompanions = prev.companions.map((c) =>
            c.id === editingCompanionId
              ? {
                  ...c,
                  fullName: updatedCustomer.fullName,
                  email: updatedCustomer.email,
                  phone: updatedCustomer.phone || '',
                  emergencyContactName: updatedCustomer.emergencyContactName || '',
                  emergencyContactPhone: updatedCustomer.emergencyContactPhone || '',
                  address: updatedCustomer.address || '',
                  profession: updatedCustomer.occupation || '',
                  nationality: updatedCustomer.nationality || '',
                }
              : c
          );
          return { ...prev, companions: updatedCompanions };
        });
      } else {
        // If editing from the lookup modal (selectedCompanionCustomer)
        // Update the selected companion customer in the search results
        setSearchResults((prev) =>
          prev.map((c) =>
            c.id === updatedCustomer.id
              ? {
                  ...c,
                  fullName: updatedCustomer.fullName,
                  email: updatedCustomer.email,
                  phone: updatedCustomer.phone,
                }
              : c
          )
        );

        // Update the selected companion customer
        setSelectedCompanionCustomer((prev) =>
          prev
            ? {
                ...prev,
                fullName: updatedCustomer.fullName,
                email: updatedCustomer.email,
                phone: updatedCustomer.phone,
              }
            : null
        );
      }

      setIsEditModalOpen(false);
      setCustomerToEdit(null);
      setEditingCompanionId(null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error al actualizar cliente';
      throw new Error(errorMessage);
    }
  }

  function handleOpenLookupModal() {
    setShowLookupModal(true);
    setSearchQuery('');
    setSearchResults([]);
    setLookupError(null);
    setSelectedCompanionCustomer(null);
  }

  return (
    <div className="itinerary-box">
      <div className="itinerary-head">
        <h2>Acompanantes</h2>
        <button 
          type="button" 
          className="btn-secondary" 
          onClick={handleOpenLookupModal}
        >
          + Agregar acompanante
        </button>
      </div>

      {/* Companion Lookup Modal */}
      {showLookupModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{
            background: 'white',
            borderRadius: '12px',
            padding: '24px',
            maxWidth: '600px',
            width: '90%',
            maxHeight: '80vh',
            overflow: 'auto',
          }}>
            <h2 style={{ marginTop: 0, marginBottom: '24px', fontSize: '20px', fontWeight: '600', color: '#1f2937' }}>Buscar Acompañante</h2>
            
            <div style={{ marginBottom: '24px' }}>
              <p style={{ color: '#6b7280', fontSize: '14px', marginBottom: '16px' }}>
                Busque un acompañante existente por número de identificación o continúe para crear un nuevo acompañante.
              </p>

              {/* Search Input */}
              <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleSearchCompanion();
                    }
                  }}
                  placeholder="Número de identificación"
                  disabled={searching}
                  style={{
                    flex: 1,
                    padding: '10px 14px',
                    border: '2px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '15px',
                    color: '#1f2937',
                    transition: 'border-color 0.2s',
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = '#667eea')}
                  onBlur={(e) => (e.currentTarget.style.borderColor = '#e5e7eb')}
                />
                <button
                  onClick={handleSearchCompanion}
                  disabled={searching}
                  style={{
                    padding: '10px 24px',
                    background: searching ? '#9ca3af' : '#667eea',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: searching ? 'not-allowed' : 'pointer',
                    fontSize: '14px',
                    fontWeight: '500',
                    transition: 'all 0.2s',
                    whiteSpace: 'nowrap',
                  }}
                  onMouseEnter={(e) => !searching && (e.currentTarget.style.background = '#5568d3')}
                  onMouseLeave={(e) => !searching && (e.currentTarget.style.background = '#667eea')}
                >
                  {searching ? 'Buscando...' : '🔍 Buscar'}
                </button>
              </div>

              {/* Error Message */}
              {lookupError && (
                <div
                  style={{
                    padding: '12px',
                    background: '#fee2e2',
                    border: '1px solid #fca5a5',
                    borderRadius: '8px',
                    color: '#991b1b',
                    fontSize: '14px',
                    marginBottom: '16px',
                  }}
                >
                  {lookupError}
                </div>
              )}

              {/* Selected Companion Display */}
              {selectedCompanionCustomer && (
                <div
                  style={{
                    padding: '16px',
                    background: '#f0fdf4',
                    border: '2px solid #86efac',
                    borderRadius: '12px',
                    marginBottom: '16px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '20px' }}>✅</span>
                      <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#166534' }}>
                        Acompañante Seleccionado
                      </h3>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={handleEditSelectedCompanion}
                        style={{
                          padding: '4px 12px',
                          background: 'transparent',
                          color: '#166534',
                          border: '1px solid #86efac',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontSize: '12px',
                          fontWeight: '500',
                          transition: 'all 0.2s',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = '#dcfce7';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'transparent';
                        }}
                      >
                        ✏️ Editar
                      </button>
                      <button
                        onClick={handleClearSelection}
                        style={{
                          padding: '4px 12px',
                          background: 'transparent',
                          color: '#166534',
                          border: '1px solid #86efac',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontSize: '12px',
                          fontWeight: '500',
                          transition: 'all 0.2s',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = '#dcfce7';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'transparent';
                        }}
                      >
                        Cambiar
                      </button>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gap: '8px' }}>
                    <div style={{ fontSize: '14px', color: '#15803d' }}>
                      <strong>Nombre:</strong> {selectedCompanionCustomer.fullName}
                    </div>
                    <div style={{ fontSize: '14px', color: '#15803d' }}>
                      <strong>Cédula:</strong> {selectedCompanionCustomer.idNumber}
                    </div>
                    <div style={{ fontSize: '14px', color: '#15803d' }}>
                      <strong>Email:</strong> {selectedCompanionCustomer.email}
                    </div>
                    {selectedCompanionCustomer.phone && (
                      <div style={{ fontSize: '14px', color: '#15803d' }}>
                        <strong>Teléfono:</strong> {selectedCompanionCustomer.phone}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Search Results */}
              {!selectedCompanionCustomer && searchResults.length > 0 && (
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#374151', marginBottom: '12px' }}>
                    Resultados de Búsqueda ({searchResults.length})
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {searchResults.map((customer) => (
                      <div
                        key={customer.id}
                        style={{
                          padding: '16px',
                          background: 'white',
                          border: '2px solid #e5e7eb',
                          borderRadius: '12px',
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = '#667eea';
                          e.currentTarget.style.background = '#f9fafb';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = '#e5e7eb';
                          e.currentTarget.style.background = 'white';
                        }}
                        onClick={() => handleSelectCompanionCustomer(customer)}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                          <div style={{ flex: 1 }}>
                            <h4 style={{ fontSize: '16px', fontWeight: '600', color: '#1f2937', marginBottom: '8px' }}>
                              {customer.fullName}
                            </h4>
                            <div style={{ display: 'grid', gap: '4px' }}>
                              <div style={{ fontSize: '14px', color: '#6b7280' }}>
                                <strong>Cédula:</strong> {customer.idNumber}
                              </div>
                              <div style={{ fontSize: '14px', color: '#6b7280' }}>
                                <strong>Email:</strong> {customer.email}
                              </div>
                              {customer.phone && (
                                <div style={{ fontSize: '14px', color: '#6b7280' }}>
                                  <strong>Teléfono:</strong> {customer.phone}
                                </div>
                              )}
                            </div>
                          </div>
                          <button
                            style={{
                              padding: '6px 16px',
                              background: '#667eea',
                              color: 'white',
                              border: 'none',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              fontSize: '14px',
                              fontWeight: '500',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            Seleccionar
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* No Results Message */}
              {!selectedCompanionCustomer && searchResults.length === 0 && !searching && lookupError && searchQuery.trim() && (
                <div
                  style={{
                    padding: '40px 20px',
                    textAlign: 'center',
                    background: '#fef3c7',
                    border: '2px solid #fcd34d',
                    borderRadius: '12px',
                  }}
                >
                  <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔍</div>
                  <h3
                    style={{
                      fontSize: '18px',
                      fontWeight: '600',
                      color: '#92400e',
                      marginBottom: '8px',
                    }}
                  >
                    No se encontró ningún acompañante
                  </h3>
                  <p style={{ color: '#b45309', fontSize: '14px', maxWidth: '500px', margin: '0 auto 16px' }}>
                    No existe un cliente con el número de identificación "{searchQuery}".
                  </p>
                  <button
                    onClick={handleSkipLookup}
                    style={{
                      padding: '12px 24px',
                      background: '#10b981',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontSize: '15px',
                      fontWeight: '600',
                      transition: 'all 0.2s',
                      marginTop: '8px',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#059669')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = '#10b981')}
                  >
                    ➕ Crear Nuevo Acompañante
                  </button>
                </div>
              )}

              {/* Initial State */}
              {!selectedCompanionCustomer && !searchQuery.trim() && searchResults.length === 0 && (
                <div
                  style={{
                    padding: '40px 20px',
                    textAlign: 'center',
                    background: '#f9fafb',
                    borderRadius: '12px',
                    border: '2px dashed #e5e7eb',
                  }}
                >
                  <div style={{ fontSize: '48px', marginBottom: '16px' }}>👤</div>
                  <h3
                    style={{
                      fontSize: '18px',
                      fontWeight: '600',
                      color: '#374151',
                      marginBottom: '8px',
                    }}
                  >
                    Buscar Acompañante Existente
                  </h3>
                  <p style={{ color: '#6b7280', fontSize: '14px', maxWidth: '500px', margin: '0 auto 16px' }}>
                    Ingrese el número de identificación del acompañante para buscar en la base de datos.
                    Si el acompañante ya existe, puede seleccionarlo para continuar.
                  </p>
                  <button
                    onClick={handleSkipLookup}
                    style={{
                      padding: '12px 24px',
                      background: '#667eea',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontSize: '15px',
                      fontWeight: '600',
                      transition: 'all 0.2s',
                      marginTop: '8px',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#5568d3')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = '#667eea')}
                  >
                    ➕ Crear Nuevo Acompañante
                  </button>
                </div>
              )}

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '20px' }}>
                <button
                  type="button"
                  onClick={() => setShowLookupModal(false)}
                  style={{
                    padding: '10px 20px',
                    background: 'white',
                    color: '#374151',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: '500',
                  }}
                >
                  Cancelar
                </button>
                {selectedCompanionCustomer && (
                  <button
                    type="button"
                    onClick={handleConfirmSelection}
                    style={{
                      padding: '10px 20px',
                      background: '#10b981',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '14px',
                      fontWeight: '500',
                      transition: 'all 0.2s',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#059669')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = '#10b981')}
                  >
                    Siguiente →
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="itinerary-list">
        {state.companions.length === 0 ? <p className="m-0 text-[#4b6790] text-sm">Aun no hay acompanantes.</p> : null}
        {state.companions.map((companion, index) => (
          <article key={companion.id} className="subcard">
            <div className="itinerary-head">
              <h3>Acompanante {index + 1}</h3>
              <div style={{ display: 'flex', gap: '8px' }}>
                {companionCustomerDocuments[companion.id]?.customerId && (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => handleEditCompanionCustomer(companion.id, companionCustomerDocuments[companion.id].customerId)}
                    style={{
                      background: '#667eea',
                      color: 'white',
                      border: 'none',
                    }}
                  >
                    ✏️ Editar
                  </button>
                )}
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
                  {nationalityOptions.map((country, idx) => (
                    <option key={idx} value={country} disabled={country === "──────────"}>
                      {country}
                    </option>
                  ))}
                </select>
              </label>
              <label className={requiredDocumentLabelClass(Boolean(companionDocs[companion.id]?.idFront) || Boolean(companionCustomerDocuments[companion.id]?.idFront))}>
                Cédula frente
                {companionCustomerDocuments[companion.id]?.idFront && !replacingDocs[companion.id]?.idFront ? (
                  <div style={{ position: 'relative', marginTop: '8px' }}>
                    <button
                      type="button"
                      onClick={() => setShowMenu(showMenu === `${companion.id}-idFront` ? null : `${companion.id}-idFront`)}
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
                    {showMenu === `${companion.id}-idFront` && (
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
                            onViewDocument(companionCustomerDocuments[companion.id].customerId, companionCustomerDocuments[companion.id].idFront!.id);
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
                            setReplacingDocs(prev => ({ ...prev, [companion.id]: { ...prev[companion.id], idFront: true } }));
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
                      key={companionDocs[companion.id]?.idFront ? companionDocs[companion.id].idFront!.name : `empty-${companion.id}-idFront`}
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
                    {companionDocs[companion.id]?.idFront && (
                      <small style={{ color: '#1a8a4e', fontWeight: 600 }}>✓ {companionDocs[companion.id].idFront!.name}</small>
                    )}
                    {replacingDocs[companion.id]?.idFront && (
                      <button
                        type="button"
                        onClick={() => setReplacingDocs(prev => ({ ...prev, [companion.id]: { ...prev[companion.id], idFront: false } }))}
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
              <label className={requiredDocumentLabelClass(Boolean(companionDocs[companion.id]?.idBack) || Boolean(companionCustomerDocuments[companion.id]?.idBack))}>
                Cédula reverso
                {companionCustomerDocuments[companion.id]?.idBack && !replacingDocs[companion.id]?.idBack ? (
                  <div style={{ position: 'relative', marginTop: '8px' }}>
                    <button
                      type="button"
                      onClick={() => setShowMenu(showMenu === `${companion.id}-idBack` ? null : `${companion.id}-idBack`)}
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
                    {showMenu === `${companion.id}-idBack` && (
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
                            onViewDocument(companionCustomerDocuments[companion.id].customerId, companionCustomerDocuments[companion.id].idBack!.id);
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
                            setReplacingDocs(prev => ({ ...prev, [companion.id]: { ...prev[companion.id], idBack: true } }));
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
                      key={companionDocs[companion.id]?.idBack ? companionDocs[companion.id].idBack!.name : `empty-${companion.id}-idBack`}
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
                    {companionDocs[companion.id]?.idBack && (
                      <small style={{ color: '#1a8a4e', fontWeight: 600 }}>✓ {companionDocs[companion.id].idBack!.name}</small>
                    )}
                    {replacingDocs[companion.id]?.idBack && (
                      <button
                        type="button"
                        onClick={() => setReplacingDocs(prev => ({ ...prev, [companion.id]: { ...prev[companion.id], idBack: false } }))}
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
              {/* Pasaporte acompañante: SOLO internacional */}
              {!isInternalTrip && (
              <label className={requiredDocumentLabelClass(Boolean(companionDocs[companion.id]?.passport) || Boolean(companionCustomerDocuments[companion.id]?.passport))}>
                Pasaporte
                {companionCustomerDocuments[companion.id]?.passport && !replacingDocs[companion.id]?.passport ? (
                  <div style={{ position: 'relative', marginTop: '8px' }}>
                    <button
                      type="button"
                      onClick={() => setShowMenu(showMenu === `${companion.id}-passport` ? null : `${companion.id}-passport`)}
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
                    {showMenu === `${companion.id}-passport` && (
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
                            onViewDocument(companionCustomerDocuments[companion.id].customerId, companionCustomerDocuments[companion.id].passport!.id);
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
                            setReplacingDocs(prev => ({ ...prev, [companion.id]: { ...prev[companion.id], passport: true } }));
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
                      key={companionDocs[companion.id]?.passport ? companionDocs[companion.id].passport!.name : `empty-${companion.id}-passport`}
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
                    {companionDocs[companion.id]?.passport && (
                      <small style={{ color: '#1a8a4e', fontWeight: 600 }}>✓ {companionDocs[companion.id].passport!.name}</small>
                    )}
                    {replacingDocs[companion.id]?.passport && (
                      <button
                        type="button"
                        onClick={() => setReplacingDocs(prev => ({ ...prev, [companion.id]: { ...prev[companion.id], passport: false } }))}
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
          </article>
        ))}
      </div>

      {/* Minor Traveler Activation - Restored from previous implementation */}
      <div style={{ marginTop: '24px', padding: '16px', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
        <label className="check-inline" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={state.hasMinorCompanion}
            onChange={(event) => {
              const enabled = event.target.checked;
              setState((prev) => ({
                ...prev,
                hasMinorCompanion: enabled,
                minors: enabled ? prev.minors : [],
              }));
            }}
            style={{ cursor: 'pointer' }}
          />
          <span style={{ fontWeight: 600, color: '#1e293b' }}>¿Viajan menores de edad en este viaje?</span>
        </label>
        {state.hasMinorCompanion && (
          <p style={{ marginTop: '8px', marginBottom: 0, fontSize: '0.875rem', color: '#64748b' }}>
            Los datos de los menores se capturarán en el siguiente paso.
          </p>
        )}
      </div>

      {/* Customer Edit Modal */}
      {customerToEdit && (
        <CustomerEditModal
          isOpen={isEditModalOpen}
          customer={customerToEdit}
          onClose={() => {
            setIsEditModalOpen(false);
            setCustomerToEdit(null);
            setEditingCompanionId(null);
          }}
          onSave={handleSaveCustomerEdit}
        />
      )}
    </div>
  );
}
