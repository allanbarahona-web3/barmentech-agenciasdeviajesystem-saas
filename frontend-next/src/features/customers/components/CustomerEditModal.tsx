'use client';

import { useState } from 'react';
import { CustomerForm } from './CustomerForm';
import {
  isClientIdentificationType,
  type ClientIdentificationType,
} from '@/features/customers/client-identification';

interface CustomerEditModalProps {
  isOpen: boolean;
  customer: {
    fullName: string;
    idNumber: string;
    idType: string | null;
    email: string | null;
    phone: string | null;
    emergencyContactName: string | null;
    emergencyContactPhone: string | null;
    createdAt: string;
    nationality: string | null;
    occupation: string | null;
    maritalStatus: string | null;
    address: string | null;
  };
  onClose: () => void;
  onSave: (formData: {
    fullName: string;
    idType: ClientIdentificationType;
    email: string;
    phone: string;
    maritalStatus: string;
    nationality: string;
    occupation: string;
    address: string;
    emergencyContactName: string;
    emergencyContactPhone: string;
  }) => Promise<void>;
}

type CustomerEditFormState = {
  fullName: string;
  idType: ClientIdentificationType | '';
  email: string;
  phone: string;
  maritalStatus: string;
  nationality: string;
  occupation: string;
  address: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
};

export function CustomerEditModal({ isOpen, customer, onClose, onSave }: CustomerEditModalProps) {
  const [editForm, setEditForm] = useState<CustomerEditFormState>({
    fullName: customer.fullName,
    idType: isClientIdentificationType(customer.idType) ? customer.idType : '',
    email: customer.email || '',
    phone: customer.phone || '',
    maritalStatus: customer.maritalStatus || '',
    nationality: customer.nationality || '',
    occupation: customer.occupation || '',
    address: customer.address || '',
    emergencyContactName: customer.emergencyContactName || '',
    emergencyContactPhone: customer.emergencyContactPhone || '',
  });

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleEditFormChange(updates: Partial<typeof editForm>) {
    setEditForm((prev) => ({ ...prev, ...updates }));
  }

  async function handleSave() {
    if (!isClientIdentificationType(editForm.idType)) {
      setError('Seleccione un tipo de identificación canónico');
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      await onSave({ ...editForm, idType: editForm.idType });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al actualizar cliente');
    } finally {
      setIsSaving(false);
    }
  }

  function handleClose() {
    if (isSaving) return;
    // Reset form to original values
    setEditForm({
      fullName: customer.fullName,
      idType: isClientIdentificationType(customer.idType) ? customer.idType : '',
      email: customer.email || '',
      phone: customer.phone || '',
      maritalStatus: customer.maritalStatus || '',
      nationality: customer.nationality || '',
      occupation: customer.occupation || '',
      address: customer.address || '',
      emergencyContactName: customer.emergencyContactName || '',
      emergencyContactPhone: customer.emergencyContactPhone || '',
    });
    setError(null);
    onClose();
  }

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 1000,
        padding: '20px',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div
        style={{
          background: 'white',
          borderRadius: '12px',
          maxWidth: '600px',
          width: '100%',
          maxHeight: '90vh',
          overflow: 'auto',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
        }}
      >
        <div
          style={{
            padding: '24px',
            borderBottom: '2px solid #e5e7eb',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <h2 style={{ fontSize: '24px', fontWeight: '700', color: '#1f2937' }}>
            ✏️ Editar Cliente
          </h2>
          <button
            onClick={handleClose}
            disabled={isSaving}
            style={{
              padding: '8px',
              background: 'transparent',
              color: '#6b7280',
              border: 'none',
              borderRadius: '6px',
              cursor: isSaving ? 'not-allowed' : 'pointer',
              fontSize: '24px',
              lineHeight: '1',
              transition: 'all 0.2s',
              opacity: isSaving ? 0.5 : 1,
            }}
            onMouseEnter={(e) => !isSaving && (e.currentTarget.style.background = '#f3f4f6')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            ×
          </button>
        </div>
        <div style={{ padding: '24px' }}>
          {error && (
            <div role="alert" style={{ marginBottom: '12px', color: '#991b1b' }}>
              {error}
            </div>
          )}
          <CustomerForm
            customer={customer}
            isEditMode={true}
            editForm={editForm}
            onEditFormChange={handleEditFormChange}
            onEnterEditMode={() => {}}
            onCancelEdit={handleClose}
            onSaveEdit={handleSave}
          />
        </div>
      </div>
    </div>
  );
}
