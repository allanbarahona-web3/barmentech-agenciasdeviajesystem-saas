import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Signature event data for audit trail
 */
export interface SignatureEventData {
  documentId: string;
  signerKey: string;
  signerRole: string;
  signerName: string;
  signedAt: Date;
  signedClientIp: string | null;
  signedUserAgent: string | null;
  signaturePngKey: string | null;
  signedPdfKey: string | null;
  signedPdfBytes: number | null;
  signedPdfSha256: string | null;
  tokenHash: string | null;
}

/**
 * Used token data for replay prevention
 */
export interface UsedTokenData {
  documentId: string;
  tokenHash: string;
  signerKey: string;
  usedAt: Date;
}

/**
 * Generic document signing audit service
 * 
 * Provides reusable audit operations for document signing:
 * - Token replay prevention
 * - Signature event recording
 * - Audit trail management
 * 
 * Currently uses contract-specific tables (ContractSignatureEvent, ContractUsedToken)
 * but designed to be easily migrated to generic tables in the future.
 * 
 * Extracted from ContractsService to support multiple document types
 * (contracts, waivers, authorizations, etc.)
 */
@Injectable()
export class DocumentSigningAuditService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Check if a signing token has already been used
   * 
   * This is a pre-flight check before the main transaction.
   * The actual atomic replay prevention happens via unique constraint
   * in the transaction.
   * 
   * @param tokenHash SHA-256 hash of the token
   * @returns true if token was already used
   */
  async isTokenUsed(tokenHash: string): Promise<boolean> {
    const record = await (this.prisma as any).contractUsedToken.findUnique({
      where: { tokenHash },
    });
    return record !== null;
  }

  /**
   * Check if a signing token has already been used and throw if it has
   * 
   * Convenience method for the common pattern of checking and throwing.
   * 
   * @param tokenHash SHA-256 hash of the token
   * @throws BadRequestException if token was already used
   */
  async ensureTokenNotUsed(tokenHash: string): Promise<void> {
    const used = await this.isTokenUsed(tokenHash);
    if (used) {
      throw new BadRequestException("Este enlace de firma ya fue utilizado.");
    }
  }

  /**
   * Build data object for creating a used token record
   * 
   * Use this in a Prisma transaction to mark a token as consumed.
   * The unique constraint on tokenHash provides atomic replay protection.
   * 
   * @param data Used token data
   * @returns Data object ready for Prisma create operation
   */
  buildUsedTokenData(data: UsedTokenData): any {
    return {
      contractId: data.documentId, // Currently uses contractId, will be generic in future
      tokenHash: data.tokenHash,
      signerKey: data.signerKey,
      usedAt: data.usedAt,
    };
  }

  /**
   * Build data object for creating a signature event record
   * 
   * Use this in a Prisma transaction to create an immutable audit trail entry.
   * 
   * @param data Signature event data
   * @returns Data object ready for Prisma create operation
   */
  buildSignatureEventData(data: SignatureEventData): any {
    return {
      contractId: data.documentId, // Currently uses contractId, will be generic in future
      signerKey: data.signerKey,
      signerRole: data.signerRole,
      signerName: data.signerName,
      signedAt: data.signedAt,
      signedClientIp: data.signedClientIp || null,
      signedUserAgent: data.signedUserAgent || null,
      signaturePngKey: data.signaturePngKey || null,
      signedPdfKey: data.signedPdfKey || null,
      signedPdfBytes: data.signedPdfBytes || null,
      signedPdfSha256: data.signedPdfSha256 || null,
      tokenHash: data.tokenHash || null,
    };
  }

  /**
   * Create used token record in a transaction
   * 
   * This operation should be part of a larger transaction that also
   * creates the signature event and updates the document.
   * 
   * @param txClient Prisma transaction client
   * @param data Used token data
   * @returns Created record
   */
  async createUsedToken(txClient: any, data: UsedTokenData): Promise<any> {
    return txClient.contractUsedToken.create({
      data: this.buildUsedTokenData(data),
    });
  }

  /**
   * Create signature event record in a transaction
   * 
   * This operation should be part of a larger transaction that also
   * creates the used token and updates the document.
   * 
   * @param txClient Prisma transaction client
   * @param data Signature event data
   * @returns Created record
   */
  async createSignatureEvent(txClient: any, data: SignatureEventData): Promise<any> {
    return txClient.contractSignatureEvent.create({
      data: this.buildSignatureEventData(data),
    });
  }

  /**
   * Record both used token and signature event in one operation
   * 
   * Returns Prisma operation objects that can be included in a transaction.
   * This allows the caller to combine these with other operations in a single
   * atomic transaction.
   * 
   * @param usedTokenData Used token data
   * @param signatureEventData Signature event data
   * @returns Array of Prisma operations [usedToken, signatureEvent]
   */
  buildAuditOperations(
    usedTokenData: UsedTokenData,
    signatureEventData: SignatureEventData,
  ): Array<any> {
    return [
      (this.prisma as any).contractUsedToken.create({
        data: this.buildUsedTokenData(usedTokenData),
      }),
      (this.prisma as any).contractSignatureEvent.create({
        data: this.buildSignatureEventData(signatureEventData),
      }),
    ];
  }
}
