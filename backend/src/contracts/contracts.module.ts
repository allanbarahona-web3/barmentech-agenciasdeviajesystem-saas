import { Module } from "@nestjs/common";
import { EmailModule } from "../email/email.module";
import { CustomersModule } from "../customers/customers.module";
import { DocumentsModule } from "../documents/documents.module";
import { StorageModule } from "../storage/storage.module";
import { TravelPricingModule } from "../travel-pricing/travel-pricing.module";
import { TravelPackagesModule } from "../travel-packages/travel-packages.module";
import { FinanceModule } from "../finance/finance.module";
import { ContractsController } from "./contracts.controller";
import { ContractsService } from "./contracts.service";
import { ContractsEmailsService } from "./contracts-emails.service";
import { PdfRenderService } from "./pdf-render.service";
import { ContractSigningSessionBuilder } from "./contract-signing-session.builder";
import { ContractNotesService } from "./notes/contract-notes.service";
import { ContractTravelOperationsReadAdapter } from "./operations-read/contract-travel-operations-read.adapter";
import { ContractCommercialSnapshotReader } from "./contract-commercial-snapshot.reader";
import { OPERATIONAL_PASSENGER_NOTE_READER } from "./operations-read/operational-passenger-note-reader.port";
import { PARTICIPANT_SOURCE_READER } from "./operations-read/participant-source-reader.port";
import { OPERATIONAL_PASSENGER_CONTRACT_CONTEXT_READER } from "./operations-read/operational-passenger-contract-context-reader.port";
import {
  ArchiveProcessingWorker,
  ContractReservationPaymentSubmissionWorker,
  PackageCompletedDispatcher,
  PackageCompletedWorker,
} from "./jobs";

@Module({
  imports: [EmailModule, CustomersModule, DocumentsModule, StorageModule, TravelPricingModule, TravelPackagesModule, FinanceModule],
  controllers: [ContractsController],
  providers: [
    ContractsService,
    ContractsEmailsService,
    PdfRenderService,
    ContractSigningSessionBuilder,
    ContractNotesService,
    ContractCommercialSnapshotReader,
    ContractTravelOperationsReadAdapter,
    { provide: PARTICIPANT_SOURCE_READER, useExisting: ContractTravelOperationsReadAdapter },
    { provide: OPERATIONAL_PASSENGER_NOTE_READER, useExisting: ContractTravelOperationsReadAdapter },
    { provide: OPERATIONAL_PASSENGER_CONTRACT_CONTEXT_READER, useExisting: ContractTravelOperationsReadAdapter },
    ArchiveProcessingWorker,
    ContractReservationPaymentSubmissionWorker,
    PackageCompletedDispatcher,
    PackageCompletedWorker,
  ],
  exports: [
    ContractSigningSessionBuilder,
    ContractCommercialSnapshotReader,
    PARTICIPANT_SOURCE_READER,
    OPERATIONAL_PASSENGER_NOTE_READER,
    OPERATIONAL_PASSENGER_CONTRACT_CONTEXT_READER,
  ],
})
export class ContractsModule {}
