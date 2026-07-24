'use client';

import { useState } from 'react';
import type { ContractFormState } from "@/features/contracts-form/types";
import { getCustomers, getCustomerProfile, updateCustomer, type CustomerListItem, type CustomerInfo } from '@/lib/customers-api';
import { CustomerCreateModal } from '@/features/customers/components/CustomerCreateModal';
import { CustomerEditModal } from '@/features/customers/components/CustomerEditModal';

export interface CustomerLookupStepProps {
  state: ContractFormState;
  setState: React.Dispatch<React.SetStateAction<ContractFormState>>;
}

/**
 * CustomerLookupStep - Customer Search and Selection
 * 
 * Allows agents to search for existing customers by identification number.
 * When a customer is found, displays their information and allows selection.
 * Selected customer is stored in wizard state for potential pre-fill in Holder step.
 */
export function CustomerLookupStep({
  state,
  setState,
}: CustomerLookupStepProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<CustomerListItem[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [customerToEdit, setCustomerToEdit] = useState<CustomerInfo | null>(null);

  async function handleSearch() {
    if (!searchQuery.trim()) {
      setError('Por favor ingrese un número de identificación');
      return;
    }

    setSearching(true);
    setError(null);
    setHasSearched(true);

    try {
      const response = await getCustomers({ search: searchQuery.trim(), pageSize: 10 });
      setSearchResults(response.customers);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error al buscar clientes';
      setError(errorMessage);
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }

  function handleSelectCustomer(customer: CustomerListItem) {
    setState((prev) => ({
      ...prev,
      selectedCustomerId: customer.id,
    }));
  }

  function handleClearSelection() {
    setState((prev) => ({
      ...prev,
      selectedCustomerId: null,
    }));
  }

  function handleCustomerCreated(customer: CustomerInfo) {
    // Convert CustomerInfo to CustomerListItem format
    const newCustomerListItem: CustomerListItem = {
      id: customer.id,
      fullName: customer.fullName,
      idNumber: customer.idNumber,
      email: customer.email,
      phone: customer.phone,
      createdAt: customer.createdAt,
    };

    // Add to search results
    setSearchResults((prev) => [newCustomerListItem, ...prev]);

    // Select the new customer
    setState((prev) => ({
      ...prev,
      selectedCustomerId: customer.id,
    }));

    // Close modal
    setIsCreateModalOpen(false);
  }

  async function handleEditCustomer() {
    if (!selectedCustomer) return;

    try {
      // Fetch full customer profile to get all fields including emergency contacts
      const profile = await getCustomerProfile(selectedCustomer.id);
      setCustomerToEdit(profile.customer);
      setIsEditModalOpen(true);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error al cargar cliente';
      setError(errorMessage);
    }
  }

  async function handleSaveCustomer(formData: {
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
    if (!selectedCustomer) return;

    try {
      // Update customer via API
      const updatedProfile = await updateCustomer(selectedCustomer.id, formData);
      const updatedCustomer = updatedProfile.customer;

      // Update search results with new data
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

      // Directly update holder fields with the updated customer data
      setState((prev) => ({
        ...prev,
        clientFullName: updatedCustomer.fullName,
        clientIdType: (updatedCustomer.idType || 'Cedula') as 'Cedula' | 'Pasaporte' | 'DIMEX',
        clientIdNumber: updatedCustomer.idNumber,
        clientEmail: updatedCustomer.email,
        clientPhone: updatedCustomer.phone || '',
        clientAddress: updatedCustomer.address || '',
        emergencyContactName: updatedCustomer.emergencyContactName || '',
        emergencyContactPhone: updatedCustomer.emergencyContactPhone || '',
        civilStatus: (updatedCustomer.maritalStatus || 'Soltero') as 'Soltero' | 'Casado' | 'Divorciado' | 'Viudo',
        profession: updatedCustomer.occupation || '',
        clientNationality: updatedCustomer.nationality || 'Costa Rica',
      }));

      setIsEditModalOpen(false);
      setCustomerToEdit(null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error al actualizar cliente';
      throw new Error(errorMessage);
    }
  }

  const selectedCustomer = searchResults.find(c => c.id === state.selectedCustomerId);

  return (
    <div className="form-section-card">
      <h2 className="section-title">Buscar Cliente</h2>
      
      <div style={{ marginBottom: '24px' }}>
        <p style={{ color: '#6b7280', fontSize: '14px', marginBottom: '16px' }}>
          Busque un cliente existente por número de identificación o continúe al siguiente paso para crear un nuevo cliente.
        </p>

        {/* Search Input */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleSearch();
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
            onClick={handleSearch}
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
        {error && (
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
            {error}
          </div>
        )}

        {/* Selected Customer Display */}
        {selectedCustomer && (
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
                  Cliente Seleccionado
                </h3>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={handleEditCustomer}
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
                <strong>Nombre:</strong> {selectedCustomer.fullName}
              </div>
              <div style={{ fontSize: '14px', color: '#15803d' }}>
                <strong>Cédula:</strong> {selectedCustomer.idNumber}
              </div>
              <div style={{ fontSize: '14px', color: '#15803d' }}>
                <strong>Email:</strong> {selectedCustomer.email}
              </div>
              {selectedCustomer.phone && (
                <div style={{ fontSize: '14px', color: '#15803d' }}>
                  <strong>Teléfono:</strong> {selectedCustomer.phone}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Search Results */}
        {hasSearched && !selectedCustomer && searchResults.length > 0 && (
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
                  onClick={() => handleSelectCustomer(customer)}
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
        {hasSearched && !selectedCustomer && searchResults.length === 0 && !searching && !error && (
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
              No se encontró ningún cliente
            </h3>
            <p style={{ color: '#b45309', fontSize: '14px', maxWidth: '500px', margin: '0 auto 16px' }}>
              No existe un cliente con el número de identificación "{searchQuery}".
            </p>
            <button
              onClick={() => setIsCreateModalOpen(true)}
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
              ➕ Crear Nuevo Cliente
            </button>
          </div>
        )}

        {/* Initial State */}
        {!hasSearched && !selectedCustomer && (
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
              Buscar Cliente Existente
            </h3>
            <p style={{ color: '#6b7280', fontSize: '14px', maxWidth: '500px', margin: '0 auto 16px' }}>
              Ingrese el número de identificación del cliente para buscar en la base de datos.
              Si el cliente ya existe, puede seleccionarlo para continuar.
            </p>
            <button
              onClick={() => setIsCreateModalOpen(true)}
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
              ➕ Crear Nuevo Cliente
            </button>
          </div>
        )}
      </div>

      {/* Customer Create Modal */}
      <CustomerCreateModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCustomerCreated={handleCustomerCreated}
      />

      {/* Customer Edit Modal */}
      {customerToEdit && (
        <CustomerEditModal
          isOpen={isEditModalOpen}
          customer={customerToEdit}
          onClose={() => {
            setIsEditModalOpen(false);
            setCustomerToEdit(null);
          }}
          onSave={handleSaveCustomer}
        />
      )}
    </div>
  );
}
