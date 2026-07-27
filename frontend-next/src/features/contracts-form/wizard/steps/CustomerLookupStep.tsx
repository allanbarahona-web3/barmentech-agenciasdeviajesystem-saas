'use client';

import { useState } from 'react';
import type { ContractFormState } from '@/features/contracts-form/types';
import { CustomerCreateModal } from '@/features/customers/components/CustomerCreateModal';
import { CustomerEditModal } from '@/features/customers/components/CustomerEditModal';
import { CustomerSearchSelector } from '@/features/customers/components/CustomerSearchSelector';
import {
  getCustomerProfile,
  updateCustomer,
  type CustomerInfo,
  type CustomerListItem,
} from '@/lib/customers-api';

export interface CustomerLookupStepProps {
  state: ContractFormState;
  setState: React.Dispatch<React.SetStateAction<ContractFormState>>;
}

function holderActionButtonStyle(background = 'transparent') {
  return {
    padding: '6px 14px',
    background,
    color: background === 'transparent' ? '#166534' : 'white',
    border: background === 'transparent' ? '1px solid #86efac' : 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 600,
  } as const;
}

export function CustomerLookupStep({
  setState,
}: CustomerLookupStepProps) {
  const [selectedCustomer, setSelectedCustomer] =
    useState<CustomerListItem | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [customerToEdit, setCustomerToEdit] = useState<CustomerInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  function selectCustomer(customer: CustomerListItem) {
    setSelectedCustomer(customer);
    setState((previous) => ({
      ...previous,
      selectedCustomerId: customer.id,
    }));
  }

  function clearSelection() {
    setSelectedCustomer(null);
    setState((previous) => ({
      ...previous,
      selectedCustomerId: null,
    }));
  }

  function handleCustomerCreated(customer: CustomerInfo) {
    selectCustomer({
      id: customer.id,
      fullName: customer.fullName,
      idNumber: customer.idNumber,
      email: customer.email,
      phone: customer.phone,
      createdAt: customer.createdAt,
    });
    setIsCreateModalOpen(false);
  }

  async function handleEditCustomer() {
    if (!selectedCustomer) return;
    setError(null);
    try {
      const profile = await getCustomerProfile(selectedCustomer.id);
      setCustomerToEdit(profile.customer);
      setIsEditModalOpen(true);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Error al cargar cliente',
      );
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

    const updatedProfile = await updateCustomer(selectedCustomer.id, formData);
    const customer = updatedProfile.customer;
    setSelectedCustomer((current) =>
      current
        ? {
            ...current,
            fullName: customer.fullName,
            email: customer.email,
            phone: customer.phone,
          }
        : current,
    );
    setState((previous) => ({
      ...previous,
      clientFullName: customer.fullName,
      clientIdType: (customer.idType || 'Cedula') as
        | 'Cedula'
        | 'Pasaporte'
        | 'DIMEX',
      clientIdNumber: customer.idNumber,
      clientEmail: customer.email || '',
      clientPhone: customer.phone || '',
      clientAddress: customer.address || '',
      emergencyContactName: customer.emergencyContactName || '',
      emergencyContactPhone: customer.emergencyContactPhone || '',
      civilStatus: (customer.maritalStatus || 'Soltero') as
        | 'Soltero'
        | 'Casado'
        | 'Divorciado'
        | 'Viudo',
      profession: customer.occupation || '',
      clientNationality: customer.nationality || 'Costa Rica',
    }));
    setIsEditModalOpen(false);
    setCustomerToEdit(null);
  }

  return (
    <div className="form-section-card">
      <h2 className="section-title">Buscar Cliente</h2>
      {error && (
        <div
          role="alert"
          style={{
            padding: '12px',
            background: '#fee2e2',
            color: '#991b1b',
            borderRadius: '8px',
            marginBottom: '16px',
          }}
        >
          {error}
        </div>
      )}
      <CustomerSearchSelector
        selectedCustomer={selectedCustomer}
        onSelect={selectCustomer}
        onClear={clearSelection}
        onEdit={() => void handleEditCustomer()}
        onCreateRequested={() => setIsCreateModalOpen(true)}
        description="Busque un cliente existente por número de identificación o continúe al siguiente paso para crear un nuevo cliente."
        renderSelectedCustomer={(customer, actions) => (
          <div
            style={{
              padding: '16px',
              background: '#f0fdf4',
              border: '2px solid #86efac',
              borderRadius: '12px',
              marginBottom: '16px',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'start',
                gap: '12px',
                marginBottom: '12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '20px' }}>✅</span>
                <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#166534' }}>
                  Cliente Seleccionado
                </h3>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                {actions.edit && (
                  <button
                    type="button"
                    onClick={actions.edit}
                    style={holderActionButtonStyle()}
                  >
                    ✏️ Editar
                  </button>
                )}
                <button
                  type="button"
                  onClick={actions.clear}
                  style={holderActionButtonStyle()}
                >
                  Cambiar
                </button>
              </div>
            </div>
            <div style={{ display: 'grid', gap: '8px', color: '#15803d' }}>
              <div><strong>Nombre:</strong> {customer.fullName}</div>
              <div><strong>Cédula:</strong> {customer.idNumber}</div>
              <div><strong>Email:</strong> {customer.email || '—'}</div>
              {customer.phone && (
                <div><strong>Teléfono:</strong> {customer.phone}</div>
              )}
            </div>
          </div>
        )}
        renderResultsHeader={(count) => (
          <h3
            style={{
              fontSize: '16px',
              fontWeight: 600,
              color: '#374151',
              marginBottom: '12px',
            }}
          >
            Resultados de Búsqueda ({count})
          </h3>
        )}
        renderResult={(customer, select) => (
          <div
            role="button"
            tabIndex={0}
            onClick={select}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') select();
            }}
            style={{
              padding: '16px',
              background: 'white',
              border: '2px solid #e5e7eb',
              borderRadius: '12px',
              cursor: 'pointer',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'start',
                gap: '16px',
              }}
            >
              <div>
                <h4 style={{ fontSize: '16px', color: '#1f2937', marginBottom: '8px' }}>
                  {customer.fullName}
                </h4>
                <div style={{ display: 'grid', gap: '4px', color: '#6b7280' }}>
                  <div><strong>Cédula:</strong> {customer.idNumber}</div>
                  <div><strong>Email:</strong> {customer.email || '—'}</div>
                  {customer.phone && (
                    <div><strong>Teléfono:</strong> {customer.phone}</div>
                  )}
                </div>
              </div>
              <span style={holderActionButtonStyle('#667eea')}>Seleccionar</span>
            </div>
          </div>
        )}
        renderEmptyState={(query, create) => (
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
            <h3 style={{ fontSize: '18px', color: '#92400e', marginBottom: '8px' }}>
              No se encontró ningún cliente
            </h3>
            <p style={{ color: '#b45309', fontSize: '14px' }}>
              No existe un cliente con el número de identificación “{query}”.
            </p>
            {create && (
              <button
                type="button"
                onClick={create}
                style={{ ...holderActionButtonStyle('#10b981'), marginTop: '16px' }}
              >
                ➕ Crear Nuevo Cliente
              </button>
            )}
          </div>
        )}
        renderInitialState={(create) => (
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
            <h3 style={{ fontSize: '18px', color: '#374151', marginBottom: '8px' }}>
              Buscar Cliente Existente
            </h3>
            <p style={{ color: '#6b7280', fontSize: '14px', lineHeight: 1.5 }}>
              Ingrese el número de identificación del cliente para buscar en la
              base de datos. Si el cliente ya existe, puede seleccionarlo para
              continuar.
            </p>
            {create && (
              <button
                type="button"
                onClick={create}
                style={{ ...holderActionButtonStyle('#667eea'), marginTop: '16px' }}
              >
                ➕ Crear Nuevo Cliente
              </button>
            )}
          </div>
        )}
      />

      <CustomerCreateModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCustomerCreated={handleCustomerCreated}
      />
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
