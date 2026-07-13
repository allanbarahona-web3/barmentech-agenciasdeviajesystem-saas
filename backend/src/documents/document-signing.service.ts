import { BadRequestException, Injectable, InternalServerErrorException, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash, createHmac, timingSafeEqual } from "crypto";

const SIGNING_TOKEN_VERSION = 1;

/**
 * Parsed signing token payload
 */
export interface ParsedSigningToken {
  documentId: string;
  documentSigningId?: string; // NEW: Specific DocumentSigning record for multi-document sessions
  expiresAt: Date;
  signerKey: string;
  signerRole: string;
  signerName: string;
}

/**
 * Generic signing participant
 */
export interface SigningParticipant {
  key: string;
  name: string;
  email: string | null;
  role: string;
}

/**
 * Token build options
 */
export interface SigningTokenOptions {
  documentId: string;
  documentSigningId?: string; // NEW: Specific DocumentSigning record for multi-document sessions
  expiresAt: Date;
  signerKey?: string;
  signerRole?: string;
  signerName?: string;
}

/**
 * Generic document signing service
 * 
 * Provides reusable signing token generation, validation, and helpers
 * for any document type that requires electronic signatures.
 * 
 * Extracted from ContractsService to support multiple document types
 * (contracts, waivers, authorizations, etc.)
 */
@Injectable()
export class DocumentSigningService {
  private readonly logger = new Logger(DocumentSigningService.name);

  constructor(private readonly configService: ConfigService) {}

  /**
   * Get HMAC signing secret from environment
   * Falls back to JWT_SECRET if SIGNING_LINK_SECRET not configured
   */
  getSigningSecret(): string {
    const explicitSecret = this.configService.get<string>("SIGNING_LINK_SECRET", "").trim();
    if (explicitSecret) {
      return explicitSecret;
    }

    const jwtSecret = this.configService.get<string>("JWT_SECRET", "").trim();
    if (jwtSecret) {
      return jwtSecret;
    }

    throw new InternalServerErrorException("Falta configurar SIGNING_LINK_SECRET o JWT_SECRET.");
  }

  /**
   * Create HMAC-SHA256 signature for base64url-encoded payload
   */
  signPayload(payloadB64: string): string {
    return createHmac("sha256", this.getSigningSecret()).update(payloadB64).digest("base64url");
  }

  /**
   * Convert string to base64url encoding
   */
  toBase64Url(value: string): string {
    return Buffer.from(value, "utf8").toString("base64url");
  }

  /**
   * Decode base64url-encoded string
   */
  fromBase64Url(value: string): string {
    return Buffer.from(value, "base64url").toString("utf8");
  }

  /**
   * Build signed token for document signing
   * 
   * Token format: base64url(payload).base64url(hmac_signature)
   * 
   * Payload structure:
   * {
   *   v: 1,
   *   contractId: "...",  // documentId for contracts
   *   exp: "2026-07-05T12:00:00Z",
   *   signerKey: "client",
   *   signerRole: "CLIENTE",
   *   signerName: "John Doe"
   * }
   * 
   * @param options Token generation options
   * @returns Signed token string
   */
  buildSigningToken(options: SigningTokenOptions): string {
    const payload: any = {
      v: SIGNING_TOKEN_VERSION,
      contractId: options.documentId, // Keep 'contractId' for backward compatibility
      exp: options.expiresAt.toISOString(),
      signerKey: options.signerKey || "client",
      signerRole: options.signerRole || "CLIENTE",
      signerName: options.signerName || "",
    };

    // Include documentSigningId if provided (multi-document sessions)
    if (options.documentSigningId) {
      payload.documentSigningId = options.documentSigningId;
    }

    const payloadB64 = this.toBase64Url(JSON.stringify(payload));
    const signature = this.signPayload(payloadB64);
    return `${payloadB64}.${signature}`;
  }

  /**
   * Parse and validate signed token
   * 
   * Validates:
   * - Token structure (payload.signature)
   * - HMAC signature (timing-safe comparison)
   * - Token version
   * - Expiration
   * 
   * @param token Signed token string
   * @param callerIp Optional IP address for audit logging
   * @returns Parsed token payload
   * @throws BadRequestException if token is invalid or expired
   */
  parseSigningToken(token: string, callerIp?: string | null): ParsedSigningToken {
    const normalized = String(token || "").trim();
    // Log using only first 12 chars of token — enough to correlate without leaking full HMAC
    const tokenHint = normalized.slice(0, 12) + "…";
    const ipHint = callerIp || "unknown";

    const [payloadB64, signature] = normalized.split(".");
    if (!payloadB64 || !signature) {
      this.logger.warn(`[signing] Malformed token structure ip=${ipHint} hint=${tokenHint}`);
      throw new BadRequestException("Token de firma invalido.");
    }

    const expected = this.signPayload(payloadB64);
    const providedBuf = Buffer.from(signature, "utf8");
    const expectedBuf = Buffer.from(expected, "utf8");

    if (providedBuf.length !== expectedBuf.length || !timingSafeEqual(providedBuf, expectedBuf)) {
      this.logger.warn(`[signing] HMAC mismatch ip=${ipHint} hint=${tokenHint}`);
      throw new BadRequestException("Token de firma invalido.");
    }

    let payload: {
      v: number;
      contractId: string;
      documentSigningId?: string; // NEW: Multi-document support
      exp: string;
      signerKey?: string;
      signerRole?: string;
      signerName?: string;
    };
    try {
      payload = JSON.parse(this.fromBase64Url(payloadB64));
    } catch {
      this.logger.warn(`[signing] Payload decode error ip=${ipHint} hint=${tokenHint}`);
      throw new BadRequestException("Token de firma invalido.");
    }

    if (payload.v !== SIGNING_TOKEN_VERSION || !payload.contractId || !payload.exp) {
      this.logger.warn(`[signing] Invalid payload shape ip=${ipHint} hint=${tokenHint}`);
      throw new BadRequestException("Token de firma invalido.");
    }

    const expDate = new Date(payload.exp);
    if (Number.isNaN(expDate.getTime()) || expDate.getTime() <= Date.now()) {
      this.logger.warn(
        `[signing] Expired token ip=${ipHint} documentId=${payload.contractId} hint=${tokenHint}`,
      );
      throw new BadRequestException("El enlace de firma expiro.");
    }

    return {
      documentId: payload.contractId, // Map to generic documentId
      documentSigningId: payload.documentSigningId, // NEW: Include if present
      expiresAt: expDate,
      signerKey: String(payload.signerKey || "client").trim() || "client",
      signerRole: String(payload.signerRole || "CLIENTE").trim(),
      signerName: String(payload.signerName || "").trim(),
    };
  }

  /**
   * Generate SHA-256 hash of token for replay prevention
   * Store this hash in database with unique constraint
   * 
   * @param token Raw token string
   * @returns SHA-256 hash (hex)
   */
  generateTokenHash(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  /**
   * Safely extract payload as record from unknown value
   * 
   * @param payload Unknown payload value (typically from Contract.payload JSON)
   * @returns Payload as Record or empty object
   */
  getPayloadRecord(payload: unknown): Record<string, any> {
    if (payload && typeof payload === "object" && !Array.isArray(payload)) {
      return payload as Record<string, any>;
    }
    return {} as Record<string, any>;
  }

  /**
   * Extract signature anchor for specific signer from payload
   * 
   * Payload structure:
   * {
   *   signatureAnchors: {
   *     "client": { pageIndex: 0, box: { x, y, width, height } },
   *     "companion-0": { ... }
   *   },
   *   signatureAnchor: { ... }  // Fallback for single signer
   * }
   * 
   * @param payload Document payload
   * @param signerKey Signer key ("client", "companion-0", etc.)
   * @returns Signature anchor or null
   */
  getSignatureAnchorForSigner(payload: Record<string, any>, signerKey: string): any {
    const allAnchors =
      payload.signatureAnchors &&
      typeof payload.signatureAnchors === "object" &&
      !Array.isArray(payload.signatureAnchors)
        ? (payload.signatureAnchors as Record<string, any>)
        : null;

    if (allAnchors && allAnchors[signerKey]) {
      return allAnchors[signerKey];
    }

    return payload.signatureAnchor || null;
  }
}
