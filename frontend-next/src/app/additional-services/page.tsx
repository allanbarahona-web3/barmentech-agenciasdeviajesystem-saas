'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Baby, Crown, UserRound } from 'lucide-react';
import { ContractReference } from '@/components/additional-services-context-header';
import { LoadingSpinner } from '@/components/loading-spinner';
import { Badge } from '@/components/ui/badge';
import { CustomerSearchSelector } from '@/features/customers/components';
import {
  getClientActiveTravels,
  getTravelContext,
  type ActiveTravelSelection,
  type TravelContext,
  type TravelContextParticipant,
  type TravelParticipantRole,
} from '@/lib/additional-services-workspace-api';
import {
  ALL_ADDITIONAL_SERVICES_CONTRACTS_FILTER,
  additionalServicesContractTagKey,
  additionalServicesContractFilterValue,
  buildAdditionalServicesContractTagClasses,
  filterAdditionalServicesContractParticipants,
  toggleAdditionalServicesContractFilter,
  WITHOUT_ADDITIONAL_SERVICES_CONTRACT_FILTER,
  type AdditionalServicesContractFilter,
} from '@/lib/additional-services-contract-tags';
import {
  setAdditionalServicesWorkflowContext,
  resetAdditionalServicesWorkflow,
  setSelectedAdditionalServicesParticipants,
} from '@/lib/additional-services-temporary-store';
import type { CustomerListItem } from '@/lib/customers-api';
import styles from './page.module.css';

function formatDateRange(startDate: string, endDate: string) {
  const formatter = new Intl.DateTimeFormat('es-CR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  return `${formatter.format(new Date(startDate))} – ${formatter.format(
    new Date(endDate),
  )}`;
}

function participantRoleLabel(role: TravelParticipantRole) {
  if (role === 'HOLDER') return 'Titular';
  if (role === 'COMPANION') return 'Acompañante';
  return 'Menor';
}

function ParticipantRoleIcon({ role }: { role: TravelParticipantRole }) {
  const [RoleIcon, colorClass] =
    role === 'HOLDER'
      ? [Crown, styles.roleIconHolder]
      : role === 'COMPANION'
        ? [UserRound, styles.roleIconCompanion]
        : [Baby, styles.roleIconMinor];

  return <RoleIcon aria-hidden="true" className={`${styles.roleIcon} ${colorClass}`} />;
}

function travelTypeLabel(travelType: ActiveTravelSelection['travelType']) {
  return travelType === 'INTERNATIONAL' ? 'Internacional' : 'Interno';
}

function ParticipantRow({
  participant,
  selected,
  onToggle,
  onFilterByContract,
  onFilterWithoutContract,
  contractTagClasses,
}: {
  participant: TravelContextParticipant;
  selected: boolean;
  onToggle: () => void;
  onFilterByContract: (contractNumber: string) => void;
  onFilterWithoutContract: () => void;
  contractTagClasses: ReadonlyMap<string, string>;
}) {
  const checkboxId = `additional-service-participant-${participant.clientId}`;

  return (
    <div
      className={`${styles.participantRow} ${
        selected ? styles.participantRowSelected : ''
      }`}
    >
      <input
        className={styles.checkbox}
        id={checkboxId}
        type="checkbox"
        checked={selected}
        onChange={onToggle}
        aria-label={`Seleccionar ${participant.fullName}`}
      />
      <div className={styles.participantNameCell}>
        <ParticipantRoleIcon role={participant.participantRole} />
        <div className={styles.participantNameContent}>
          <label className={styles.participantName} htmlFor={checkboxId}>
            {participant.fullName}
          </label>
          {participant.identification && (
            <div className={styles.identification}>
              Identificación: {participant.identification}
            </div>
          )}
        </div>
      </div>
      <span className={styles.role}>
        {participantRoleLabel(participant.participantRole)}
      </span>
      <div
        className={styles.contractTags}
        aria-label={`Contratos de ${participant.fullName}`}
      >
        {participant.contractSources.length > 0 ? (
          participant.contractSources.map((contractSource) => (
            <button
              aria-label={`Filtrar por contrato ${contractSource.contractNumber}`}
              className={styles.contractBadgeButton}
              key={additionalServicesContractTagKey(contractSource)}
              onClick={() => onFilterByContract(contractSource.contractNumber)}
              title={`Ver participantes del contrato ${contractSource.contractNumber}`}
              type="button"
            >
              <Badge
                className={contractTagClasses.get(
                  additionalServicesContractTagKey(contractSource),
                )}
                variant="outline"
              >
                {contractSource.contractNumber}
              </Badge>
            </button>
          ))
        ) : (
          <button
            aria-label="Filtrar participantes sin contrato asociado"
            className={styles.contractBadgeButton}
            onClick={onFilterWithoutContract}
            title="Ver participantes sin contrato asociado"
            type="button"
          >
            <Badge variant="outline">Sin contrato asociado</Badge>
          </button>
        )}
      </div>
    </div>
  );
}

export default function AdditionalServicesPage() {
  const [selectedCustomer, setSelectedCustomer] =
    useState<CustomerListItem | null>(null);
  const [travels, setTravels] = useState<ActiveTravelSelection[]>([]);
  const [selectedTravel, setSelectedTravel] =
    useState<ActiveTravelSelection | null>(null);
  const [loadingTravels, setLoadingTravels] = useState(false);
  const [travelError, setTravelError] = useState<string | null>(null);
  const [travelContext, setTravelContext] = useState<TravelContext | null>(null);
  const [loadingContext, setLoadingContext] = useState(false);
  const [contextError, setContextError] = useState<string | null>(null);
  const [selectedParticipantIds, setSelectedParticipantIds] = useState<
    Set<string>
  >(new Set());
  const [contractFilter, setContractFilter] =
    useState<AdditionalServicesContractFilter>(
      ALL_ADDITIONAL_SERVICES_CONTRACTS_FILTER,
    );
  const contractTagClasses = useMemo(
    () =>
      buildAdditionalServicesContractTagClasses(
        travelContext?.participants ?? [],
      ),
    [travelContext],
  );
  const visibleParticipants = useMemo(
    () =>
      filterAdditionalServicesContractParticipants(
        travelContext?.participants ?? [],
        contractFilter,
      ),
    [contractFilter, travelContext],
  );

  useEffect(() => {
    if (!selectedCustomer) return;

    let cancelled = false;

    void getClientActiveTravels(selectedCustomer.id)
      .then((activeTravels) => {
        if (!cancelled) setTravels(activeTravels);
      })
      .catch((error) => {
        if (!cancelled) {
          setTravels([]);
          setTravelError(
            error instanceof Error
              ? error.message
              : 'No fue posible cargar los viajes activos.',
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingTravels(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedCustomer]);

  useEffect(() => {
    if (!selectedTravel) return;

    let cancelled = false;
    void getTravelContext(
      selectedTravel.travelType,
      selectedTravel.travelId,
      selectedCustomer?.id ?? '',
    )
      .then((context) => {
        if (!cancelled) setTravelContext(context);
      })
      .catch((error) => {
        if (!cancelled) {
          setTravelContext(null);
          setContextError(
            error instanceof Error
              ? error.message
              : 'No fue posible cargar el contexto del viaje.',
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingContext(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedCustomer, selectedTravel]);

  function selectCustomer(customer: CustomerListItem) {
    setSelectedCustomer(customer);
    setTravels([]);
    setSelectedTravel(null);
    setTravelError(null);
    setLoadingTravels(true);
    setTravelContext(null);
    setContextError(null);
    setLoadingContext(false);
    setSelectedParticipantIds(new Set());
    setContractFilter(ALL_ADDITIONAL_SERVICES_CONTRACTS_FILTER);
  }

  function clearCustomer() {
    setSelectedCustomer(null);
    setTravels([]);
    setSelectedTravel(null);
    setTravelError(null);
    setLoadingTravels(false);
    setTravelContext(null);
    setContextError(null);
    setLoadingContext(false);
    setSelectedParticipantIds(new Set());
    setContractFilter(ALL_ADDITIONAL_SERVICES_CONTRACTS_FILTER);
  }

  function selectTravel(travel: ActiveTravelSelection) {
    const isDifferentTravel =
      selectedTravel?.travelId !== travel.travelId ||
      selectedTravel.travelType !== travel.travelType;
    if (isDifferentTravel) {
      resetAdditionalServicesWorkflow();
    }

    setSelectedTravel(travel);
    setTravelContext(null);
    setContextError(null);
    setLoadingContext(true);
    setSelectedParticipantIds(new Set());
    setContractFilter(ALL_ADDITIONAL_SERVICES_CONTRACTS_FILTER);
  }

  function toggleParticipant(clientId: string) {
    setSelectedParticipantIds((current) => {
      const next = new Set(current);
      if (next.has(clientId)) {
        next.delete(clientId);
      } else {
        next.add(clientId);
      }
      return next;
    });
  }

  function toggleContractFilter(nextFilter: AdditionalServicesContractFilter) {
    setContractFilter((currentFilter) =>
      toggleAdditionalServicesContractFilter(currentFilter, nextFilter),
    );
  }

  const activeContractFilterLabel =
    contractFilter === ALL_ADDITIONAL_SERVICES_CONTRACTS_FILTER
      ? null
      : contractFilter === WITHOUT_ADDITIONAL_SERVICES_CONTRACT_FILTER
        ? 'Sin contrato asociado'
        : contractFilter.slice('CONTRACT:'.length);

  return (
    <main className="app-shell">
      <div
        style={{
          maxWidth: '1120px',
          margin: '0 auto',
          display: 'grid',
          gap: '24px',
        }}
      >
        <header>
          <h1 style={{ fontSize: '28px', color: '#172554', marginBottom: '8px' }}>
            Adicionales
          </h1>
          <p style={{ color: '#64748b' }}>
            Seleccione el cliente y uno de sus viajes activos.
          </p>
        </header>

        <section className="form-section-card" style={{ marginTop: 0 }}>
          <h2 className="section-title">Buscar cliente</h2>
          <CustomerSearchSelector
            selectedCustomer={selectedCustomer}
            onSelect={selectCustomer}
            onClear={clearCustomer}
          />
        </section>

        {selectedCustomer && (
          <section className="form-section-card" style={{ marginTop: 0 }}>
            <h2 className="section-title">Viajes activos</h2>
            {loadingTravels ? (
              <LoadingSpinner message="Cargando viajes activos..." />
            ) : travelError ? (
              <div
                role="alert"
                style={{
                  padding: '14px',
                  borderRadius: '10px',
                  background: '#fee2e2',
                  color: '#991b1b',
                }}
              >
                {travelError}
              </div>
            ) : travels.length === 0 ? (
              <div
                style={{
                  padding: '32px',
                  textAlign: 'center',
                  color: '#64748b',
                  background: '#f8fafc',
                  borderRadius: '12px',
                }}
              >
                Este cliente no tiene viajes activos.
              </div>
            ) : (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                  gap: '16px',
                }}
              >
                {travels.map((travel) => {
                  const isSelected =
                    selectedTravel?.travelId === travel.travelId &&
                    selectedTravel.travelType === travel.travelType;
                  return (
                    <button
                      type="button"
                      key={`${travel.travelType}:${travel.travelId}`}
                      onClick={() => selectTravel(travel)}
                      aria-pressed={isSelected}
                      style={{
                        padding: '18px',
                        textAlign: 'left',
                        borderRadius: '14px',
                        border: isSelected
                          ? '2px solid #4f46e5'
                          : '1px solid #dbe4f0',
                        background: isSelected ? '#eef2ff' : '#fff',
                        cursor: 'pointer',
                        boxShadow: '0 2px 8px rgba(15, 23, 42, 0.06)',
                      }}
                    >
                      <strong style={{ color: '#172554', fontSize: '16px' }}>
                        {travel.name}
                      </strong>
                      <div style={{ color: '#475569', marginTop: '10px' }}>
                        {travel.destination}
                      </div>
                      <div
                        style={{
                          color: '#64748b',
                          fontSize: '13px',
                          marginTop: '6px',
                        }}
                      >
                        {formatDateRange(travel.startDate, travel.endDate)}
                      </div>
                      <div
                        style={{
                          color: '#334155',
                          fontSize: '13px',
                          fontWeight: 600,
                          marginTop: '10px',
                        }}
                      >
                        {travel.status}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {selectedTravel && (
          <section className="form-section-card" style={{ marginTop: 0 }}>
            <h2 className="section-title">Contexto del viaje</h2>
            {loadingContext ? (
              <LoadingSpinner message="Cargando contexto del viaje..." />
            ) : contextError ? (
              <div
                role="alert"
                style={{
                  padding: '14px',
                  borderRadius: '10px',
                  background: '#fee2e2',
                  color: '#991b1b',
                }}
              >
                {contextError}
              </div>
            ) : travelContext ? (
              <div style={{ display: 'grid', gap: '24px' }}>
                <div>
                  <h3
                    style={{
                      fontSize: '18px',
                      color: '#172554',
                      marginBottom: '14px',
                    }}
                  >
                    Resumen del viaje
                  </h3>
                  <div
                    style={{
                      padding: '18px',
                      background: '#f8fafc',
                      borderRadius: '14px',
                    }}
                  >
                    <div className={styles.summaryFields}>
                      <div>
                        <small style={{ color: '#64748b' }}>Viaje</small>
                        <div style={{ color: '#172554', fontWeight: 600 }}>
                          {travelContext.displayName}
                        </div>
                      </div>
                      <div>
                        <small style={{ color: '#64748b' }}>Tipo</small>
                        <div style={{ color: '#172554', fontWeight: 600 }}>
                          {travelTypeLabel(travelContext.travelType)}
                        </div>
                      </div>
                      <div>
                        <small style={{ color: '#64748b' }}>Destino</small>
                        <div style={{ color: '#172554', fontWeight: 600 }}>
                          {travelContext.destination}
                        </div>
                      </div>
                      <div>
                        <small style={{ color: '#64748b' }}>Fechas</small>
                        <div style={{ color: '#172554', fontWeight: 600 }}>
                          {formatDateRange(
                            travelContext.startDate,
                            travelContext.endDate,
                          )}
                        </div>
                      </div>
                    </div>
                    <div className={styles.summaryContract}>
                      <ContractReference
                        contractNumber={travelContext.contractNumber}
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <h3
                    style={{
                      fontSize: '18px',
                      color: '#172554',
                      marginBottom: '14px',
                    }}
                  >
                    Participantes
                  </h3>
                  {travelContext.participants.length === 0 ? (
                    <div
                      style={{
                        padding: '28px',
                        textAlign: 'center',
                        color: '#64748b',
                        background: '#f8fafc',
                        borderRadius: '12px',
                      }}
                    >
                      Este viaje no tiene participantes registrados.
                    </div>
                  ) : (
                    <>
                      {activeContractFilterLabel && (
                        <div className={styles.activeFilter} role="status">
                          <span>
                            Filtrando por contrato: {activeContractFilterLabel}
                          </span>
                          <button
                            className={styles.clearFilterButton}
                            onClick={() =>
                              setContractFilter(
                                ALL_ADDITIONAL_SERVICES_CONTRACTS_FILTER,
                              )
                            }
                            type="button"
                          >
                            Limpiar
                          </button>
                        </div>
                      )}
                      <div className={styles.roster} aria-label="Roster de pasajeros">
                        {visibleParticipants.map((participant) => (
                          <ParticipantRow
                            contractTagClasses={contractTagClasses}
                            key={participant.clientId}
                            onFilterByContract={(contractNumber) =>
                              toggleContractFilter(
                                additionalServicesContractFilterValue(contractNumber),
                              )
                            }
                            onFilterWithoutContract={() =>
                              toggleContractFilter(
                                WITHOUT_ADDITIONAL_SERVICES_CONTRACT_FILTER,
                              )
                            }
                            onToggle={() => toggleParticipant(participant.clientId)}
                            participant={participant}
                            selected={selectedParticipantIds.has(
                              participant.clientId,
                            )}
                          />
                        ))}
                      </div>
                    </>
                  )}
                  {travelContext.participants.length > 0 && (
                    <div
                      style={{
                        marginTop: '20px',
                        paddingTop: '16px',
                        borderTop: '1px solid #e2e8f0',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '16px',
                        flexWrap: 'wrap',
                      }}
                    >
                      <span style={{ color: '#172554', fontWeight: 700 }}>
                        Participantes seleccionados:{' '}
                        {selectedParticipantIds.size}
                      </span>
                      {selectedParticipantIds.size > 0 && (
                        <Link
                          href="/additional-services/catalog"
                          className="btn-primary"
                          onClick={() => {
                            setSelectedAdditionalServicesParticipants(
                              selectedParticipantIds,
                            );
                            setAdditionalServicesWorkflowContext({
                              travelId: travelContext.travelId,
                              travelName: travelContext.displayName,
                              travelType: travelContext.travelType,
                              contractNumber: travelContext.contractNumber,
                              selectedParticipants:
                                travelContext.participants
                                  .filter((participant) =>
                                    selectedParticipantIds.has(
                                      participant.clientId,
                                    ),
                                  )
                                  .map((participant) => ({
                                    participantId: participant.clientId,
                                    fullName: participant.fullName,
                                    operationalNotes:
                                      participant.operationalNotes,
                                  })),
                              eligibleQuoteCustomers:
                                travelContext.participants
                                  .filter((participant) =>
                                    selectedParticipantIds.has(
                                      participant.clientId,
                                    ),
                                  )
                                  .map((participant) => ({
                                    participantId: participant.clientId,
                                    fullName: participant.fullName,
                                    operationalNotes:
                                      participant.operationalNotes,
                                  })),
                            });
                          }}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '12px 20px',
                            borderRadius: '10px',
                            textDecoration: 'none',
                          }}
                        >
                          Continuar al catálogo
                        </Link>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </section>
        )}
      </div>
    </main>
  );
}
