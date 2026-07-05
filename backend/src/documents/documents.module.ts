import { Module } from "@nestjs/common";
import { EmailModule } from "../email/email.module";
import { DocumentsService } from "./documents.service";
import { DocumentEmailsService } from "./document-emails.service";
import { DocumentPdfService } from "./document-pdf.service";
import { DocumentSigningService } from "./document-signing.service";
import { DocumentSigningAuditService } from "./document-signing-audit.service";
import { DocumentSignatureFinalizationService } from "./document-signature-finalization.service";

/**
 * DocumentsModule
 * 
 * Foundation module for the generic Document Framework.
 * 
 * Purpose:
 * - Provide reusable document lifecycle capabilities
 * - Support contracts, authorizations, waivers, and future legal documents
 * 
 * Current State:
 * - DocumentEmailsService: Extracted email-sending logic from ContractsModule
 * - DocumentPdfService: Extracted PDF rendering logic from ContractsModule
 * - DocumentSigningService: Extracted signing token logic from ContractsModule
 * - DocumentSigningAuditService: Extracted signing audit logic from ContractsModule
 * - DocumentSignatureFinalizationService: Extracted signature finalization logic from ContractsModule
 * - DocumentsService: Empty foundation ready for additional extractions
 * 
 * Capabilities:
 * - Document email workflows (PDF attachment, signing links, signed confirmations)
 * - Document PDF rendering (unsigned with signature anchors, signed with images)
 * - Document signing tokens (generation, validation, HMAC security)
 * - Document signing audit (token replay prevention, signature event recording)
 * - Document signature finalization (PDF generation, hash calculation, image processing)
 * 
 * Future Capabilities (to be extracted incrementally):
 * - Document generation from templates
 * - Signature session management
 * - Archive and retrieval
 */
@Module({
  imports: [EmailModule],
  providers: [
    DocumentsService,
    DocumentEmailsService,
    DocumentPdfService,
    DocumentSigningService,
    DocumentSigningAuditService,
    DocumentSignatureFinalizationService,
  ],
  exports: [
    DocumentsService,
    DocumentEmailsService,
    DocumentPdfService,
    DocumentSigningService,
    DocumentSigningAuditService,
    DocumentSignatureFinalizationService,
  ],
})
export class DocumentsModule {}
