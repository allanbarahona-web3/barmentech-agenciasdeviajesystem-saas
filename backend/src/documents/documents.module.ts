import { Module } from "@nestjs/common";
import { EmailModule } from "../email/email.module";
import { DocumentsService } from "./documents.service";
import { DocumentEmailsService } from "./document-emails.service";

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
 * - DocumentsService: Empty foundation ready for additional extractions
 * 
 * Capabilities:
 * - Document email workflows (PDF attachment, signing links, signed confirmations)
 * 
 * Future Capabilities (to be extracted incrementally):
 * - Document generation
 * - Signature workflows
 * - Template management
 * - Archive and retrieval
 */
@Module({
  imports: [EmailModule],
  providers: [DocumentsService, DocumentEmailsService],
  exports: [DocumentsService, DocumentEmailsService],
})
export class DocumentsModule {}
