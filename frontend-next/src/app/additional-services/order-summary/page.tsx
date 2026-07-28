'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Eye } from 'lucide-react';
import { AdditionalServicesContextHeader } from '@/components/additional-services-context-header';
import { ConfirmModal } from '@/components/confirm-modal';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  getAdditionalServicesWorkflowContext,
  getTemporaryAdditionalServiceLineId,
  getTemporaryAdditionalServiceLines,
  removeTemporaryAdditionalServiceLine,
  startEditingTemporaryAdditionalServiceLine,
  type TemporaryAdditionalServiceLine,
} from '@/lib/additional-services-temporary-store';
import {
  getAdditionalServiceFormRoute,
  getAdditionalServiceName,
  getAdditionalServiceSummary,
} from '@/shared/additional-services';
import styles from './order-summary.module.css';

export default function AdditionalServicesOrderSummaryPage() {
  const router = useRouter();
  const [lines, setLines] = useState(() =>
    getTemporaryAdditionalServiceLines(),
  );
  const [notesLine, setNotesLine] =
    useState<TemporaryAdditionalServiceLine | null>(null);
  const [participantNames] = useState(() => {
    const context = getAdditionalServicesWorkflowContext();
    return new Map(
      context?.selectedParticipants.map((participant) => [
        participant.participantId,
        participant.fullName,
      ]) ?? [],
    );
  });

  function editLine(line: TemporaryAdditionalServiceLine) {
    startEditingTemporaryAdditionalServiceLine(line);
    router.push(getAdditionalServiceFormRoute(line));
  }

  function removeLine(line: TemporaryAdditionalServiceLine) {
    removeTemporaryAdditionalServiceLine(line);
    setLines(getTemporaryAdditionalServiceLines());
  }

  return (
    <main className="app-shell">
      <div className={styles.page}>
        <AdditionalServicesContextHeader />
        <header className={styles.header}>
          <h1 className={styles.title}>Resumen de la orden</h1>
          <p className={styles.subtitle}>
            Revise los servicios adicionales antes de continuar.
          </p>
        </header>

        <section className="form-section-card" style={{ marginTop: 0 }}>
          {lines.length === 0 ? (
            <p className={styles.empty}>No hay servicios en la orden temporal.</p>
          ) : (
            <Table className={styles.table}>
              <TableHeader className={styles.tableHeader}>
                <TableRow className={styles.headerRow}>
                  <TableHead className={styles.tableHead}>Participante</TableHead>
                  <TableHead className={styles.tableHead}>Servicio</TableHead>
                  <TableHead className={styles.tableHead}>Resumen</TableHead>
                  <TableHead className={styles.actionHead}>
                    Observaciones
                  </TableHead>
                  <TableHead className={styles.actionHead}>Editar</TableHead>
                  <TableHead className={styles.actionHead}>Eliminar</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className={styles.tableBody}>
                {lines.map((line) => (
                  <TableRow
                    className={styles.tableRow}
                    key={getTemporaryAdditionalServiceLineId(line)}
                  >
                    <TableCell
                      className={styles.participantCell}
                      data-label="Participante"
                    >
                      {participantNames.get(line.participantId) ??
                        line.participantId}
                    </TableCell>
                    <TableCell
                      className={styles.serviceCell}
                      data-label="Servicio"
                    >
                      {getAdditionalServiceName(line)}
                    </TableCell>
                    <TableCell
                      className={styles.summaryCell}
                      data-label="Resumen"
                    >
                      {getAdditionalServiceSummary(line)}
                    </TableCell>
                    <TableCell
                      className={styles.actionCell}
                      data-label="Observaciones"
                    >
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className={styles.notesButton}
                        onClick={() => setNotesLine(line)}
                        aria-label={`Ver observaciones de ${getAdditionalServiceName(line)}`}
                        title="Ver observaciones"
                      >
                        <Eye aria-hidden="true" />
                      </Button>
                    </TableCell>
                    <TableCell
                      className={styles.actionCell}
                      data-label="Editar"
                    >
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className={styles.editButton}
                        onClick={() => editLine(line)}
                      >
                        Editar
                      </Button>
                    </TableCell>
                    <TableCell
                      className={styles.actionCell}
                      data-label="Eliminar"
                    >
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        className={styles.removeButton}
                        onClick={() => removeLine(line)}
                      >
                        Eliminar
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          <div className={styles.actions}>
            <Button
              asChild
              variant="outline"
              className={styles.backButton}
            >
              <Link href="/additional-services/catalog">Volver al catálogo</Link>
            </Button>
            <Button
              type="button"
              className={styles.continueButton}
              disabled
              title="Próximamente"
            >
              Continuar
            </Button>
          </div>
        </section>

        <ConfirmModal
          isOpen={notesLine !== null}
          title="Observaciones del servicio"
          message={
            notesLine ? (
              <div className={styles.notesDetail}>
                <dl className={styles.notesContext}>
                  <div>
                    <dt>Participante</dt>
                    <dd>
                      {participantNames.get(notesLine.participantId) ??
                        notesLine.participantId}
                    </dd>
                  </div>
                  <div>
                    <dt>Servicio</dt>
                    <dd>{getAdditionalServiceName(notesLine)}</dd>
                  </div>
                </dl>
                <div className={styles.notesText}>
                  {notesLine.notes.trim() || 'Sin observaciones.'}
                </div>
              </div>
            ) : null
          }
          confirmText="Cerrar"
          showCancel={false}
          onConfirm={() => setNotesLine(null)}
          onCancel={() => setNotesLine(null)}
        />
      </div>
    </main>
  );
}
