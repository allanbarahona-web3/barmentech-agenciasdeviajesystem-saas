import { useState } from 'react';
import type { CustomerDocumentCategory } from '@/lib/customers-api';

interface CustomerDocumentUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpload: (category: CustomerDocumentCategory, file: File) => Promise<void>;
}

/**
 * Modal for uploading customer documents
 * Allows selecting category and file, then delegates upload to parent
 */
export function CustomerDocumentUploadModal({
  isOpen,
  onClose,
  onUpload,
}: CustomerDocumentUploadModalProps) {
  const [selectedCategory, setSelectedCategory] = useState<CustomerDocumentCategory>('OTHER');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleClose() {
    if (isUploading) return;
    setSelectedCategory('OTHER');
    setSelectedFile(null);
    setError(null);
    onClose();
  }

  function handleFileSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setError(null);
    }
  }

  async function handleUpload() {
    if (!selectedFile) {
      setError('Por favor selecciona un archivo');
      return;
    }

    try {
      setIsUploading(true);
      setError(null);
      await onUpload(selectedCategory, selectedFile);
      handleClose();
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Error al subir documento';
      setError(errorMessage);
    } finally {
      setIsUploading(false);
    }
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
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '20px',
      }}
      onClick={handleClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'white',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '500px',
          maxHeight: '90vh',
          overflow: 'auto',
          boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '24px',
            borderBottom: '2px solid #e5e7eb',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            borderTopLeftRadius: '16px',
            borderTopRightRadius: '16px',
          }}
        >
          <h2 style={{ fontSize: '22px', fontWeight: 'bold', color: 'white', marginBottom: '4px' }}>
            📤 Agregar Documento
          </h2>
          <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.9)' }}>
            Selecciona el tipo de documento y el archivo a subir
          </p>
        </div>

        {/* Body */}
        <div style={{ padding: '24px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Category Selection */}
            <div>
              <div style={{ fontSize: '12px', fontWeight: '600', color: '#6b7280', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Tipo de Documento *
              </div>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value as CustomerDocumentCategory)}
                disabled={isUploading}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '2px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '15px',
                  color: '#1f2937',
                  fontWeight: '500',
                  transition: 'border-color 0.2s',
                  background: 'white',
                  cursor: isUploading ? 'not-allowed' : 'pointer',
                }}
                onFocus={(e) => (e.currentTarget.style.borderColor = '#667eea')}
                onBlur={(e) => (e.currentTarget.style.borderColor = '#e5e7eb')}
              >
                <option value="ID_FRONT">Cédula (Frente)</option>
                <option value="ID_BACK">Cédula (Reverso)</option>
                <option value="PASSPORT">Pasaporte</option>
                <option value="PROFILE_PHOTO">Foto de Perfil</option>
                <option value="OTHER">Otro</option>
              </select>
            </div>

            {/* File Selection */}
            <div>
              <div style={{ fontSize: '12px', fontWeight: '600', color: '#6b7280', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Archivo *
              </div>
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                onChange={handleFileSelect}
                disabled={isUploading}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '2px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '14px',
                  color: '#1f2937',
                  transition: 'border-color 0.2s',
                  background: 'white',
                  cursor: isUploading ? 'not-allowed' : 'pointer',
                }}
              />
              <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '6px' }}>
                Formatos permitidos: PDF, JPG, PNG, WEBP (máx. 10MB)
              </div>
            </div>

            {/* Selected File Info */}
            {selectedFile && (
              <div
                style={{
                  padding: '12px',
                  background: '#eff6ff',
                  border: '1px solid #bfdbfe',
                  borderRadius: '8px',
                  fontSize: '13px',
                  color: '#1e40af',
                }}
              >
                <strong>Archivo seleccionado:</strong> {selectedFile.name} ({(selectedFile.size / 1024).toFixed(2)} KB)
              </div>
            )}

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
                }}
              >
                {error}
              </div>
            )}

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: '8px', marginTop: '8px', justifyContent: 'flex-end' }}>
              <button
                onClick={handleClose}
                disabled={isUploading}
                style={{
                  padding: '10px 20px',
                  background: '#e5e7eb',
                  color: '#4b5563',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: isUploading ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  fontWeight: '500',
                  transition: 'all 0.2s',
                  opacity: isUploading ? 0.5 : 1,
                }}
                onMouseEnter={(e) => !isUploading && (e.currentTarget.style.background = '#d1d5db')}
                onMouseLeave={(e) => (e.currentTarget.style.background = '#e5e7eb')}
              >
                Cancelar
              </button>
              <button
                onClick={handleUpload}
                disabled={isUploading || !selectedFile}
                style={{
                  padding: '10px 20px',
                  background: isUploading || !selectedFile ? '#9ca3af' : '#667eea',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: isUploading || !selectedFile ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  fontWeight: '500',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => !isUploading && selectedFile && (e.currentTarget.style.background = '#5568d3')}
                onMouseLeave={(e) => !isUploading && selectedFile && (e.currentTarget.style.background = '#667eea')}
              >
                {isUploading ? 'Subiendo...' : '📤 Subir Documento'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
