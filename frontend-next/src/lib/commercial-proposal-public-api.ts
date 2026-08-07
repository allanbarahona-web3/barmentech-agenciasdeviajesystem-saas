import { fetchApi } from '@/lib/api-client';

export interface PublicCommercialProposal {
  proposalNumber: string;
  commercialStatus: string | null;
  company: { name: string; logoUrl: string | null };
  document: {
    fileName: string;
    mimeType: string;
    size: number;
    url: string;
    expiresInSeconds: number;
  };
}

export interface PublicCommercialProposalApproval {
  proposalNumber: string;
  commercialStatus: 'APPROVED';
  approvedAt: string;
}

async function readResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.message || 'El enlace no es válido o ha vencido.');
  }
  return response.json();
}

export async function getPublicCommercialProposal(token: string) {
  const response = await fetchApi(
    `/public/commercial-proposals/${encodeURIComponent(token)}`,
    { method: 'GET' },
  );
  return readResponse<PublicCommercialProposal>(response);
}

export async function approvePublicCommercialProposal(token: string) {
  const response = await fetchApi(
    `/public/commercial-proposals/${encodeURIComponent(token)}/approve`,
    { method: 'POST' },
  );
  return readResponse<PublicCommercialProposalApproval>(response);
}
