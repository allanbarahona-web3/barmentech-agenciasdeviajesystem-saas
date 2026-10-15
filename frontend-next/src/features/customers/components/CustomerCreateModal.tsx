'use client';

import { useEffect, useState } from 'react';
import { createCustomer, type CreateCustomerDto, type CustomerInfo } from '@/lib/customers-api';
import {
  CLIENT_IDENTIFICATION_OPTIONS,
  type ClientIdentificationType,
} from '@/features/customers/client-identification';
import { NATIONALITY_OPTIONS, MARITAL_STATUS_OPTIONS } from '@/features/contracts-form/constants';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { FormField } from '@/components/patterns/form-field';
import { FormSheet } from '@/components/patterns/form-sheet';
import {
  EMERGENCY_CONTACT_RELATIONSHIP_OPTIONS,
  EMERGENCY_CONTACT_RELATIONSHIP_OTHER,
  resolveEmergencyContactRelationship,
  type EmergencyContactRelationshipOption,
} from '@/features/customers/emergency-contact-relationship';
import {
  getDuplicateIdentificationErrorPresentation,
  type CustomerRequestErrorPresentation,
} from '@/features/customers/customer-request-error';

interface CustomerCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCustomerCreated?: (customer: CustomerInfo) => void;
  initialValues?: Pick<CreateCustomerDto, 'fullName' | 'email' | 'phone'>;
  onSubmitCustomer?: (customer: CreateCustomerDto) => Promise<void>;
  title?: string;
  description?: string;
  submitLabel?: string;
  includePersonalDetails?: boolean;
}

export function CustomerCreateModal({
  isOpen,
  onClose,
  onCustomerCreated,
  initialValues,
  onSubmitCustomer,
  title = 'Crear cliente',
  description = 'Registra la información de contacto y perfil del cliente.',
  submitLabel = 'Crear cliente',
  includePersonalDetails = false,
}: CustomerCreateModalProps) {
  const [formData, setFormData] = useState<CreateCustomerDto>(() => createCustomerForm(initialValues));
  const [relationshipOption, setRelationshipOption] = useState<EmergencyContactRelationshipOption>('');
  const [customRelationship, setCustomRelationship] = useState('');

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<CustomerRequestErrorPresentation | null>(null);

  useEffect(() => {
    if (isOpen) {
      setFormData(createCustomerForm(initialValues));
      setRelationshipOption('');
      setCustomRelationship('');
      setError(null);
    }
  }, [isOpen, initialValues?.email, initialValues?.fullName, initialValues?.phone]);

  function handleChange(field: keyof CreateCustomerDto, value: string) {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setError(null);
  }

  function handleClose() {
    if (isSaving) return;
    resetAndClose();
  }

  function resetAndClose() {
    setFormData(createCustomerForm());
    setRelationshipOption('');
    setCustomRelationship('');
    setError(null);
    onClose();
  }

  async function handleSave() {
    // Validation
    if (!formData.fullName.trim()) {
      setError({ title: 'No se pudo crear el cliente', message: 'El nombre completo es requerido' });
      return;
    }
    if (!formData.idNumber.trim()) {
      setError({ title: 'No se pudo crear el cliente', message: 'El número de identificación es requerido' });
      return;
    }
    if (!formData.idType) {
      setError({ title: 'No se pudo crear el cliente', message: 'El tipo de identificación es requerido' });
      return;
    }
    if (!formData.email.trim()) {
      setError({ title: 'No se pudo crear el cliente', message: 'El email es requerido' });
      return;
    }
    const emergencyContactRelationship = resolveEmergencyContactRelationship({
      option: relationshipOption,
      customValue: customRelationship,
    });
    if (includePersonalDetails && relationshipOption === EMERGENCY_CONTACT_RELATIONSHIP_OTHER && !emergencyContactRelationship) {
      setError({ title: 'No se pudo crear el cliente', message: 'Especifique parentesco para el contacto de emergencia' });
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const { dateOfBirth, emergencyContactRelationship: _emergencyContactRelationship, ...customerFormData } = formData;
      const customerInput: CreateCustomerDto = {
        ...customerFormData,
        idNumber: formData.idNumber.trim(),
        ...(includePersonalDetails
          ? {
              dateOfBirth: dateOfBirth || undefined,
              emergencyContactRelationship: emergencyContactRelationship || undefined,
            }
          : {}),
      };
      if (onSubmitCustomer) {
        await onSubmitCustomer(customerInput);
      } else {
        const createdCustomer = await createCustomer(customerInput);
        onCustomerCreated?.(createdCustomer);
      }
      resetAndClose();
    } catch (err) {
      const genericError = {
        title: 'No se pudo crear el cliente',
        message: err instanceof Error ? err.message : 'Error al crear cliente',
      };
      setError(includePersonalDetails ? getDuplicateIdentificationErrorPresentation(err) ?? genericError : genericError);
    } finally {
      setIsSaving(false);
    }
  }

  if (!isOpen) return null;


  return (
      <FormSheet
        open={isOpen}
        onOpenChange={(open) => {
          if (!open) handleClose();
        }}
        title={title}
        description={description}
        actions={
          <>
            <Button type="button" variant="outline" onClick={handleClose} disabled={isSaving}>Cancelar</Button>
            <Button type="button" onClick={() => void handleSave()} disabled={isSaving}>
              {isSaving ? 'Guardando…' : submitLabel}
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {error ? (
            <Alert variant="destructive" className="sm:col-span-2">
              <AlertTitle>{error.title}</AlertTitle>
              <AlertDescription><p>{error.message}</p>{error.guidance ? <p className="mt-1">{error.guidance}</p> : null}</AlertDescription>
            </Alert>
          ) : null}
          <FormField className="sm:col-span-2" htmlFor="customer-create-full-name" label="Nombre completo" required>
            <Input id="customer-create-full-name" value={formData.fullName} onChange={(event) => handleChange('fullName', event.target.value)} disabled={isSaving} />
          </FormField>
          <FormField htmlFor="customer-create-id-type" label="Tipo de identificación" required>
            <Select id="customer-create-id-type" value={formData.idType} onChange={(event) => handleChange('idType', event.target.value as ClientIdentificationType)} disabled={isSaving}>
              {CLIENT_IDENTIFICATION_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </Select>
          </FormField>
          <FormField htmlFor="customer-create-id-number" label="Cédula/ID" required>
            <Input id="customer-create-id-number" value={formData.idNumber} onChange={(event) => handleChange('idNumber', event.target.value)} disabled={isSaving} placeholder="Número de identificación" />
          </FormField>
          <FormField className="sm:col-span-2" htmlFor="customer-create-email" label="Email" required>
            <Input id="customer-create-email" type="email" value={formData.email} onChange={(event) => handleChange('email', event.target.value)} disabled={isSaving} />
          </FormField>
          <FormField htmlFor="customer-create-phone" label="Teléfono">
            <Input id="customer-create-phone" value={formData.phone || ''} onChange={(event) => handleChange('phone', event.target.value)} disabled={isSaving} />
          </FormField>
          {includePersonalDetails ? (
            <FormField htmlFor="customer-create-date-of-birth" label="Fecha de nacimiento">
              <Input id="customer-create-date-of-birth" type="date" value={formData.dateOfBirth || ''} onChange={(event) => handleChange('dateOfBirth', event.target.value)} disabled={isSaving} />
            </FormField>
          ) : null}
          <FormField htmlFor="customer-create-occupation" label="Ocupación">
            <Input id="customer-create-occupation" value={formData.occupation || ''} onChange={(event) => handleChange('occupation', event.target.value)} disabled={isSaving} />
          </FormField>
          <FormField htmlFor="customer-create-emergency-name" label="Contacto de emergencia — nombre">
            <Input id="customer-create-emergency-name" value={formData.emergencyContactName || ''} onChange={(event) => handleChange('emergencyContactName', event.target.value)} disabled={isSaving} />
          </FormField>
          <FormField htmlFor="customer-create-emergency-phone" label="Contacto de emergencia — teléfono">
            <Input id="customer-create-emergency-phone" value={formData.emergencyContactPhone || ''} onChange={(event) => handleChange('emergencyContactPhone', event.target.value)} disabled={isSaving} />
          </FormField>
          {includePersonalDetails ? (
            <div className="grid gap-2">
                <FormField htmlFor="customer-create-emergency-relationship" label="Parentesco">
                  <Select id="customer-create-emergency-relationship" value={relationshipOption} onChange={(event) => { setRelationshipOption(event.target.value as EmergencyContactRelationshipOption); setCustomRelationship(''); setError(null); }} disabled={isSaving}>
                    <option value="">Seleccionar…</option>
                    {EMERGENCY_CONTACT_RELATIONSHIP_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                  </Select>
                </FormField>
                {relationshipOption === EMERGENCY_CONTACT_RELATIONSHIP_OTHER ? (
                  <FormField htmlFor="customer-create-emergency-relationship-custom" label="Especifique parentesco">
                    <Input id="customer-create-emergency-relationship-custom" maxLength={100} value={customRelationship} onChange={(event) => { setCustomRelationship(event.target.value); setError(null); }} disabled={isSaving} />
                  </FormField>
                ) : null}
            </div>
          ) : null}
          <FormField htmlFor="customer-create-nationality" label="Nacionalidad">
            <Select id="customer-create-nationality" value={formData.nationality || ''} onChange={(event) => handleChange('nationality', event.target.value)} disabled={isSaving}>
              <option value="">Seleccionar…</option>
              {NATIONALITY_OPTIONS.map((nationality, index) => <option key={index} value={nationality} disabled={nationality === '──────────'}>{nationality}</option>)}
            </Select>
          </FormField>
          <FormField htmlFor="customer-create-marital-status" label="Estado civil">
            <Select id="customer-create-marital-status" value={formData.maritalStatus || ''} onChange={(event) => handleChange('maritalStatus', event.target.value)} disabled={isSaving}>
              <option value="">Seleccionar…</option>
              {MARITAL_STATUS_OPTIONS.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
            </Select>
          </FormField>
          <FormField className="sm:col-span-2" htmlFor="customer-create-address" label="Dirección">
            <Input id="customer-create-address" value={formData.address || ''} onChange={(event) => handleChange('address', event.target.value)} disabled={isSaving} />
          </FormField>
        </div>
      </FormSheet>
  );
}

function createCustomerForm(initialValues?: Pick<CreateCustomerDto, 'fullName' | 'email' | 'phone'>): CreateCustomerDto {
  return {
    fullName: initialValues?.fullName ?? '',
    idNumber: '',
    idType: 'CEDULA_FISICA',
    email: initialValues?.email ?? '',
    phone: initialValues?.phone ?? '',
    emergencyContactName: '',
    emergencyContactPhone: '',
    emergencyContactRelationship: '',
    dateOfBirth: '',
    nationality: '',
    occupation: '',
    maritalStatus: '',
    address: '',
  };
}
