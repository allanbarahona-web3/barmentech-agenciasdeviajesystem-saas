import { Module } from '@nestjs/common';
import { ImmutableBillingArtifactStorageAdapter } from './immutable-billing-artifact-storage.adapter';
import { IMMUTABLE_BILLING_ARTIFACT_STORAGE_PORT } from './immutable-billing-artifact-storage.port';
import { StorageService } from './storage.service';

@Module({
  providers: [
    StorageService,
    ImmutableBillingArtifactStorageAdapter,
    {
      provide: IMMUTABLE_BILLING_ARTIFACT_STORAGE_PORT,
      useExisting: ImmutableBillingArtifactStorageAdapter,
    },
  ],
  exports: [StorageService, ImmutableBillingArtifactStorageAdapter, IMMUTABLE_BILLING_ARTIFACT_STORAGE_PORT],
})
export class StorageModule {}
