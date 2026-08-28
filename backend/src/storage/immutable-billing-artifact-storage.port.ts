export const IMMUTABLE_BILLING_ARTIFACT_STORAGE_PORT = Symbol('IMMUTABLE_BILLING_ARTIFACT_STORAGE_PORT');

export type ImmutableBillingArtifactType =
  | 'SIGNED_FISCAL_XML'
  | 'TAX_AUTHORITY_RESPONSE_XML'
  | 'INTERNAL_PDF';

export interface ImmutableBillingArtifactStorageInput {
  tenantId: string;
  billingDocumentId: string;
  artifactType: ImmutableBillingArtifactType;
  artifactVersion: number;
  expectedSha256: string;
  mimeType: string;
  bytes: Buffer;
}

export interface ImmutableBillingArtifactReadInput {
  tenantId: string;
  billingDocumentId: string;
  artifactType: ImmutableBillingArtifactType;
  artifactVersion: number;
  storageProvider: string;
  storageKey: string;
  expectedSha256: string;
  mimeType: string;
}

export interface ImmutableBillingArtifactStorageMetadata {
  storageProvider: string;
  storageKey: string;
  sha256: string;
  byteSize: bigint;
  mimeType: string;
  storedAt: Date;
  storageEtag: string | null;
}

export interface ImmutableBillingArtifactReadResult extends ImmutableBillingArtifactStorageMetadata {
  bytes: Buffer;
}

export interface ImmutableBillingArtifactStoragePort {
  storeImmutable(input: ImmutableBillingArtifactStorageInput): Promise<ImmutableBillingArtifactStorageMetadata>;
  readImmutable(input: ImmutableBillingArtifactReadInput): Promise<ImmutableBillingArtifactReadResult>;
}

export class ImmutableBillingArtifactStorageError extends Error {
  constructor(
    readonly code:
      | 'IMMUTABLE_BILLING_ARTIFACT_STORAGE_INVALID'
      | 'IMMUTABLE_BILLING_ARTIFACT_STORAGE_CAPACITY_EXCEEDED'
      | 'IMMUTABLE_BILLING_ARTIFACT_STORAGE_CONFLICT'
      | 'IMMUTABLE_BILLING_ARTIFACT_STORAGE_FAILURE',
  ) {
    super(code);
  }
}
