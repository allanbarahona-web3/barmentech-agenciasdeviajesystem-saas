import { Module } from "@nestjs/common";
import { StorageModule } from "../storage/storage.module";
import { GeneratedDocumentsService } from "./generated-documents.service";
import {
  GENERATED_DOCUMENTS_REPOSITORY,
} from "./generated-documents.repository.interface";
import { PrismaGeneratedDocumentsRepository } from "./prisma-generated-documents.repository";
import { GeneratedDocumentAccessService } from "./generated-document-access.service";

@Module({
  imports: [StorageModule],
  providers: [
    PrismaGeneratedDocumentsRepository,
    {
      provide: GENERATED_DOCUMENTS_REPOSITORY,
      useExisting: PrismaGeneratedDocumentsRepository,
    },
    GeneratedDocumentsService,
    GeneratedDocumentAccessService,
  ],
  exports: [
    GeneratedDocumentsService,
    GeneratedDocumentAccessService,
    GENERATED_DOCUMENTS_REPOSITORY,
  ],
})
export class GeneratedDocumentsModule {}
