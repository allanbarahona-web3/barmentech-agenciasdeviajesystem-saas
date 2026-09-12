'use client';

import { useState } from 'react';
import { FileText, Upload } from 'lucide-react';
import type { CustomerDocumentCategory } from '@/lib/customers-api';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FormField } from '@/components/patterns/form-field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';

interface CustomerDocumentUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpload: (category: CustomerDocumentCategory, file: File) => Promise<void>;
}

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
      setError(err instanceof Error ? err.message : 'Error al subir documento');
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Upload aria-hidden="true" className="size-5 text-primary" />Agregar documento</DialogTitle>
          <DialogDescription>Selecciona el tipo de documento y el archivo a subir.</DialogDescription>
        </DialogHeader>

        <div className="mt-5 grid gap-5">
          <FormField htmlFor="customer-document-category" label="Tipo de documento" required>
            <Select
              id="customer-document-category"
              value={selectedCategory}
              onChange={(event) => setSelectedCategory(event.target.value as CustomerDocumentCategory)}
              disabled={isUploading}
            >
              <option value="ID_FRONT">Cédula (Frente)</option>
              <option value="ID_BACK">Cédula (Reverso)</option>
              <option value="PASSPORT">Pasaporte</option>
              <option value="PROFILE_PHOTO">Foto de Perfil</option>
              <option value="OTHER">Otro</option>
            </Select>
          </FormField>

          <FormField htmlFor="customer-document-file" label="Archivo" required description="Formatos permitidos: PDF, JPG, PNG, WEBP (máx. 10MB)">
            <Input
              id="customer-document-file"
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp"
              onChange={handleFileSelect}
              disabled={isUploading}
            />
          </FormField>

          {selectedFile ? (
            <Alert variant="info">
              <AlertTitle className="flex items-center gap-2"><FileText aria-hidden="true" className="size-4" />Archivo seleccionado</AlertTitle>
              <AlertDescription>{selectedFile.name} ({(selectedFile.size / 1024).toFixed(2)} KB)</AlertDescription>
            </Alert>
          ) : null}

          {error ? (
            <Alert variant="destructive">
              <AlertTitle>No se pudo subir el documento</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleClose} disabled={isUploading}>Cancelar</Button>
          <Button type="button" onClick={handleUpload} disabled={isUploading || !selectedFile}>
            <Upload aria-hidden="true" />
            {isUploading ? 'Subiendo...' : 'Subir documento'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
