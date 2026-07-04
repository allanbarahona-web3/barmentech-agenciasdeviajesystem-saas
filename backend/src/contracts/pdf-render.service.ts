import { Injectable } from "@nestjs/common";
import { DocumentPdfService, SignatureAnchor } from "../documents/document-pdf.service";

/**
 * PdfRenderService (Wrapper)
 * 
 * Temporary wrapper that delegates to DocumentPdfService.
 * 
 * Purpose:
 * - Maintain backward compatibility with ContractsService
 * - Keep existing method signatures unchanged
 * - Delegate actual PDF rendering logic to DocumentPdfService
 * 
 * Migration Status:
 * - PDF rendering logic extracted to DocumentPdfService
 * - This wrapper preserves existing integration points
 * - Will remain until ContractsService is fully refactored
 */
@Injectable()
export class PdfRenderService {
  constructor(
    private readonly documentPdfService: DocumentPdfService,
  ) {}

  /**
   * Render a signed contract with signature images embedded
   * 
   * Delegates to DocumentPdfService.renderSignedDocumentToBuffer()
   */
  async renderSignedContractToBuffer(
    standaloneHtml: string,
    signaturesBySigner: Record<string, string>,
  ): Promise<Buffer> {
    return this.documentPdfService.renderSignedDocumentToBuffer(standaloneHtml, signaturesBySigner);
  }

  /**
   * Render an unsigned contract and calculate signature anchor positions
   * 
   * Delegates to DocumentPdfService.renderDocumentToBuffer()
   */
  async renderContractToBuffer(standaloneHtml: string): Promise<{
    pdfBuffer: Buffer;
    signatureAnchors: Record<string, SignatureAnchor>;
  }> {
    return this.documentPdfService.renderDocumentToBuffer(standaloneHtml);
  }
}

// Re-export SignatureAnchor type for backward compatibility
export type { SignatureAnchor };
