import { Injectable, InternalServerErrorException } from "@nestjs/common";
import { createHash } from "crypto";
import { DocumentPdfService } from "./document-pdf.service";

/**
 * Signature finalization input
 */
export interface FinalizeSignatureInput {
  /** Contract/document HTML source */
  contractHtml: string;
  /** Signature image as base64 string */
  signatureImageBase64: string;
  /** Signer key (used for signature image filename) */
  signerKey: string;
  /** Existing signature images by signer key */
  existingSignatureImages: Record<string, string>;
}

/**
 * Signature finalization result
 */
export interface FinalizeSignatureResult {
  /** Signed PDF buffer (with embedded signatures) */
  signedPdfBuffer: Buffer;
  /** SHA-256 hash of signed PDF */
  signedPdfHash: string;
  /** Processed signature image buffer (WebP format) */
  signatureImageBuffer: Buffer;
  /** Signature image MIME type */
  signatureImageMimeType: string;
  /** Signature image filename */
  signatureImageFilename: string;
  /** Updated signature images map (includes new signature) */
  nextSignatureImages: Record<string, string>;
  /** Signature data URL for this signer */
  signatureDataUrl: string;
}

/**
 * Generic document signature finalization service
 * 
 * Handles the final artifact generation for document signing:
 * - Parse and normalize signature images
 * - Render signed PDF with embedded signatures
 * - Calculate cryptographic hashes
 * - Process signature image files
 * 
 * This service does NOT:
 * - Write to database
 * - Upload to storage
 * - Handle business rules
 * 
 * All persistence and I/O operations are delegated to the caller.
 * 
 * Extracted from ContractsService to support multiple document types
 * (contracts, waivers, authorizations, etc.)
 */
@Injectable()
export class DocumentSignatureFinalizationService {
  constructor(private readonly documentPdfService: DocumentPdfService) {}

  /**
   * Finalize a document signature
   * 
   * Takes a signature image and contract HTML, generates a signed PDF with
   * embedded signatures, calculates hashes, and processes image files.
   * 
   * Returns all generated artifacts for the caller to upload and persist.
   * 
   * @param input Signature finalization input
   * @returns All generated artifacts and metadata
   */
  async finalizeSignature(input: FinalizeSignatureInput): Promise<FinalizeSignatureResult> {
    // Step 1: Parse and normalize signature image to data URL
    const normalizedSignature = input.signatureImageBase64.trim();
    const signatureDataUrl = normalizedSignature.startsWith("data:")
      ? normalizedSignature
      : `data:image/png;base64,${normalizedSignature}`;

    // Step 2: Build next signature images map
    const nextSignatureImages: Record<string, string> = {
      ...input.existingSignatureImages,
      [input.signerKey]: signatureDataUrl,
    };

    // Step 3: Render signed PDF with embedded signatures
    const signedPdfBuffer = await this.documentPdfService.renderSignedDocumentToBuffer(
      input.contractHtml,
      nextSignatureImages,
    );

    // Step 4: Calculate SHA-256 hash of the final signed PDF bytes
    // This MUST be calculated from the final PDF bytes to maintain cryptographic integrity
    const signedPdfHash = createHash("sha256").update(signedPdfBuffer).digest("hex");

    // Step 5: Convert signature image to WebP format
    const pngBuffer = Buffer.from(input.signatureImageBase64.trim(), "base64");
    const processedSignature = await this.convertImageToWebP({
      buffer: pngBuffer,
      mimetype: "image/png",
      originalname: `${this.sanitizeSegment(input.signerKey)}.png`,
      size: pngBuffer.length,
    });

    // Return all generated artifacts
    return {
      signedPdfBuffer,
      signedPdfHash,
      signatureImageBuffer: processedSignature.buffer,
      signatureImageMimeType: processedSignature.mimetype,
      signatureImageFilename: processedSignature.originalname,
      nextSignatureImages,
      signatureDataUrl,
    };
  }

  /**
   * Convert image to WebP format
   * 
   * Supports JPEG and PNG input. Returns original if already WebP or PDF.
   * Falls back to original on conversion error.
   * 
   * @param params Image parameters
   * @returns Processed image
   */
  private async convertImageToWebP(params: {
    buffer: Buffer;
    mimetype: string;
    originalname: string;
    size: number;
  }): Promise<{
    buffer: Buffer;
    mimetype: string;
    originalname: string;
    size: number;
  }> {
    // Si es PDF, retornar sin cambios
    if (params.mimetype === "application/pdf") {
      return params;
    }

    // Si ya es WebP, retornar sin cambios
    if (params.mimetype === "image/webp") {
      return params;
    }

    // Convertir JPEG/PNG a WebP
    if (params.mimetype === "image/jpeg" || params.mimetype === "image/png") {
      try {
        // Dynamic import para evitar error de TypeScript con namespace
        const sharpModule = await import("sharp");
        const sharp = sharpModule.default || sharpModule;

        const webpBuffer = await sharp(params.buffer)
          .webp({ quality: 85 }) // 85% calidad para balance entre tamaño y calidad
          .toBuffer();

        // Cambiar la extensión del nombre del archivo
        const nameWithoutExt = params.originalname.replace(/\.(jpe?g|png)$/i, "");
        const newName = `${nameWithoutExt}.webp`;

        return {
          buffer: webpBuffer,
          mimetype: "image/webp",
          originalname: newName,
          size: webpBuffer.length,
        };
      } catch (error) {
        // Si falla la conversión, retornar el archivo original
        console.error("Error convirtiendo imagen a WebP:", error);
        return params;
      }
    }

    // Para otros tipos, retornar sin cambios
    return params;
  }

  /**
   * Sanitize a string for use as a filename segment
   * 
   * Normalizes unicode, removes special characters, converts to lowercase.
   * 
   * @param value String to sanitize
   * @returns Safe filename segment
   */
  private sanitizeSegment(value: string): string {
    const normalized = String(value || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "");

    return normalized || "file";
  }
}
