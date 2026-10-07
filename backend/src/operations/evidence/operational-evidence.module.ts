import { Module } from "@nestjs/common";
import { StorageModule } from "../../storage/storage.module";
import { OperationalEvidenceController } from "./operational-evidence.controller";
import { OperationalStandaloneEvidenceController } from "./operational-standalone-evidence.controller";
import { OperationalEvidenceService } from "./operational-evidence.service";

@Module({ imports: [StorageModule], controllers: [OperationalEvidenceController, OperationalStandaloneEvidenceController], providers: [OperationalEvidenceService] })
export class OperationalEvidenceModule {}
