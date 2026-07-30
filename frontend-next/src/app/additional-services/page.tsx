'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ContractReference } from '@/components/additional-services-context-header';
import { LoadingSpinner } from '@/components/loading-spinner';
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
  setAdditionalServicesWorkflowContext,
  resetAdditionalServicesWorkflow,
  setSelectedAdditionalServicesParticipants,
} from '@/lib/additional-services-temporary-store';
import type { CustomerListItem } from '@/lib/customers-api';

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

const PARTICIPANT_GROUPS: Array<{
  role: TravelParticipantRole;
  title: string;
}> = [
  { role: 'HOLDER', title: '👤 Titular' },
  { role: 'COMPANION', title: '👥 Acompañantes' },
  { role: 'MINOR', title: '🧒 Menores' },
];

function participantRoleLabel(role: TravelParticipantRole) {
  if (role === 'HOLDER') return 'Titular';
  if (role === 'COMPANION') return 'Acompañante';
  return 'Menor';
}

function travelTypeLabel(travelType: ActiveTravelSelection['travelType']) {
  return travelType === 'INTERNATIONAL' ? 'Internacional' : 'Interno';
}

function ParticipantCard({
  participant,
  selected,
  onToggle,
}: {
  participant: TravelContextParticipant;
  selected: boolean;
  onToggle: () => void;
}) {
  const isHolder = participant.participantRole === 'HOLDER';

  return (
    <label
      style={{
        padding: '14px 16px',
        border: selected
          ? '2px solid #4f46e5'
          : isHolder
            ? '1px solid #93c5fd'
            : '1px solid #dbe4f0',
        borderRadius: '12px',
        background: selected ? '#eef2ff' : isHolder ? '#eff6ff' : '#fff',
        cursor: 'pointer',
        display: 'flex',
        gap: '12px',
        alignItems: 'start',
      }}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggle}
        aria-label={`Seleccionar ${participant.fullName}`}
        style={{ width: '18px', height: '18px', marginTop: '2px' }}
      />
      <div style={{ minWidth: 0 }}>
        <strong style={{ color: '#172554' }}>{participant.fullName}</strong>
        <div style={{ color: '#64748b', fontSize: '13px', marginTop: '5px' }}>
          {participantRoleLabel(participant.participantRole)}
        </div>
        {isHolder && (
          <div
            style={{
              color: '#1d4ed8',
              fontSize: '12px',
              fontWeight: 600,
              marginTop: '4px',
            }}
          >
            Responsable del viaje
          </div>
        )}
        {participant.identification && (
          <div style={{ color: '#64748b', fontSize: '13px', marginTop: '3px' }}>
            Identificación: {participant.identification}
          </div>
        )}
      </div>
    </label>
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
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
                      gap: '14px',
                      padding: '18px',
                      background: '#f8fafc',
                      borderRadius: '14px',
                    }}
                  >
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
                    <ContractReference
                      contractNumber={travelContext.contractNumber}
                    />
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
                    <div style={{ display: 'grid', gap: '20px' }}>
                      {PARTICIPANT_GROUPS.map((group) => {
                        const participants = travelContext.participants.filter(
                          (participant) =>
                            participant.participantRole === group.role,
                        );
                        if (participants.length === 0) return null;

                        return (
                          <div key={group.role}>
                            <h4
                              style={{
                                color: '#475569',
                                fontSize: '14px',
                                marginBottom: '10px',
                              }}
                            >
                              {group.title}
                            </h4>
                            <div
                              style={{
                                display: 'grid',
                                gridTemplateColumns:
                                  'repeat(auto-fit, minmax(220px, 1fr))',
                                gap: '12px',
                              }}
                            >
                              {participants.map((participant) => (
                                <ParticipantCard
                                  key={participant.clientId}
                                  participant={participant}
                                  selected={selectedParticipantIds.has(
                                    participant.clientId,
                                  )}
                                  onToggle={() =>
                                    toggleParticipant(participant.clientId)
                                  }
                                />
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
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
                                travelContext.participants.map((participant) => ({
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
