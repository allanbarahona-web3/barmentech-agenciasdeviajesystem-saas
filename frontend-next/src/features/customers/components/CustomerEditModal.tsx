'use client';

import { useState } from 'react';
import { CustomerForm } from './CustomerForm';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { FormSheet } from '@/components/patterns/form-sheet';
import {
  isClientIdentificationType,
  type ClientIdentificationType,
} from '@/features/customers/client-identification';
import {
  EMERGENCY_CONTACT_RELATIONSHIP_OTHER,
  getEmergencyContactRelationshipFormValue,
  resolveEmergencyContactRelationship,
} from '@/features/customers/emergency-contact-relationship';
import {
  getDuplicateIdentificationErrorPresentation,
  type CustomerRequestErrorPresentation,
} from '@/features/customers/customer-request-error';

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
    emergencyContactRelationship: string | null;
    dateOfBirth: string | null;
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
    emergencyContactRelationship?: string | null;
    dateOfBirth?: string | null;
  }) => Promise<void>;
  presentation?: 'legacy' | 'foundation';
  includePersonalDetails?: boolean;
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
  emergencyContactRelationshipOption: ReturnType<typeof getEmergencyContactRelationshipFormValue>['option'];
  emergencyContactRelationshipCustom: string;
  dateOfBirth: string;
};

export function CustomerEditModal({ isOpen, customer, onClose, onSave, presentation = 'legacy', includePersonalDetails = false }: CustomerEditModalProps) {
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
    emergencyContactRelationshipOption: getEmergencyContactRelationshipFormValue(customer.emergencyContactRelationship).option,
    emergencyContactRelationshipCustom: getEmergencyContactRelationshipFormValue(customer.emergencyContactRelationship).customValue,
    dateOfBirth: customer.dateOfBirth || '',
  });

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<CustomerRequestErrorPresentation | null>(null);

  function handleEditFormChange(updates: Partial<typeof editForm>) {
    setEditForm((prev) => ({ ...prev, ...updates }));
  }

  async function handleSave() {
    if (!isClientIdentificationType(editForm.idType)) {
      setError({ title: 'No se pudo actualizar el cliente', message: 'Seleccione un tipo de identificación canónico' });
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      const { dateOfBirth, emergencyContactRelationshipOption, emergencyContactRelationshipCustom, ...customerFormData } = editForm;
      const emergencyContactRelationship = resolveEmergencyContactRelationship({
        option: emergencyContactRelationshipOption,
        customValue: emergencyContactRelationshipCustom,
      });
      if (includePersonalDetails && emergencyContactRelationshipOption === EMERGENCY_CONTACT_RELATIONSHIP_OTHER && !emergencyContactRelationship) {
        setError({ title: 'No se pudo actualizar el cliente', message: 'Especifique parentesco para el contacto de emergencia' });
        return;
      }
      await onSave({
        ...customerFormData,
        idType: editForm.idType,
        ...(includePersonalDetails
          ? {
              dateOfBirth: dateOfBirth || null,
              emergencyContactRelationship,
            }
          : {}),
      });
      onClose();
    } catch (err) {
      const genericError = {
        title: 'No se pudo actualizar el cliente',
        message: err instanceof Error ? err.message : 'Error al actualizar cliente',
      };
      setError(includePersonalDetails ? getDuplicateIdentificationErrorPresentation(err) ?? genericError : genericError);
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
      emergencyContactRelationshipOption: getEmergencyContactRelationshipFormValue(customer.emergencyContactRelationship).option,
      emergencyContactRelationshipCustom: getEmergencyContactRelationshipFormValue(customer.emergencyContactRelationship).customValue,
      dateOfBirth: customer.dateOfBirth || '',
    });
    setError(null);
    onClose();
  }

  if (!isOpen) return null;

  if (presentation === 'foundation') {
    return (
      <FormSheet
        open={isOpen}
        onOpenChange={(open) => {
          if (!open) handleClose();
        }}
        title="Editar cliente"
        description="Actualiza la información de contacto y perfil del cliente."
        actions={
          <>
            <Button type="button" variant="outline" onClick={handleClose} disabled={isSaving}>Cancelar</Button>
            <Button type="button" onClick={() => void handleSave()} disabled={isSaving}>
              {isSaving ? 'Guardando…' : 'Guardar cambios'}
            </Button>
          </>
        }
      >
        {error ? (
          <Alert variant="destructive" className="mb-4">
            <AlertTitle>{error.title}</AlertTitle>
            <AlertDescription><p>{error.message}</p>{error.guidance ? <p className="mt-1">{error.guidance}</p> : null}</AlertDescription>
          </Alert>
        ) : null}
        <CustomerForm
          customer={customer}
          isEditMode={true}
          presentation="foundation"
          editForm={editForm}
          onEditFormChange={handleEditFormChange}
          onEnterEditMode={() => {}}
          onCancelEdit={handleClose}
          onSaveEdit={handleSave}
          includePersonalDetails={includePersonalDetails}
        />
      </FormSheet>
    );
  }

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
              {error.message}
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
            includePersonalDetails={includePersonalDetails}
          />
        </div>
      </div>
    </div>
  );
}
