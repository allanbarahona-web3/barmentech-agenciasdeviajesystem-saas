import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import {
  ImmutableBillingArtifactReadInput,
  ImmutableBillingArtifactReadResult,
  ImmutableBillingArtifactStorageError,
  ImmutableBillingArtifactStorageInput,
  ImmutableBillingArtifactStorageMetadata,
  ImmutableBillingArtifactStoragePort,
  ImmutableBillingArtifactType,
} from './immutable-billing-artifact-storage.port';
import {
  StorageObjectAlreadyExistsError,
  StorageObjectCapacityError,
  StorageService,
} from './storage.service';

const MAXIMUM_ARTIFACT_BYTES = 5 * 1024 * 1024;
const STORAGE_PROVIDER = 'PRIVATE_OBJECT_STORAGE';
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const SAFE_IDENTITY_PATTERN = /^[A-Za-z0-9_-]{1,191}$/;
const SAFE_ENVIRONMENT_PATTERN = /^[a-z0-9][a-z0-9-]{0,49}$/;

interface ArtifactDescriptor {
  pathSegment: string;
  extension: 'xml' | 'pdf';
  allowedMimeTypes: readonly string[];
  requiresVersionOne: boolean;
}

const ARTIFACTS: Record<ImmutableBillingArtifactType, ArtifactDescriptor> = {
  SIGNED_FISCAL_XML: {
    pathSegment: 'signed-fiscal-xml',
    extension: 'xml',
    allowedMimeTypes: ['application/xml', 'text/xml'],
    requiresVersionOne: true,
  },
  TAX_AUTHORITY_RESPONSE_XML: {
    pathSegment: 'tax-authority-response-xml',
    extension: 'xml',
    allowedMimeTypes: ['application/xml', 'text/xml'],
    requiresVersionOne: true,
  },
  INTERNAL_PDF: {
    pathSegment: 'internal-pdf',
    extension: 'pdf',
    allowedMimeTypes: ['application/pdf'],
    requiresVersionOne: false,
  },
};

@Injectable()
export class ImmutableBillingArtifactStorageAdapter implements ImmutableBillingArtifactStoragePort {
  constructor(
    private readonly storageService: StorageService,
    private readonly configService: ConfigService,
  ) {}

  async storeImmutable(input: ImmutableBillingArtifactStorageInput): Promise<ImmutableBillingArtifactStorageMetadata> {
    const validated = this.validateStorageInput(input);
    const bytes = Buffer.from(input.bytes);
    const actualSha256 = this.sha256(bytes);
    if (actualSha256 !== validated.expectedSha256) {
      throw this.error('IMMUTABLE_BILLING_ARTIFACT_STORAGE_INVALID');
    }

    const storageKey = this.buildKey(validated, actualSha256);
    try {
      const result = await this.storageService.putObjectIfAbsent({
        objectKey: storageKey,
        contentType: validated.mimeType,
        body: bytes,
      });
      return {
        storageProvider: STORAGE_PROVIDER,
        storageKey,
        sha256: actualSha256,
        byteSize: BigInt(bytes.length),
        mimeType: validated.mimeType,
        storedAt: new Date(),
        storageEtag: result.eTag,
      };
    } catch (error) {
      if (error instanceof StorageObjectAlreadyExistsError) {
        return this.readExactExisting({ ...validated, storageKey, expectedSha256: actualSha256 });
      }
      throw this.toSafeError(error);
    }
  }

  async readImmutable(input: ImmutableBillingArtifactReadInput): Promise<ImmutableBillingArtifactReadResult> {
    const validated = this.validateReadInput(input);
    return this.readExactExisting(validated);
  }

  private async readExactExisting(
    input: Omit<ImmutableBillingArtifactReadInput, 'storageProvider'> & { storageKey: string },
  ): Promise<ImmutableBillingArtifactReadResult> {
    try {
      const expectedKey = this.buildKey(input, input.expectedSha256);
      if (input.storageKey !== expectedKey) {
        throw this.error('IMMUTABLE_BILLING_ARTIFACT_STORAGE_INVALID');
      }
      const object = await this.storageService.readObjectWithMetadata({
        objectKey: input.storageKey,
        maximumBytes: MAXIMUM_ARTIFACT_BYTES,
      });
      const mimeType = this.normalizeAndValidateMimeType(input.artifactType, object.contentType ?? '');
      const sha256 = this.sha256(object.body);
      if (sha256 !== input.expectedSha256 || mimeType !== input.mimeType || !object.lastModified) {
        throw this.error('IMMUTABLE_BILLING_ARTIFACT_STORAGE_CONFLICT');
      }
      return {
        storageProvider: STORAGE_PROVIDER,
        storageKey: input.storageKey,
        sha256,
        byteSize: BigInt(object.body.length),
        mimeType,
        storedAt: object.lastModified,
        storageEtag: object.eTag,
        bytes: Buffer.from(object.body),
      };
    } catch (error) {
      throw this.toSafeError(error);
    }
  }

  private validateStorageInput(input: ImmutableBillingArtifactStorageInput): {
    tenantId: string;
    billingDocumentId: string;
    artifactType: ImmutableBillingArtifactType;
    artifactVersion: number;
    expectedSha256: string;
    mimeType: string;
  } {
    if (!Buffer.isBuffer(input.bytes)) {
      throw this.error('IMMUTABLE_BILLING_ARTIFACT_STORAGE_INVALID');
    }
    const validated = this.validateCommon(input);
    if (input.bytes.length === 0) {
      throw this.error('IMMUTABLE_BILLING_ARTIFACT_STORAGE_INVALID');
    }
    if (input.bytes.length > MAXIMUM_ARTIFACT_BYTES) {
      throw this.error('IMMUTABLE_BILLING_ARTIFACT_STORAGE_CAPACITY_EXCEEDED');
    }
    return validated;
  }

  private validateReadInput(input: ImmutableBillingArtifactReadInput): ImmutableBillingArtifactReadInput {
    if (input.storageProvider !== STORAGE_PROVIDER) {
      throw this.error('IMMUTABLE_BILLING_ARTIFACT_STORAGE_INVALID');
    }
    const validated = this.validateCommon(input);
    const expectedKey = this.buildKey(validated, validated.expectedSha256);
    if (input.storageKey !== expectedKey) {
      throw this.error('IMMUTABLE_BILLING_ARTIFACT_STORAGE_INVALID');
    }
    return { ...validated, storageProvider: STORAGE_PROVIDER, storageKey: input.storageKey };
  }

  private validateCommon(input: {
    tenantId: string;
    billingDocumentId: string;
    artifactType: ImmutableBillingArtifactType;
    artifactVersion: number;
    expectedSha256: string;
    mimeType: string;
  }): {
    tenantId: string;
    billingDocumentId: string;
    artifactType: ImmutableBillingArtifactType;
    artifactVersion: number;
    expectedSha256: string;
    mimeType: string;
  } {
    if (!this.isSafeIdentity(input.tenantId) || !this.isSafeIdentity(input.billingDocumentId)) {
      throw this.error('IMMUTABLE_BILLING_ARTIFACT_STORAGE_INVALID');
    }
    if (!Number.isInteger(input.artifactVersion) || input.artifactVersion < 1 || input.artifactVersion > 2147483647) {
      throw this.error('IMMUTABLE_BILLING_ARTIFACT_STORAGE_INVALID');
    }
    const descriptor = ARTIFACTS[input.artifactType];
    if (!descriptor || (descriptor.requiresVersionOne && input.artifactVersion !== 1)) {
      throw this.error('IMMUTABLE_BILLING_ARTIFACT_STORAGE_INVALID');
    }
    if (typeof input.expectedSha256 !== 'string' || !SHA256_PATTERN.test(input.expectedSha256)) {
      throw this.error('IMMUTABLE_BILLING_ARTIFACT_STORAGE_INVALID');
    }
    return {
      tenantId: input.tenantId,
      billingDocumentId: input.billingDocumentId,
      artifactType: input.artifactType,
      artifactVersion: input.artifactVersion,
      expectedSha256: input.expectedSha256,
      mimeType: this.normalizeAndValidateMimeType(input.artifactType, input.mimeType),
    };
  }

  private buildKey(
    input: {
      tenantId: string;
      billingDocumentId: string;
      artifactType: ImmutableBillingArtifactType;
      artifactVersion: number;
    },
    sha256: string,
  ): string {
    const environment = this.getEnvironmentNamespace();
    const descriptor = ARTIFACTS[input.artifactType];
    return `${environment}/tenants/${input.tenantId}/billing-documents/${input.billingDocumentId}/artifacts/${descriptor.pathSegment}/v${input.artifactVersion}/${sha256}.${descriptor.extension}`;
  }

  private getEnvironmentNamespace(): string {
    const value = this.configService.get<string>('APP_ENV', 'dev').trim().toLowerCase();
    if (!SAFE_ENVIRONMENT_PATTERN.test(value)) {
      throw this.error('IMMUTABLE_BILLING_ARTIFACT_STORAGE_INVALID');
    }
    return value;
  }

  private normalizeAndValidateMimeType(artifactType: ImmutableBillingArtifactType, mimeType: string): string {
    const normalized = typeof mimeType === 'string' ? mimeType.trim().toLowerCase() : '';
    if (!ARTIFACTS[artifactType]?.allowedMimeTypes.includes(normalized)) {
      throw this.error('IMMUTABLE_BILLING_ARTIFACT_STORAGE_INVALID');
    }
    return normalized;
  }

  private isSafeIdentity(value: unknown): value is string {
    return typeof value === 'string' && SAFE_IDENTITY_PATTERN.test(value);
  }

  private sha256(bytes: Buffer): string {
    return createHash('sha256').update(bytes).digest('hex');
  }

  private toSafeError(error: unknown): ImmutableBillingArtifactStorageError {
    if (error instanceof ImmutableBillingArtifactStorageError) {
      return error;
    }
    if (error instanceof StorageObjectCapacityError) {
      return this.error('IMMUTABLE_BILLING_ARTIFACT_STORAGE_CAPACITY_EXCEEDED');
    }
    return this.error('IMMUTABLE_BILLING_ARTIFACT_STORAGE_FAILURE');
  }

  private error(code: ImmutableBillingArtifactStorageError['code']): ImmutableBillingArtifactStorageError {
    return new ImmutableBillingArtifactStorageError(code);
  }
}
