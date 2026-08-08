'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Check, CheckCircle2, FileText, LoaderCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  approvePublicCommercialProposal,
  getPublicCommercialProposal,
  type PublicCommercialProposal,
} from '@/lib/commercial-proposal-public-api';
import styles from './proposal-approval.module.css';

export default function CommercialProposalApprovalPage() {
  const { token } = useParams<{ token: string }>();
  const [proposal, setProposal] = useState<PublicCommercialProposal | null>(null);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState(false);
  const [approved, setApproved] = useState(false);
  const [finished, setFinished] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getPublicCommercialProposal(token)
      .then((value) => {
        if (!cancelled) setProposal(value);
      })
      .catch((requestError) => {
        if (!cancelled) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : 'No se pudo abrir la propuesta.',
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function approve() {
    if (approving || approved) return;
    setApproving(true);
    setError(null);
    try {
      await approvePublicCommercialProposal(token);
      setApproved(true);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'No se pudo aprobar la propuesta.',
      );
    } finally {
      setApproving(false);
    }
  }

  function closeApproval() {
    window.close();
    window.setTimeout(() => setFinished(true), 150);
  }

  if (loading) {
    return (
      <main className={styles.centerState}>
        <LoaderCircle className={styles.spin} aria-hidden="true" />
        <p>Cargando propuesta...</p>
      </main>
    );
  }

  if (!proposal) {
    return (
      <main className={styles.centerState}>
        <FileText aria-hidden="true" />
        <h1>Propuesta no disponible</h1>
        <p>{error ?? 'El enlace no es válido o ha vencido.'}</p>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.brand}>
          {proposal.company.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={proposal.company.logoUrl} alt={proposal.company.name} />
          ) : (
            <FileText aria-hidden="true" />
          )}
          <div>
            <p>{proposal.company.name}</p>
            <h1>Propuesta {proposal.proposalNumber}</h1>
          </div>
        </div>
        {!approved && (
          <Button type="button" onClick={approve} disabled={approving}>
            {approving ? (
              <LoaderCircle className={styles.spin} aria-hidden="true" />
            ) : (
              <Check aria-hidden="true" />
            )}
            {approving ? 'Aprobando...' : 'Aceptar propuesta'}
          </Button>
        )}
      </header>

      {approved && finished ? (
        <section className={styles.success} role="status">
          <CheckCircle2 aria-hidden="true" />
          <h2>Proceso finalizado</h2>
          <p>Puede cerrar esta pestaña.</p>
        </section>
      ) : approved ? (
        <section className={styles.success} role="status">
          <CheckCircle2 aria-hidden="true" />
          <h2>Propuesta aprobada</h2>
          <p>La cotización fue aprobada correctamente.</p>
          <Button type="button" onClick={closeApproval}>
            Cerrar
          </Button>
        </section>
      ) : (
        <section className={styles.viewer} aria-label="Documento de propuesta">
          <iframe src={proposal.document.url} title="Propuesta comercial PDF" />
        </section>
      )}

      {error && proposal && (
        <p className={styles.error} role="alert">{error}</p>
      )}
    </main>
  );
}
