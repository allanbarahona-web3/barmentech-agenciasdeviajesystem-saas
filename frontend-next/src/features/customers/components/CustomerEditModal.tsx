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

export function CustomerEditModal({ isOpen, customer, onClose, onSave, includePersonalDetails = false }: CustomerEditModalProps) {
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
