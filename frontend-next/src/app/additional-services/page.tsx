'use client';

import { useEffect, useState } from 'react';
import { LoadingSpinner } from '@/components/loading-spinner';
import { CustomerSearchSelector } from '@/features/customers/components';
import {
  getClientActiveTravels,
  type ActiveTravelSelection,
} from '@/lib/additional-services-workspace-api';
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

export default function AdditionalServicesPage() {
  const [selectedCustomer, setSelectedCustomer] =
    useState<CustomerListItem | null>(null);
  const [travels, setTravels] = useState<ActiveTravelSelection[]>([]);
  const [selectedTravel, setSelectedTravel] =
    useState<ActiveTravelSelection | null>(null);
  const [loadingTravels, setLoadingTravels] = useState(false);
  const [travelError, setTravelError] = useState<string | null>(null);

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

  function selectCustomer(customer: CustomerListItem) {
    setSelectedCustomer(customer);
    setTravels([]);
    setSelectedTravel(null);
    setTravelError(null);
    setLoadingTravels(true);
  }

  function clearCustomer() {
    setSelectedCustomer(null);
    setTravels([]);
    setSelectedTravel(null);
    setTravelError(null);
    setLoadingTravels(false);
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
                      onClick={() => setSelectedTravel(travel)}
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
      </div>
    </main>
  );
}
