export interface ReceiptProcessingJobPayload {
  paymentId: string;
  actor: {
    id: string;
    email: string;
    fullName: string;
  };
  sourceIp?: string | null;
  userAgent?: string | null;
}
