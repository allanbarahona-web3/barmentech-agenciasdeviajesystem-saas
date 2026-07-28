'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye } from 'lucide-react';
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
  getTemporaryAdditionalServiceLineSourcing,
  getTemporaryAdditionalServiceLines,
  removeTemporaryAdditionalServiceLine,
  startEditingTemporaryAdditionalServiceLine,
  updateTemporaryAdditionalServiceLineSourcing,
  type TemporaryAdditionalServiceLine,
  type TemporaryLineCurrency,
} from '@/lib/additional-services-temporary-store';
import {
  getAdditionalServiceFormRoute,
  getAdditionalServiceName,
  getAdditionalServiceSummary,
} from '@/shared/additional-services';
import styles from '@/app/additional-services/order-summary/order-summary.module.css';

const PLACEHOLDER_SUPPLIERS = [
  { value: 'TEMPORARY_SUPPLIER_A', label: 'Proveedor temporal A' },
  { value: 'TEMPORARY_SUPPLIER_B', label: 'Proveedor temporal B' },
] as const;

function CommercialFields({ line }: { line: TemporaryAdditionalServiceLine }) {
  const [sourcing, setSourcing] = useState(() =>
    getTemporaryAdditionalServiceLineSourcing(line),
  );

  function updateSourcing(
    changes: Parameters<
      typeof updateTemporaryAdditionalServiceLineSourcing
    >[1],
  ) {
    updateTemporaryAdditionalServiceLineSourcing(line, changes);
    setSourcing((current) => ({ ...current, ...changes }));
  }

  return (
    <>
      <TableCell className={styles.commercialCell} data-label="Proveedor">
        <select
          className={styles.commercialInput}
          value={sourcing.supplierId ?? ''}
          required
          aria-label="Proveedor"
          onChange={(event) =>
            updateSourcing({ supplierId: event.target.value || null })
          }
        >
          <option value="">Seleccionar</option>
          {PLACEHOLDER_SUPPLIERS.map((supplier) => (
            <option key={supplier.value} value={supplier.value}>
              {supplier.label}
            </option>
          ))}
        </select>
      </TableCell>
      <TableCell className={styles.urlCell} data-label="URL del proveedor">
        <input
          className={styles.commercialInput}
          type="text"
          value={sourcing.providerUrl}
          aria-label="URL del proveedor"
          placeholder="https://"
          onChange={(event) =>
            updateSourcing({ providerUrl: event.target.value })
          }
        />
      </TableCell>
      <TableCell className={styles.costCell} data-label="Costo">
        <input
          className={styles.commercialInput}
          type="number"
          min="0"
          step="0.01"
          value={sourcing.cost ?? ''}
          required
          aria-label="Costo"
          onChange={(event) =>
            updateSourcing({
              cost: event.target.value === '' ? null : Number(event.target.value),
            })
          }
        />
      </TableCell>
      <TableCell className={styles.currencyCell} data-label="Moneda">
        <select
          className={styles.commercialInput}
          value={sourcing.currency ?? ''}
          required
          aria-label="Moneda"
          onChange={(event) =>
            updateSourcing({
              currency:
                (event.target.value as TemporaryLineCurrency) || null,
            })
          }
        >
          <option value="">Seleccionar</option>
          <option value="USD">USD</option>
          <option value="CRC">CRC</option>
        </select>
      </TableCell>
    </>
  );
}

export function AdditionalServicesLinesTable({
  mode,
}: {
  mode: 'summary' | 'pricing';
}) {
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
    startEditingTemporaryAdditionalServiceLine(
      line,
      mode === 'pricing'
        ? '/additional-services/pricing'
        : '/additional-services/order-summary',
    );
    router.push(getAdditionalServiceFormRoute(line));
  }

  function removeLine(line: TemporaryAdditionalServiceLine) {
    removeTemporaryAdditionalServiceLine(line);
    setLines(getTemporaryAdditionalServiceLines());
  }

  return (
    <>
      {lines.length === 0 ? (
        <p className={styles.empty}>No hay servicios en la orden temporal.</p>
      ) : (
        <Table
          className={`${styles.table} ${
            mode === 'pricing' ? styles.pricingTable : styles.summaryTable
          }`}
        >
          <TableHeader className={styles.tableHeader}>
            <TableRow className={styles.headerRow}>
              <TableHead className={styles.tableHead}>Participante</TableHead>
              <TableHead className={styles.tableHead}>Servicio</TableHead>
              {mode === 'summary' && (
                <TableHead className={styles.tableHead}>Resumen</TableHead>
              )}
              <TableHead className={styles.actionHead}>Observaciones</TableHead>
              {mode === 'pricing' && (
                <>
                  <TableHead className={styles.tableHead}>
                    Proveedor <span aria-hidden="true">*</span>
                  </TableHead>
                  <TableHead className={styles.tableHead}>
                    URL del proveedor
                  </TableHead>
                  <TableHead className={styles.tableHead}>
                    Costo <span aria-hidden="true">*</span>
                  </TableHead>
                  <TableHead className={styles.tableHead}>
                    Moneda <span aria-hidden="true">*</span>
                  </TableHead>
                </>
              )}
              <TableHead className={styles.actionHead}>Editar</TableHead>
              {mode === 'summary' && (
                <TableHead className={styles.actionHead}>Eliminar</TableHead>
              )}
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
                <TableCell className={styles.serviceCell} data-label="Servicio">
                  {getAdditionalServiceName(line)}
                </TableCell>
                {mode === 'summary' && (
                  <TableCell
                    className={styles.summaryCell}
                    data-label="Resumen"
                  >
                    {getAdditionalServiceSummary(line)}
                  </TableCell>
                )}
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
                {mode === 'pricing' && <CommercialFields line={line} />}
                <TableCell className={styles.actionCell} data-label="Editar">
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
                {mode === 'summary' && (
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
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

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
    </>
  );
}
