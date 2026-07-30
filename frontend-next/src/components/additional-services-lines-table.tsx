'use client';

import { useEffect, useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { Eye } from 'lucide-react';
import { ConfirmModal } from '@/components/confirm-modal';
import { HelpTooltip } from '@/components/help-tooltip';
import { Button } from '@/components/ui/button';
import {
  getAdditionalServiceSuppliers,
  requestNewAdditionalServiceSupplier,
  type AdditionalServiceSupplier,
} from '@/lib/additional-services-admin-api';
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

const REQUEST_NEW_SUPPLIER_VALUE = '__REQUEST_NEW_SUPPLIER__';
const SUPPLIER_REQUESTS_ENABLED =
  process.env.NEXT_PUBLIC_SUPPLIER_REQUESTS_ENABLED === 'true';

function normalizeOptionalWebsite(value: string) {
  const website = value.trim();
  if (!website) {
    return undefined;
  }

  return /^https?:\/\//i.test(website) ? website : `https://${website}`;
}

function CommercialFields({
  line,
  suppliers,
  suppliersLoading,
  suppliersError,
  travelType,
}: {
  line: TemporaryAdditionalServiceLine;
  suppliers: AdditionalServiceSupplier[];
  suppliersLoading: boolean;
  suppliersError: string | null;
  travelType: 'INTERNATIONAL' | 'INTERNAL' | null;
}) {
  const requestFieldId = useId();
  const [sourcing, setSourcing] = useState(() =>
    getTemporaryAdditionalServiceLineSourcing(line),
  );
  const [requestModalOpen, setRequestModalOpen] = useState(false);
  const [requestComingSoonOpen, setRequestComingSoonOpen] = useState(false);
  const [requestedSupplierName, setRequestedSupplierName] = useState('');
  const [requestedSupplierWebsite, setRequestedSupplierWebsite] = useState('');
  const [requestNotes, setRequestNotes] = useState('');
  const [requestError, setRequestError] = useState('');
  const [requesting, setRequesting] = useState(false);

  function updateSourcing(
    changes: Parameters<
      typeof updateTemporaryAdditionalServiceLineSourcing
    >[1],
  ) {
    updateTemporaryAdditionalServiceLineSourcing(line, changes);
    setSourcing((current) => ({ ...current, ...changes }));
  }

  function closeRequestModal() {
    if (requesting) {
      return;
    }

    setRequestModalOpen(false);
    setRequestedSupplierName('');
    setRequestedSupplierWebsite('');
    setRequestNotes('');
    setRequestError('');
  }

  async function submitSupplierRequest() {
    if (!SUPPLIER_REQUESTS_ENABLED || requesting) {
      return;
    }

    const supplierName = requestedSupplierName.trim();
    if (!supplierName) {
      setRequestError('El nombre del proveedor es obligatorio.');
      return;
    }
    if (!travelType) {
      setRequestError('No se pudo determinar el tipo de viaje actual.');
      return;
    }

    setRequesting(true);
    setRequestError('');

    try {
      await requestNewAdditionalServiceSupplier({
        supplierName,
        website: normalizeOptionalWebsite(requestedSupplierWebsite),
        notes: requestNotes.trim() || undefined,
        travelType,
        additionalService: getAdditionalServiceName(line),
      });
      setRequestModalOpen(false);
      setRequestedSupplierName('');
      setRequestedSupplierWebsite('');
      setRequestNotes('');
    } catch (error) {
      setRequestError(
        error instanceof Error
          ? error.message
          : 'No se pudo enviar la solicitud del proveedor.',
      );
    } finally {
      setRequesting(false);
    }
  }

  return (
    <>
      <TableCell className={styles.commercialCell} data-label="Proveedor">
        <select
          className={styles.commercialInput}
          value={sourcing.supplierId ?? ''}
          required
          aria-label="Proveedor"
          disabled={suppliersLoading || Boolean(suppliersError)}
          onChange={(event) => {
            if (event.target.value === REQUEST_NEW_SUPPLIER_VALUE) {
              if (SUPPLIER_REQUESTS_ENABLED) {
                setRequestModalOpen(true);
              } else {
                setRequestComingSoonOpen(true);
              }
              return;
            }

            updateSourcing({ supplierId: event.target.value || null });
          }}
        >
          <option value="">
            {suppliersLoading
              ? 'Cargando...'
              : suppliersError
                ? 'No disponible'
                : 'Seleccionar'}
          </option>
          {suppliers.map((supplier) => (
            <option key={supplier.id} value={supplier.id}>
              {supplier.name}
            </option>
          ))}
          <option disabled>────────────────</option>
          <option value={REQUEST_NEW_SUPPLIER_VALUE}>
            Solicitar nuevo proveedor
          </option>
        </select>
      </TableCell>
      <TableCell className={styles.urlCell} data-label="URL del costo">
        <input
          className={styles.commercialInput}
          type="url"
          inputMode="url"
          value={sourcing.providerUrl}
          aria-label="URL del costo"
          placeholder="https://proveedor.com/costo"
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
      {typeof document !== 'undefined'
        ? createPortal(
            <ConfirmModal
        isOpen={SUPPLIER_REQUESTS_ENABLED && requestModalOpen}
        title="Solicitar nuevo proveedor"
        message={
          <form
            className="space-y-4 text-left"
            onSubmit={(event) => {
              event.preventDefault();
              void submitSupplierRequest();
            }}
          >
            <div>
              <label
                htmlFor={`${requestFieldId}-name`}
                className="mb-1 block text-sm font-medium text-slate-700"
              >
                Nombre del proveedor <span className="text-red-600">*</span>
              </label>
              <input
                id={`${requestFieldId}-name`}
                type="text"
                autoFocus
                required
                value={requestedSupplierName}
                disabled={requesting}
                onChange={(event) => {
                  setRequestedSupplierName(event.target.value);
                  setRequestError('');
                }}
                className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
              />
            </div>
            <div>
              <label
                htmlFor={`${requestFieldId}-website`}
                className="mb-1 block text-sm font-medium text-slate-700"
              >
                Sitio web
              </label>
              <input
                id={`${requestFieldId}-website`}
                type="text"
                inputMode="url"
                placeholder="https://example.com"
                value={requestedSupplierWebsite}
                disabled={requesting}
                onChange={(event) =>
                  setRequestedSupplierWebsite(event.target.value)
                }
                className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
              />
            </div>
            <div>
              <label
                htmlFor={`${requestFieldId}-notes`}
                className="mb-1 block text-sm font-medium text-slate-700"
              >
                Notas
              </label>
              <textarea
                id={`${requestFieldId}-notes`}
                rows={3}
                value={requestNotes}
                disabled={requesting}
                onChange={(event) => setRequestNotes(event.target.value)}
                className="w-full resize-y rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
              />
            </div>
            {requestError && (
              <p
                className="m-0 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700"
                role="alert"
              >
                {requestError}
              </p>
            )}
            <button type="submit" className="sr-only">
              Enviar solicitud
            </button>
          </form>
        }
        cancelText="Cancelar"
        confirmText={requesting ? 'Enviando...' : 'Enviar solicitud'}
        onCancel={closeRequestModal}
              onConfirm={() => void submitSupplierRequest()}
            />,
            document.body,
          )
        : null}
      {typeof document !== 'undefined'
        ? createPortal(
            <ConfirmModal
              isOpen={requestComingSoonOpen}
              title="Próximamente"
              message={
                <div className="space-y-4 text-left">
                  <p>
                    La solicitud de nuevos proveedores estará disponible en una
                    próxima actualización del sistema.
                  </p>
                  <p>
                    Mientras tanto, si necesita un nuevo proveedor, solicite al
                    administrador que lo registre desde:
                  </p>
                  <p>
                    <strong>Comercial → Proveedores</strong>
                  </p>
                </div>
              }
              confirmText="Entendido"
              showCancel={false}
              onConfirm={() => setRequestComingSoonOpen(false)}
              onCancel={() => setRequestComingSoonOpen(false)}
            />,
            document.body,
          )
        : null}
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
  const [suppliers, setSuppliers] = useState<AdditionalServiceSupplier[]>([]);
  const [suppliersLoading, setSuppliersLoading] = useState(mode === 'pricing');
  const [suppliersError, setSuppliersError] = useState<string | null>(null);
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
  const [travelType] = useState(
    () => getAdditionalServicesWorkflowContext()?.travelType ?? null,
  );

  useEffect(() => {
    if (mode !== 'pricing') {
      return;
    }

    let cancelled = false;

    const suppliersRequest = travelType
      ? getAdditionalServiceSuppliers({
          activeOnly: true,
          travelType,
        })
      : Promise.reject(
          new Error('No se encontró el tipo de viaje actual.'),
        );

    void suppliersRequest
      .then((availableSuppliers) => {
        if (cancelled) {
          return;
        }

        setSuppliers(availableSuppliers);
      })
      .catch((error) => {
        if (!cancelled) {
          setSuppliers([]);
          setSuppliersError(
            error instanceof Error
              ? error.message
              : 'No se pudieron cargar los proveedores.',
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setSuppliersLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [mode, travelType]);

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
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      URL del costo
                      <HelpTooltip content="Aquí debe ir la URL de donde tomas el costo del adicional." />
                    </span>
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
                {mode === 'pricing' && (
                  <CommercialFields
                    line={line}
                    suppliers={suppliers}
                    suppliersLoading={suppliersLoading}
                    suppliersError={suppliersError}
                    travelType={travelType}
                  />
                )}
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
