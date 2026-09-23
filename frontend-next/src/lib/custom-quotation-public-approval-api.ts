import { resolveApiBase } from '@/lib/runtime-config';

export type PublicCustomQuotationApprovalStatus = 'ISSUED' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED' | 'CANCELLED';

export type PublicCustomQuotationApprovalProposal = {
  quotationNumber: string;
  versionNumber: number;
  title: string | null;
  recipientFullName: string;
  tenant: { name: string; logoUrl: string | null };
  lines: Array<{ displayOrder: number; description: string; quantity: string; commercialNote: string | null }>;
  currency: string;
  finalSellingPrice: string;
  quotationValidUntil: string | null;
  paymentConditionType: 'CASH' | 'CREDIT' | null;
  paymentTermValue: number | null;
  paymentTermUnit: 'DAYS' | 'MONTHS' | null;
  commercialObservations: string | null;
  status: PublicCustomQuotationApprovalStatus;
  document: { fileName: string; mimeType: string; size: number; url: string; expiresInSeconds: number };
};

export type PublicCustomQuotationApprovalTransition = {
  status: Extract<PublicCustomQuotationApprovalStatus, 'ACCEPTED' | 'REJECTED'>;
};

async function publicRequest<T>(path: string, method: 'GET' | 'POST'): Promise<T> {
  const response = await fetch(`${resolveApiBase()}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { message?: string } | null;
    throw new Error(body?.message || 'CUSTOM_QUOTATION_PUBLIC_APPROVAL_UNAVAILABLE');
  }
  return response.json();
}

const publicApprovalPath = (token: string) => `/public/custom-quotation-approval/${encodeURIComponent(token)}`;

export const getPublicCustomQuotationApproval = (token: string) =>
  publicRequest<PublicCustomQuotationApprovalProposal>(publicApprovalPath(token), 'GET');

export const acceptPublicCustomQuotation = (token: string) =>
  publicRequest<PublicCustomQuotationApprovalTransition>(`${publicApprovalPath(token)}/accept`, 'POST');

export const rejectPublicCustomQuotation = (token: string) =>
  publicRequest<PublicCustomQuotationApprovalTransition>(`${publicApprovalPath(token)}/reject`, 'POST');
