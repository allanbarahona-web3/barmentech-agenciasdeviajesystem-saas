'use client';

import { MARITAL_STATUS_OPTIONS, NATIONALITY_OPTIONS } from '@/features/contracts-form/constants';
import {
  CLIENT_IDENTIFICATION_OPTIONS,
  getClientIdentificationTypeLabel,
  type ClientIdentificationType,
} from '@/features/customers/client-identification';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { FormField } from '@/components/patterns/form-field';

interface CustomerFormProps {
  title?: string;
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
  isEditMode: boolean;
  editForm: {
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
  onEditFormChange: (updates: Partial<CustomerFormProps['editForm']>) => void;
  onEnterEditMode: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  presentation?: 'legacy' | 'foundation';
}

function formatDate(dateString: string) {
  const date = new Date(dateString);
  return date.toLocaleDateString('es-ES', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function CustomerForm({
  title = 'Información del Cliente',
  customer,
  isEditMode,
  editForm,
  onEditFormChange,
  onEnterEditMode,
  onCancelEdit,
  onSaveEdit,
  presentation = 'legacy',
}: CustomerFormProps) {
  if (presentation === 'foundation') {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField className="sm:col-span-2" htmlFor="customer-edit-full-name" label="Nombre completo">
          {isEditMode ? <Input id="customer-edit-full-name" value={editForm.fullName} onChange={(event) => onEditFormChange({ fullName: event.target.value })} /> : <p className="text-sm text-foreground">{customer.fullName}</p>}
        </FormField>
        <FormField label="Cédula/ID">
          <p className="text-sm text-foreground">{customer.idNumber}</p>
        </FormField>
        <FormField htmlFor="customer-edit-id-type" label="Tipo de identificación">
          {isEditMode ? (
            <Select id="customer-edit-id-type" value={editForm.idType} onChange={(event) => onEditFormChange({ idType: event.target.value as ClientIdentificationType | '' })}>
              <option value="">Seleccionar</option>
              {CLIENT_IDENTIFICATION_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </Select>
          ) : <p className="text-sm text-foreground">{getClientIdentificationTypeLabel(customer.idType)}</p>}
        </FormField>
        <FormField className="sm:col-span-2" htmlFor="customer-edit-email" label="Email">
          {isEditMode ? <Input id="customer-edit-email" type="email" value={editForm.email} onChange={(event) => onEditFormChange({ email: event.target.value })} /> : <p className="text-sm text-foreground">{customer.email}</p>}
        </FormField>
        <FormField htmlFor="customer-edit-phone" label="Teléfono">
          {isEditMode ? <Input id="customer-edit-phone" value={editForm.phone} onChange={(event) => onEditFormChange({ phone: event.target.value })} /> : <p className="text-sm text-foreground">{customer.phone || '-'}</p>}
        </FormField>
        <FormField htmlFor="customer-edit-marital-status" label="Estado civil">
          {isEditMode ? (
            <Select id="customer-edit-marital-status" value={editForm.maritalStatus} onChange={(event) => onEditFormChange({ maritalStatus: event.target.value })}>
              <option value="">Seleccionar</option>
              {MARITAL_STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </Select>
          ) : <p className="text-sm text-foreground">{customer.maritalStatus || '-'}</p>}
        </FormField>
        <FormField htmlFor="customer-edit-emergency-name" label="Contacto de emergencia — nombre">
          {isEditMode ? <Input id="customer-edit-emergency-name" value={editForm.emergencyContactName} onChange={(event) => onEditFormChange({ emergencyContactName: event.target.value })} /> : <p className="text-sm text-foreground">{customer.emergencyContactName || '-'}</p>}
        </FormField>
        <FormField htmlFor="customer-edit-emergency-phone" label="Contacto de emergencia — teléfono">
          {isEditMode ? <Input id="customer-edit-emergency-phone" value={editForm.emergencyContactPhone} onChange={(event) => onEditFormChange({ emergencyContactPhone: event.target.value })} /> : <p className="text-sm text-foreground">{customer.emergencyContactPhone || '-'}</p>}
        </FormField>
        <FormField htmlFor="customer-edit-nationality" label="Nacionalidad">
          {isEditMode ? (
            <Select id="customer-edit-nationality" value={editForm.nationality} onChange={(event) => onEditFormChange({ nationality: event.target.value })}>
              <option value="">Seleccionar</option>
              {NATIONALITY_OPTIONS.map((country, index) => <option key={index} value={country}>{country}</option>)}
            </Select>
          ) : <p className="text-sm text-foreground">{customer.nationality || '-'}</p>}
        </FormField>
        <FormField htmlFor="customer-edit-occupation" label="Profesión">
          {isEditMode ? <Input id="customer-edit-occupation" value={editForm.occupation} onChange={(event) => onEditFormChange({ occupation: event.target.value })} /> : <p className="text-sm text-foreground">{customer.occupation || '-'}</p>}
        </FormField>
        <FormField className="sm:col-span-2" htmlFor="customer-edit-address" label="Dirección">
          {isEditMode ? <Input id="customer-edit-address" value={editForm.address} onChange={(event) => onEditFormChange({ address: event.target.value })} /> : <p className="text-sm text-foreground">{customer.address || '-'}</p>}
        </FormField>
        <FormField label="Cliente desde">
          <p className="text-sm text-foreground">{formatDate(customer.createdAt)}</p>
        </FormField>
      </div>
    );
  }

  return (
    <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#1f2937' }}>
          📋 {title}
        </h2>
        {!isEditMode ? (
          <button
            onClick={onEnterEditMode}
            style={{
              padding: '6px 14px',
              background: '#667eea',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: '500',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#5568d3')}
            onMouseLeave={(e) => (e.currentTarget.style.background = '#667eea')}
          >
            ✏️ Editar
          </button>
        ) : (
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={onCancelEdit}
              style={{
                padding: '6px 14px',
                background: '#e5e7eb',
                color: '#4b5563',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: '500',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#d1d5db')}
              onMouseLeave={(e) => (e.currentTarget.style.background = '#e5e7eb')}
            >
              ✖️ Cancelar
            </button>
            <button
              onClick={onSaveEdit}
              style={{
                padding: '6px 14px',
                background: '#10b981',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: '500',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#059669')}
              onMouseLeave={(e) => (e.currentTarget.style.background = '#10b981')}
            >
              💾 Guardar
            </button>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {/* Full Name - Editable */}
        <div>
          <div style={{ fontSize: '12px', fontWeight: '600', color: '#6b7280', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Nombre Completo
          </div>
          {isEditMode ? (
            <input
              type="text"
              value={editForm.fullName}
              onChange={(e) => onEditFormChange({ fullName: e.target.value })}
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
          ) : (
            <div style={{ fontSize: '15px', color: '#1f2937', fontWeight: '500' }}>
              {customer.fullName}
            </div>
          )}
        </div>
        {/* ID Number - Read Only */}
        <div>
          <div style={{ fontSize: '12px', fontWeight: '600', color: '#6b7280', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Cédula/ID
          </div>
          <div style={{ fontSize: '15px', color: '#1f2937', fontWeight: '500' }}>
            {customer.idNumber}
          </div>
        </div>
        {/* ID Type - Editable */}
        <div>
          <div style={{ fontSize: '12px', fontWeight: '600', color: '#6b7280', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Tipo de Identificación
          </div>
          {isEditMode ? (
            <select
              value={editForm.idType}
              onChange={(e) =>
                onEditFormChange({
                  idType: e.target.value as ClientIdentificationType | '',
                })
              }
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '2px solid #e5e7eb',
                borderRadius: '6px',
                fontSize: '15px',
                color: '#1f2937',
                transition: 'border-color 0.2s',
                backgroundColor: 'white',
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = '#667eea')}
              onBlur={(e) => (e.currentTarget.style.borderColor = '#e5e7eb')}
            >
              <option value="">Seleccionar</option>
              {CLIENT_IDENTIFICATION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          ) : (
            <div style={{ fontSize: '15px', color: '#1f2937' }}>
              {getClientIdentificationTypeLabel(customer.idType)}
            </div>
          )}
        </div>
        {/* Email - Editable */}
        <div>
          <div style={{ fontSize: '12px', fontWeight: '600', color: '#6b7280', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Email
          </div>
          {isEditMode ? (
            <input
              type="email"
              value={editForm.email}
              onChange={(e) => onEditFormChange({ email: e.target.value })}
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
          ) : (
            <div style={{ fontSize: '15px', color: '#1f2937' }}>
              {customer.email}
            </div>
          )}
        </div>
        {/* Phone - Editable */}
        <div>
          <div style={{ fontSize: '12px', fontWeight: '600', color: '#6b7280', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Teléfono
          </div>
          {isEditMode ? (
            <input
              type="text"
              value={editForm.phone}
              onChange={(e) => onEditFormChange({ phone: e.target.value })}
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
          ) : (
            <div style={{ fontSize: '15px', color: '#1f2937' }}>
              {customer.phone || '-'}
            </div>
          )}
        </div>
        {/* Marital Status - Editable */}
        <div>
          <div style={{ fontSize: '12px', fontWeight: '600', color: '#6b7280', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Estado Civil
          </div>
          {isEditMode ? (
            <select
              value={editForm.maritalStatus}
              onChange={(e) => onEditFormChange({ maritalStatus: e.target.value })}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '2px solid #e5e7eb',
                borderRadius: '6px',
                fontSize: '15px',
                color: '#1f2937',
                transition: 'border-color 0.2s',
                backgroundColor: 'white',
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = '#667eea')}
              onBlur={(e) => (e.currentTarget.style.borderColor = '#e5e7eb')}
            >
              <option value="">Seleccionar</option>
              {MARITAL_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          ) : (
            <div style={{ fontSize: '15px', color: '#1f2937' }}>
              {customer.maritalStatus || '-'}
            </div>
          )}
        </div>
        {/* Emergency Contact - Editable */}
        <div>
          <div style={{ fontSize: '12px', fontWeight: '600', color: '#6b7280', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Contacto de Emergencia
          </div>
          {isEditMode ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <input
                type="text"
                placeholder="Nombre"
                value={editForm.emergencyContactName}
                onChange={(e) => onEditFormChange({ emergencyContactName: e.target.value })}
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
              <input
                type="text"
                placeholder="Teléfono"
                value={editForm.emergencyContactPhone}
                onChange={(e) => onEditFormChange({ emergencyContactPhone: e.target.value })}
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
          ) : (
            <div style={{ fontSize: '15px', color: '#1f2937' }}>
              {customer.emergencyContactName || '-'}
              {customer.emergencyContactName && customer.emergencyContactPhone && (
                <span style={{ color: '#6b7280', marginLeft: '8px' }}>
                  ({customer.emergencyContactPhone})
                </span>
              )}
            </div>
          )}
        </div>
        {/* Nationality - Editable */}
        <div>
          <div style={{ fontSize: '12px', fontWeight: '600', color: '#6b7280', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Nacionalidad
          </div>
          {isEditMode ? (
            <select
              value={editForm.nationality}
              onChange={(e) => onEditFormChange({ nationality: e.target.value })}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '2px solid #e5e7eb',
                borderRadius: '6px',
                fontSize: '15px',
                color: '#1f2937',
                transition: 'border-color 0.2s',
                backgroundColor: 'white',
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = '#667eea')}
              onBlur={(e) => (e.currentTarget.style.borderColor = '#e5e7eb')}
            >
              <option value="">Seleccionar</option>
              {NATIONALITY_OPTIONS.map((country, idx) => (
                <option key={idx} value={country}>
                  {country}
                </option>
              ))}
            </select>
          ) : (
            <div style={{ fontSize: '15px', color: '#1f2937' }}>
              {customer.nationality || '-'}
            </div>
          )}
        </div>
        {/* Profession - Editable */}
        <div>
          <div style={{ fontSize: '12px', fontWeight: '600', color: '#6b7280', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Profesión
          </div>
          {isEditMode ? (
            <input
              type="text"
              value={editForm.occupation}
              onChange={(e) => onEditFormChange({ occupation: e.target.value })}
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
          ) : (
            <div style={{ fontSize: '15px', color: '#1f2937' }}>
              {customer.occupation || '-'}
            </div>
          )}
        </div>
        {/* Address - Editable */}
        <div>
          <div style={{ fontSize: '12px', fontWeight: '600', color: '#6b7280', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Dirección
          </div>
          {isEditMode ? (
            <input
              type="text"
              value={editForm.address}
              onChange={(e) => onEditFormChange({ address: e.target.value })}
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
          ) : (
            <div style={{ fontSize: '15px', color: '#1f2937' }}>
              {customer.address || '-'}
            </div>
          )}
        </div>
        {/* Created At - Read Only */}
        <div>
          <div style={{ fontSize: '12px', fontWeight: '600', color: '#6b7280', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Cliente Desde
          </div>
          <div style={{ fontSize: '15px', color: '#1f2937' }}>
            {formatDate(customer.createdAt)}
          </div>
        </div>
      </div>
    </div>
  );
}
