import type {
  GeneratedDocumentOwnerReference,
  GeneratedDocumentRecord,
  RegisterGeneratedDocumentData,
} from "./generated-document.types";

export const GENERATED_DOCUMENTS_REPOSITORY = Symbol(
  "GENERATED_DOCUMENTS_REPOSITORY",
);

export interface GeneratedDocumentsRepository {
  create(
    data: Required<RegisterGeneratedDocumentData>,
  ): Promise<GeneratedDocumentRecord>;
  findById(
    tenantId: string,
    documentId: string,
  ): Promise<GeneratedDocumentRecord | null>;
  findByOwner(
    reference: GeneratedDocumentOwnerReference,
  ): Promise<GeneratedDocumentRecord[]>;
  findLatest(
    reference: GeneratedDocumentOwnerReference,
  ): Promise<GeneratedDocumentRecord | null>;
}
