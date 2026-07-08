'use client';

interface CustomerFormProps {
  customer: {
    fullName: string;
    idNumber: string;
    email: string;
    phone: string | null;
    emergencyContactName: string | null;
    emergencyContactPhone: string | null;
    createdAt: string;
  };
  isEditMode: boolean;
  editForm: {
    fullName: string;
    email: string;
    phone: string;
    emergencyContactName: string;
    emergencyContactPhone: string;
  };
  onEditFormChange: (updates: Partial<CustomerFormProps['editForm']>) => void;
  onEnterEditMode: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
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
  customer,
  isEditMode,
  editForm,
  onEditFormChange,
  onEnterEditMode,
  onCancelEdit,
  onSaveEdit,
}: CustomerFormProps) {
  return (
    <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#1f2937' }}>
          📋 Información del Cliente
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
