import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { IMMUTABLE_BILLING_ARTIFACT_STORAGE_PORT, ImmutableBillingArtifactStorageError, type ImmutableBillingArtifactStoragePort } from '../storage/immutable-billing-artifact-storage.port';
import { fiscalArtifactReadError } from './fiscal-artifact-read.errors';

const ARTIFACT_TYPES = ['SIGNED_FISCAL_XML', 'TAX_AUTHORITY_RESPONSE_XML', 'INTERNAL_PDF'] as const;
type ArtifactType = (typeof ARTIFACT_TYPES)[number];
const MAX_VERSION = 2_147_483_647;
const LIST_LIMIT = 100;

type Artifact = {
  artifactType: string; version: number; status: string; mimeType: string | null; byteSize: bigint | null;
  retrievedAt: Date | null; storedAt: Date | null; terminalErrorCode: string | null; failedAt: Date | null;
  storageProvider: string | null; storageKey: string | null; sha256: string | null;
};

@Injectable()
export class FiscalArtifactReadService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(IMMUTABLE_BILLING_ARTIFACT_STORAGE_PORT) private readonly storage: ImmutableBillingArtifactStoragePort,
  ) {}

  async list(tenantId: string, billingDocumentId: string) {
    await this.requireDocument(tenantId, billingDocumentId);
    const artifacts = await this.prisma.billingDocumentArtifact.findMany({
      where: { tenantId, billingDocumentId },
      select: { artifactType: true, version: true, status: true, mimeType: true, byteSize: true, retrievedAt: true, storedAt: true, terminalErrorCode: true, failedAt: true },
      orderBy: [{ artifactType: 'asc' }, { version: 'asc' }], take: LIST_LIMIT,
    });
    return artifacts.map((artifact) => this.listItem(artifact));
  }

  async download(tenantId: string, billingDocumentId: string, rawType: string, rawVersion: string) {
    const artifactType = parseType(rawType);
    const version = parseVersion(rawVersion);
    await this.requireDocument(tenantId, billingDocumentId);
    const artifact = await this.prisma.billingDocumentArtifact.findFirst({
      where: { tenantId, billingDocumentId, artifactType, version },
      select: { artifactType: true, version: true, status: true, storageProvider: true, storageKey: true, sha256: true, byteSize: true, mimeType: true, retrievedAt: true, storedAt: true, terminalErrorCode: true, failedAt: true },
    }) as Artifact | null;
    if (!artifact) throw fiscalArtifactReadError('FISCAL_ARTIFACT_NOT_FOUND');
    if (artifact.status === 'PENDING') throw fiscalArtifactReadError('FISCAL_ARTIFACT_NOT_AVAILABLE');
    if (artifact.status === 'FAILED') throw fiscalArtifactReadError('FISCAL_ARTIFACT_UNAVAILABLE');
    if (artifact.status !== 'AVAILABLE' || !completeMetadata(artifact)) throw fiscalArtifactReadError('FISCAL_ARTIFACT_INTEGRITY_FAILURE');
    let read;
    try {
      read = await this.storage.readImmutable({ tenantId, billingDocumentId, artifactType, artifactVersion: version, storageProvider: artifact.storageProvider, storageKey: artifact.storageKey, expectedSha256: artifact.sha256, mimeType: artifact.mimeType });
    } catch (error) {
      if (error instanceof ImmutableBillingArtifactStorageError && error.code !== 'IMMUTABLE_BILLING_ARTIFACT_STORAGE_FAILURE') throw fiscalArtifactReadError('FISCAL_ARTIFACT_INTEGRITY_FAILURE');
      throw fiscalArtifactReadError('FISCAL_ARTIFACT_DOWNLOAD_FAILED');
    }
    if (!Buffer.isBuffer(read.bytes) || read.storageProvider !== artifact.storageProvider || read.storageKey !== artifact.storageKey || read.sha256 !== artifact.sha256 || read.byteSize !== artifact.byteSize || read.mimeType !== artifact.mimeType || BigInt(read.bytes.length) !== artifact.byteSize) throw fiscalArtifactReadError('FISCAL_ARTIFACT_INTEGRITY_FAILURE');
    return { bytes: read.bytes, mimeType: artifact.mimeType, filename: filename(artifactType, version) };
  }

  private async requireDocument(tenantId: string, billingDocumentId: string): Promise<void> {
    const document = await this.prisma.billingDocument.findUnique({ where: { id_tenantId: { id: billingDocumentId, tenantId } }, select: { id: true } });
    if (!document) throw fiscalArtifactReadError('FISCAL_ARTIFACT_NOT_FOUND');
  }

  private listItem(artifact: Pick<Artifact, 'artifactType' | 'version' | 'status' | 'mimeType' | 'byteSize' | 'retrievedAt' | 'storedAt' | 'terminalErrorCode' | 'failedAt'>) {
    return {
      artifactType: artifact.artifactType, version: artifact.version, status: artifact.status,
      ...(artifact.status === 'AVAILABLE' ? { mimeType: artifact.mimeType, byteSize: artifact.byteSize?.toString() ?? null, retrievedAt: artifact.retrievedAt, storedAt: artifact.storedAt } : {}),
      ...(artifact.status === 'FAILED' ? { terminalErrorCode: artifact.terminalErrorCode, failedAt: artifact.failedAt } : {}),
      downloadAvailable: artifact.status === 'AVAILABLE',
    };
  }
}

function parseType(value: string): ArtifactType { if ((ARTIFACT_TYPES as readonly string[]).includes(value)) return value as ArtifactType; throw fiscalArtifactReadError('FISCAL_ARTIFACT_INVALID_REQUEST'); }
function parseVersion(value: string): number { if (!/^[1-9]\d*$/.test(value)) throw fiscalArtifactReadError('FISCAL_ARTIFACT_INVALID_REQUEST'); const version = Number(value); if (!Number.isSafeInteger(version) || version > MAX_VERSION) throw fiscalArtifactReadError('FISCAL_ARTIFACT_INVALID_REQUEST'); return version; }
function completeMetadata(a: Artifact): a is Artifact & { storageProvider: string; storageKey: string; sha256: string; byteSize: bigint; mimeType: 'application/xml' | 'text/xml' | 'application/pdf' } { const validMime = a.artifactType === 'INTERNAL_PDF' ? a.mimeType === 'application/pdf' : a.mimeType === 'application/xml' || a.mimeType === 'text/xml'; return nonEmpty(a.storageProvider) && nonEmpty(a.storageKey) && /^[a-f0-9]{64}$/.test(a.sha256 ?? '') && a.byteSize !== null && a.byteSize > 0n && validMime && validDate(a.retrievedAt) && validDate(a.storedAt); }
function nonEmpty(value: unknown): value is string { return typeof value === 'string' && value.trim().length > 0; }
function validDate(value: unknown): value is Date { return value instanceof Date && Number.isFinite(value.getTime()); }
function filename(type: ArtifactType, version: number) { if (type === 'INTERNAL_PDF') return `fiscal-invoice-v${version}.pdf`; return type === 'SIGNED_FISCAL_XML' ? `signed-fiscal-document-v${version}.xml` : `tax-authority-response-v${version}.xml`; }
