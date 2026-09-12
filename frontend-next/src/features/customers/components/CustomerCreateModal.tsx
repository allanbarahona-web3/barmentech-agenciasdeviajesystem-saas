'use client';

import { useState } from 'react';
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

interface CustomerCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCustomerCreated: (customer: CustomerInfo) => void;
  presentation?: 'legacy' | 'foundation';
}

export function CustomerCreateModal({ isOpen, onClose, onCustomerCreated, presentation = 'legacy' }: CustomerCreateModalProps) {
  const [formData, setFormData] = useState<CreateCustomerDto>({
    fullName: '',
    idNumber: '',
    idType: 'CEDULA_FISICA',
    email: '',
    phone: '',
    emergencyContactName: '',
    emergencyContactPhone: '',
    nationality: '',
    occupation: '',
    maritalStatus: '',
    address: '',
  });

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleChange(field: keyof CreateCustomerDto, value: string) {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setError(null);
  }

  function handleClose() {
    if (isSaving) return;
    // Reset form
    setFormData({
      fullName: '',
      idNumber: '',
      idType: 'CEDULA_FISICA',
      email: '',
      phone: '',
      emergencyContactName: '',
      emergencyContactPhone: '',
      nationality: '',
      occupation: '',
      maritalStatus: '',
      address: '',
    });
    setError(null);
    onClose();
  }

  async function handleSave() {
    // Validation
    if (!formData.fullName.trim()) {
      setError('El nombre completo es requerido');
      return;
    }
    if (!formData.idNumber.trim()) {
      setError('El número de identificación es requerido');
      return;
    }
    if (!formData.idType) {
      setError('El tipo de identificación es requerido');
      return;
    }
    if (!formData.email.trim()) {
      setError('El email es requerido');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const createdCustomer = await createCustomer({
        ...formData,
        idNumber: formData.idNumber.trim(),
      });
      onCustomerCreated(createdCustomer);
      handleClose();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error al crear cliente';
      setError(errorMessage);
    } finally {
      setIsSaving(false);
    }
  }

  if (!isOpen) return null;

  if (presentation === 'foundation') {
    return (
      <FormSheet
        open={isOpen}
        onOpenChange={(open) => {
          if (!open) handleClose();
        }}
        title="Crear cliente"
        description="Registra la información de contacto y perfil del cliente."
        actions={
          <>
            <Button type="button" variant="outline" onClick={handleClose} disabled={isSaving}>Cancelar</Button>
            <Button type="button" onClick={() => void handleSave()} disabled={isSaving}>
              {isSaving ? 'Guardando…' : 'Crear cliente'}
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {error ? (
            <Alert variant="destructive" className="sm:col-span-2">
              <AlertTitle>No se pudo crear el cliente</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
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
          <FormField htmlFor="customer-create-occupation" label="Ocupación">
            <Input id="customer-create-occupation" value={formData.occupation || ''} onChange={(event) => handleChange('occupation', event.target.value)} disabled={isSaving} />
          </FormField>
          <FormField htmlFor="customer-create-emergency-name" label="Contacto de emergencia — nombre">
            <Input id="customer-create-emergency-name" value={formData.emergencyContactName || ''} onChange={(event) => handleChange('emergencyContactName', event.target.value)} disabled={isSaving} />
          </FormField>
          <FormField htmlFor="customer-create-emergency-phone" label="Contacto de emergencia — teléfono">
            <Input id="customer-create-emergency-phone" value={formData.emergencyContactPhone || ''} onChange={(event) => handleChange('emergencyContactPhone', event.target.value)} disabled={isSaving} />
          </FormField>
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
        {/* Header */}
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
            ➕ Crear Cliente
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

        {/* Form */}
        <div style={{ padding: '24px' }}>
          <div style={{ background: 'white', borderRadius: '12px', padding: '24px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Full Name */}
              <div>
                <div style={{ fontSize: '12px', fontWeight: '600', color: '#6b7280', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Nombre Completo *
                </div>
                <input
                  type="text"
                  value={formData.fullName}
                  onChange={(e) => handleChange('fullName', e.target.value)}
                  disabled={isSaving}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '2px solid #e5e7eb',
                    borderRadius: '6px',
                    fontSize: '15px',
                    color: '#1f2937',
                    fontWeight: '500',
                    transition: 'border-color 0.2s',
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = '#667eea')}
                  onBlur={(e) => (e.currentTarget.style.borderColor = '#e5e7eb')}
                />
              </div>

              {/* ID Type */}
              <div>
                <div style={{ fontSize: '12px', fontWeight: '600', color: '#6b7280', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Tipo de Identificación *
                </div>
                <select
                  value={formData.idType}
                  onChange={(e) =>
                    handleChange(
                      'idType',
                      e.target.value as ClientIdentificationType,
                    )
                  }
                  disabled={isSaving}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '2px solid #e5e7eb',
                    borderRadius: '6px',
                    fontSize: '15px',
                    color: '#1f2937',
                    fontWeight: '500',
                    transition: 'border-color 0.2s',
                    background: 'white',
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = '#667eea')}
                  onBlur={(e) => (e.currentTarget.style.borderColor = '#e5e7eb')}
                >
                  {CLIENT_IDENTIFICATION_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* ID Number */}
              <div>
                <div style={{ fontSize: '12px', fontWeight: '600', color: '#6b7280', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Cédula/ID *
                </div>
                <input
                  type="text"
                  value={formData.idNumber}
                  onChange={(e) => handleChange('idNumber', e.target.value)}
                  disabled={isSaving}
                  placeholder="Número de identificación"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '2px solid #e5e7eb',
                    borderRadius: '6px',
                    fontSize: '15px',
                    color: '#1f2937',
                    fontWeight: '500',
                    transition: 'border-color 0.2s',
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = '#667eea')}
                  onBlur={(e) => (e.currentTarget.style.borderColor = '#e5e7eb')}
                />
              </div>

              {/* Email */}
              <div>
                <div style={{ fontSize: '12px', fontWeight: '600', color: '#6b7280', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Email *
                </div>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleChange('email', e.target.value)}
                  disabled={isSaving}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '2px solid #e5e7eb',
                    borderRadius: '6px',
                    fontSize: '15px',
                    color: '#1f2937',
                    transition: 'border-color 0.2s',
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = '#667eea')}
                  onBlur={(e) => (e.currentTarget.style.borderColor = '#e5e7eb')}
                />
              </div>

              {/* Phone */}
              <div>
                <div style={{ fontSize: '12px', fontWeight: '600', color: '#6b7280', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Teléfono
                </div>
                <input
                  type="text"
                  value={formData.phone || ''}
                  onChange={(e) => handleChange('phone', e.target.value)}
                  disabled={isSaving}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '2px solid #e5e7eb',
                    borderRadius: '6px',
                    fontSize: '15px',
                    color: '#1f2937',
                    transition: 'border-color 0.2s',
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = '#667eea')}
                  onBlur={(e) => (e.currentTarget.style.borderColor = '#e5e7eb')}
                />
              </div>

              {/* Emergency Contact Name */}
              <div>
                <div style={{ fontSize: '12px', fontWeight: '600', color: '#6b7280', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Contacto de Emergencia - Nombre
                </div>
                <input
                  type="text"
                  value={formData.emergencyContactName || ''}
                  onChange={(e) => handleChange('emergencyContactName', e.target.value)}
                  disabled={isSaving}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '2px solid #e5e7eb',
                    borderRadius: '6px',
                    fontSize: '15px',
                    color: '#1f2937',
                    transition: 'border-color 0.2s',
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = '#667eea')}
                  onBlur={(e) => (e.currentTarget.style.borderColor = '#e5e7eb')}
                />
              </div>

              {/* Emergency Contact Phone */}
              <div>
                <div style={{ fontSize: '12px', fontWeight: '600', color: '#6b7280', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Contacto de Emergencia - Teléfono
                </div>
                <input
                  type="text"
                  value={formData.emergencyContactPhone || ''}
                  onChange={(e) => handleChange('emergencyContactPhone', e.target.value)}
                  disabled={isSaving}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '2px solid #e5e7eb',
                    borderRadius: '6px',
                    fontSize: '15px',
                    color: '#1f2937',
                    transition: 'border-color 0.2s',
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = '#667eea')}
                  onBlur={(e) => (e.currentTarget.style.borderColor = '#e5e7eb')}
                />
              </div>

              {/* Nationality */}
              <div>
                <div style={{ fontSize: '12px', fontWeight: '600', color: '#6b7280', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Nacionalidad
                </div>
                <select
                  value={formData.nationality || ''}
                  onChange={(e) => handleChange('nationality', e.target.value)}
                  disabled={isSaving}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '2px solid #e5e7eb',
                    borderRadius: '6px',
                    fontSize: '15px',
                    color: '#1f2937',
                    fontWeight: '500',
                    transition: 'border-color 0.2s',
                    background: 'white',
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = '#667eea')}
                  onBlur={(e) => (e.currentTarget.style.borderColor = '#e5e7eb')}
                >
                  <option value="">Seleccionar...</option>
                  {NATIONALITY_OPTIONS.map((nat, idx) => (
                    <option key={idx} value={nat} disabled={nat === '──────────'}>
                      {nat}
                    </option>
                  ))}
                </select>
              </div>

              {/* Occupation */}
              <div>
                <div style={{ fontSize: '12px', fontWeight: '600', color: '#6b7280', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Ocupación
                </div>
                <input
                  type="text"
                  value={formData.occupation || ''}
                  onChange={(e) => handleChange('occupation', e.target.value)}
                  disabled={isSaving}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '2px solid #e5e7eb',
                    borderRadius: '6px',
                    fontSize: '15px',
                    color: '#1f2937',
                    fontWeight: '500',
                    transition: 'border-color 0.2s',
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = '#667eea')}
                  onBlur={(e) => (e.currentTarget.style.borderColor = '#e5e7eb')}
                />
              </div>

              {/* Marital Status */}
              <div>
                <div style={{ fontSize: '12px', fontWeight: '600', color: '#6b7280', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Estado Civil
                </div>
                <select
                  value={formData.maritalStatus || ''}
                  onChange={(e) => handleChange('maritalStatus', e.target.value)}
                  disabled={isSaving}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '2px solid #e5e7eb',
                    borderRadius: '6px',
                    fontSize: '15px',
                    color: '#1f2937',
                    fontWeight: '500',
                    transition: 'border-color 0.2s',
                    background: 'white',
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = '#667eea')}
                  onBlur={(e) => (e.currentTarget.style.borderColor = '#e5e7eb')}
                >
                  <option value="">Seleccionar...</option>
                  {MARITAL_STATUS_OPTIONS.map((status) => (
                    <option key={status.value} value={status.value}>
                      {status.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Address */}
              <div>
                <div style={{ fontSize: '12px', fontWeight: '600', color: '#6b7280', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Dirección
                </div>
                <input
                  type="text"
                  value={formData.address || ''}
                  onChange={(e) => handleChange('address', e.target.value)}
                  disabled={isSaving}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    border: '2px solid #e5e7eb',
                    borderRadius: '6px',
                    fontSize: '15px',
                    color: '#1f2937',
                    fontWeight: '500',
                    transition: 'border-color 0.2s',
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = '#667eea')}
                  onBlur={(e) => (e.currentTarget.style.borderColor = '#e5e7eb')}
                />
              </div>

              {/* Error Message */}
              {error && (
                <div
                  style={{
                    padding: '12px',
                    background: '#fee2e2',
                    border: '1px solid #fca5a5',
                    borderRadius: '6px',
                    color: '#991b1b',
                    fontSize: '14px',
                  }}
                >
                  {error}
                </div>
              )}

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '8px', marginTop: '8px', justifyContent: 'flex-end' }}>
                <button
                  onClick={handleClose}
                  disabled={isSaving}
                  style={{
                    padding: '10px 20px',
                    background: '#e5e7eb',
                    color: '#4b5563',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: isSaving ? 'not-allowed' : 'pointer',
                    fontSize: '14px',
                    fontWeight: '500',
                    transition: 'all 0.2s',
                    opacity: isSaving ? 0.5 : 1,
                  }}
                  onMouseEnter={(e) => !isSaving && (e.currentTarget.style.background = '#d1d5db')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = '#e5e7eb')}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  style={{
                    padding: '10px 20px',
                    background: isSaving ? '#9ca3af' : '#10b981',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: isSaving ? 'not-allowed' : 'pointer',
                    fontSize: '14px',
                    fontWeight: '500',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => !isSaving && (e.currentTarget.style.background = '#059669')}
                  onMouseLeave={(e) => !isSaving && (e.currentTarget.style.background = '#10b981')}
                >
                  {isSaving ? 'Guardando...' : '💾 Crear Cliente'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
