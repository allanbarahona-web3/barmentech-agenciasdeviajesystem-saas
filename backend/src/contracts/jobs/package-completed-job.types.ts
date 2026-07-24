export interface PackageCompletedJobPayload {
  contractId: string;
  documentSigningSessionId: string;
  tenantId: string;
  correlationId: string;
  actorUserId: string;
  completedAt: string;
  eventVersion: number;
}
