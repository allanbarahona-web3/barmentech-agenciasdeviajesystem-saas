import { Module, forwardRef } from "@nestjs/common";
import { BillingModule } from "../billing/billing.module";
import { EmailModule } from "../email/email.module";
import { StorageModule } from "../storage/storage.module";
import { DocumentsService } from "./documents.service";
import { DocumentEmailsService } from "./document-emails.service";
import { DocumentPdfService } from "./document-pdf.service";
import { DocumentSigningService } from "./document-signing.service";
import { DocumentSigningAuditService } from "./document-signing-audit.service";
import { DocumentSignatureFinalizationService } from "./document-signature-finalization.service";
import { DocumentDeliveryService } from "./document-delivery.service";
import { DocumentSigningSessionService } from "./document-signing-session.service";
import { DocumentPackageService } from "./document-package.service";
import { DocumentGenerationService } from "./document-generation.service";
import {
  EventsModule,
  PackageCompletedBillingHandler,
  PackageCompletedDeliveryHandler,
} from "../common/events";

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
 * - DocumentDeliveryService: Extracted signed document delivery logic from ContractsModule
 * - DocumentsService: Empty foundation ready for additional extractions
 * 
 * Capabilities:
 * - Document email workflows (PDF attachment, signing links, signed confirmations)
 * - Document PDF rendering (unsigned with signature anchors, signed with images)
 * - Document signing tokens (generation, validation, HMAC security)
 * - Document signing audit (token replay prevention, signature event recording)
 * - Document signature finalization (PDF generation, hash calculation, image processing)
 * - Document delivery (recipient resolution, signed document distribution)
 * - Document generation from templates (CONTRACT, MINOR_ANNEX, LIABILITY_WAIVER)
 * 
 * Future Capabilities (to be extracted incrementally):
 * - Signature session management
 * - Archive and retrieval
 */
@Module({
  imports: [
    EmailModule,
    BillingModule,
    StorageModule,
    EventsModule,
    forwardRef(() => require("../contracts/contracts.module").ContractsModule),
  ],
  providers: [
    // Subscription order is significant: billing must finish before delivery.
    PackageCompletedBillingHandler,
    PackageCompletedDeliveryHandler,
    DocumentsService,
    DocumentEmailsService,
    DocumentPdfService,
    DocumentSigningService,
    DocumentSigningAuditService,
    DocumentSignatureFinalizationService,
    DocumentDeliveryService,
    DocumentSigningSessionService,
    DocumentPackageService,
    DocumentGenerationService,
  ],
  exports: [
    DocumentsService,
    DocumentEmailsService,
    DocumentPdfService,
    DocumentSigningService,
    DocumentSigningAuditService,
    DocumentSignatureFinalizationService,
    DocumentDeliveryService,
    DocumentSigningSessionService,
    DocumentPackageService,
    DocumentGenerationService,
  ],
})
export class DocumentsModule {}
