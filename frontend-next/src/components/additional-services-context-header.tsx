'use client';

import { useState } from 'react';
import { ClipboardList, Copy } from 'lucide-react';
import { ConfirmModal } from '@/components/confirm-modal';
import { getAdditionalServicesWorkflowContext } from '@/lib/additional-services-temporary-store';
import styles from './additional-services-context-header.module.css';

export function ContractReference({
  contractNumber,
}: {
  contractNumber: string | null;
}) {
  const [copied, setCopied] = useState(false);

  async function copyContractNumber() {
    if (!contractNumber) return;

    await navigator.clipboard.writeText(contractNumber);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className={styles.contract}>
      <span>
        📄 Contrato: <strong>{contractNumber ?? 'No disponible'}</strong>
      </span>
      {contractNumber && (
        <button
          type="button"
          className={styles.copyButton}
          onClick={copyContractNumber}
          aria-label={`Copiar contrato ${contractNumber}`}
          title={copied ? 'Copiado' : 'Copiar número de contrato'}
        >
          <Copy className={styles.copyIcon} aria-hidden="true" />
        </button>
      )}
      {copied && <small>Copiado</small>}
    </div>
  );
}

export function AdditionalServicesContextHeader() {
  const [context] = useState(() => getAdditionalServicesWorkflowContext());
  const [notesOpen, setNotesOpen] = useState(false);

  if (!context) {
    return null;
  }

  return (
    <>
      <section className={styles.context} aria-label="Contexto del viaje">
        <div>
          <h2 className={styles.travelName}>{context.travelName}</h2>
          <ContractReference contractNumber={context.contractNumber} />
          <div className={styles.participantContext}>
            <span className={styles.participantLabel}>
              {context.selectedParticipants.length === 1
                ? 'Participante'
                : 'Participantes'}
            </span>
            <div className={styles.participantNames}>
              {context.selectedParticipants.map((participant) => (
                <span
                  className={styles.selectedParticipantName}
                  key={participant.participantId}
                >
                  {participant.fullName}
                </span>
              ))}
            </div>
          </div>
        </div>
        <button
          type="button"
          className={`btn-secondary ${styles.notesButton}`}
          onClick={() => setNotesOpen(true)}
        >
          <ClipboardList className={styles.notesIcon} aria-hidden="true" />
          Ver Notas Operativas
        </button>
      </section>

      <ConfirmModal
        isOpen={notesOpen}
        title="Notas operativas"
        message={
          <div className={styles.notesList}>
            {context.selectedParticipants.map((participant) => (
              <section
                className={styles.participant}
                key={participant.participantId}
              >
                <h3 className={styles.participantName}>
                  {participant.fullName}
                </h3>
                {participant.operationalNotes.length > 0 ? (
                  <ul className={styles.noteItems}>
                    {participant.operationalNotes.map((note, index) => (
                      <li key={`${participant.participantId}:${index}`}>
                        {note}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className={styles.empty}>No tiene notas operativas.</p>
                )}
              </section>
            ))}
          </div>
        }
        confirmText="Cerrar"
        showCancel={false}
        onConfirm={() => setNotesOpen(false)}
        onCancel={() => setNotesOpen(false)}
      />
    </>
  );
}
