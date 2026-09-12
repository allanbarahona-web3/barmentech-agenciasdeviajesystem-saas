import type { FormEvent } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { IconBadge } from '@/components/ui/icon-badge';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { FormField } from '@/components/patterns/form-field';
import { SectionCard } from '@/components/patterns/section-card';
import { DOCUMENT_TYPE_LABELS, type EmployeeDocument } from '@/lib/employees-api';
import { Eye, FileText, Trash2, Upload } from 'lucide-react';

const DOCUMENT_TYPES = [
  'CONTRATO',
  'CEDULA_FRONTAL',
  'CEDULA_TRASERA',
  'PASAPORTE',
  'LICENCIA',
  'INCAPACIDAD',
  'CERTIFICADO',
  'OTRO',
] as const;

type EmployeeDocumentsSectionProps = {
  documents: EmployeeDocument[] | undefined;
  documentsByType: Record<string, EmployeeDocument[]>;
  selectedDocType: string;
  documentNotes: string;
  uploadingDoc: boolean;
  onUploadDocument: (event: FormEvent<HTMLFormElement>) => void;
  onSelectedDocTypeChange: (value: string) => void;
  onDocumentNotesChange: (value: string) => void;
  onViewDocument: (document: EmployeeDocument, allDocuments: EmployeeDocument[]) => void;
  onDeleteDocument: (documentId: string) => void;
};

function EmployeeDocumentsSection({
  documents,
  documentsByType,
  selectedDocType,
  documentNotes,
  uploadingDoc,
  onUploadDocument,
  onSelectedDocTypeChange,
  onDocumentNotesChange,
  onViewDocument,
  onDeleteDocument,
}: EmployeeDocumentsSectionProps) {
  return (
    <SectionCard
      title={<span className="flex items-center gap-2"><IconBadge tone="info" size="sm"><FileText aria-hidden="true" /></IconBadge>Documentos</span>}
      contentClassName="grid gap-4"
    >
      <form onSubmit={onUploadDocument} className="grid gap-4 sm:grid-cols-2">
        <FormField htmlFor="employee-document-type" label="Tipo de documento">
          <Select id="employee-document-type" value={selectedDocType} onChange={(event) => onSelectedDocTypeChange(event.target.value)} required>
            <option value="">Seleccionar...</option>
            {DOCUMENT_TYPES.map((type) => <option key={type} value={type}>{DOCUMENT_TYPE_LABELS[type]}</option>)}
          </Select>
        </FormField>

        <FormField htmlFor="docFile" label="Archivo">
          <Input id="docFile" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" required />
        </FormField>

        <FormField className="sm:col-span-2" htmlFor="employee-document-notes" label="Notas">
          <Textarea id="employee-document-notes" size="sm" placeholder="Notas (opcional)" value={documentNotes} onChange={(event) => onDocumentNotesChange(event.target.value)} />
        </FormField>

        <div className="flex justify-end sm:col-span-2">
          <Button type="submit" disabled={uploadingDoc}>
            <Upload aria-hidden="true" />
            {uploadingDoc ? 'Subiendo...' : 'Subir documento'}
          </Button>
        </div>
      </form>

      <div className="grid gap-3">
        {DOCUMENT_TYPES.map((type) => {
          const docs = documentsByType[type] || [];
          if (docs.length === 0) return null;

          return (
            <Card key={type} className="shadow-none">
              <CardHeader className="px-4 pt-4">
                <CardTitle className="flex items-center justify-between gap-3 text-sm">
                  <span>{DOCUMENT_TYPE_LABELS[type]}</span>
                  <Badge variant="outline">{docs.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2 p-4">
                {docs.map((doc) => (
                  <div key={doc.id} className="flex flex-col gap-3 rounded-lg border border-border bg-muted/30 p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground" title={doc.fileName}>{doc.fileName}</p>
                      <p className="mt-1 text-xs text-muted-foreground">Subido: {new Date(doc.uploadedAt).toLocaleDateString('es-CR')} por {doc.uploadedByName}</p>
                      {doc.notes && <p className="mt-1 text-xs text-muted-foreground">{doc.notes}</p>}
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button type="button" variant="outline" size="icon" aria-label="Ver documento" title="Ver" onClick={() => onViewDocument(doc, documents || [])}>
                        <Eye aria-hidden="true" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" aria-label="Eliminar documento" title="Eliminar" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => onDeleteDocument(doc.id)}>
                        <Trash2 aria-hidden="true" />
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          );
        })}

        {Object.keys(documentsByType).length === 0 && (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 px-5 py-10 text-center">
            <IconBadge tone="neutral"><FileText aria-hidden="true" /></IconBadge>
            <p className="mt-3 text-sm font-medium text-foreground">No hay documentos cargados.</p>
            <p className="mt-1 text-sm text-muted-foreground">Usa el formulario de arriba para subir documentos.</p>
          </div>
        )}
      </div>
    </SectionCard>
  );
}

export { EmployeeDocumentsSection, type EmployeeDocumentsSectionProps };
