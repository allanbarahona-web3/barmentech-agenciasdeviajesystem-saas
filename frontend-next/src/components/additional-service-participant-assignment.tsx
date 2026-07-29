'use client';

import { useState } from 'react';
import { ConfirmModal } from '@/components/confirm-modal';
import { AdditionalServicesOperationalNotes } from '@/components/additional-services-context-header';
import {
  getAdditionalServicesWorkflowContext,
  type AdditionalServicesContextParticipant,
} from '@/lib/additional-services-temporary-store';
import styles from './additional-service-participant-assignment.module.css';

export function useAdditionalServiceParticipantAssignment(
  editingParticipantId?: string,
) {
  const [participants] = useState(() => {
    const context = getAdditionalServicesWorkflowContext();
    return context?.selectedParticipants ?? [];
  });
  const [selectedParticipantIds, setSelectedParticipantIds] = useState<
    string[]
  >(() => (editingParticipantId ? [editingParticipantId] : []));
  const [validationError, setValidationError] = useState<string | null>(null);

  function toggleParticipant(participantId: string) {
    setSelectedParticipantIds((current) =>
      current.includes(participantId)
        ? current.filter((currentId) => currentId !== participantId)
        : [...current, participantId],
    );
    setValidationError(null);
  }

  function validateSelection() {
    if (selectedParticipantIds.length > 0) {
      return true;
    }

    setValidationError(
      'Seleccione al menos un participante al que aplica el servicio.',
    );
    return false;
  }

  return {
    participants,
    selectedParticipantIds,
    validationError,
    toggleParticipant,
    validateSelection,
  };
}

type ParticipantAssignment = ReturnType<
  typeof useAdditionalServiceParticipantAssignment
>;

export function AdditionalServiceParticipantAssignment({
  assignment,
  readOnly = false,
}: {
  assignment: ParticipantAssignment;
  readOnly?: boolean;
}) {
  const [notesParticipant, setNotesParticipant] =
    useState<AdditionalServicesContextParticipant | null>(null);

  return (
    <>
      <fieldset className={styles.assignment}>
        <legend className={styles.title}>Aplica a</legend>
        <div className={styles.participants}>
          {assignment.participants.map((participant) => {
            const hasNotes = participant.operationalNotes.length > 0;

            return (
              <div className={styles.participant} key={participant.participantId}>
                <label className={styles.participantLabel}>
                  <input
                    type="checkbox"
                    checked={assignment.selectedParticipantIds.includes(
                      participant.participantId,
                    )}
                    disabled={readOnly}
                    onChange={() =>
                      assignment.toggleParticipant(participant.participantId)
                    }
                  />
                  <span>{participant.fullName}</span>
                </label>
                {hasNotes ? (
                  <button
                    type="button"
                    className={styles.notesButton}
                    onClick={() => setNotesParticipant(participant)}
                  >
                    Ver nota operativa
                  </button>
                ) : (
                  <span className={styles.noNotes}>
                    No tiene nota operativa
                  </span>
                )}
              </div>
            );
          })}
        </div>
        {assignment.validationError && (
          <p className={styles.error} role="alert">
            {assignment.validationError}
          </p>
        )}
      </fieldset>

      <ConfirmModal
        isOpen={notesParticipant !== null}
        title={`Notas operativas — ${notesParticipant?.fullName ?? ''}`}
        message={
          notesParticipant && (
            <AdditionalServicesOperationalNotes
              participants={[notesParticipant]}
            />
          )
        }
        confirmText="Cerrar"
        showCancel={false}
        onConfirm={() => setNotesParticipant(null)}
        onCancel={() => setNotesParticipant(null)}
      />
    </>
  );
}
