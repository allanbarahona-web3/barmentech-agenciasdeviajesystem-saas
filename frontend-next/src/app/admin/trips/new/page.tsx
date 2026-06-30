'use client';


export const dynamic = 'force-dynamic';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getStoredSession } from '@/lib/auth-api';
import { createInternalTrip } from '@/lib/internal-trips-api';
import { createTravelPackage } from '@/lib/travel-packages-api';
import { CreateTripModal } from '@/components/create-trip-modal';
import { PageLoader } from '@/components/loading-spinner';

function CreateTripContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tripType = searchParams.get('type') as 'internal' | 'external' | 'migration' | null;

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const session = getStoredSession();

    if (!session?.user?.id) {
      router.replace('/');
      return;
    }

    // Validar que sea ADMIN
    const role = String(session.user.role || '').toUpperCase();
    if (role !== 'ADMIN') {
      router.replace('/');
      return;
    }
  }, [router]);

  if (!mounted) {
    return <PageLoader />;
  }

  // Si no especifica tipo, muestra selector
  if (!tripType) {
    return (
      <main className="app-shell" style={{ padding: '20px' }}>
        <div style={{ maxWidth: 600, margin: '0 auto' }}>
          <div style={{ marginBottom: 40, textAlign: 'center' }}>
            <button
              onClick={() => router.back()}
              style={{
                background: 'none',
                border: 'none',
                color: '#3b82f6',
                cursor: 'pointer',
                padding: 0,
                fontSize: 14,
                marginBottom: 10,
                float: 'left',
              }}
            >
              ← Volver
            </button>
            <h1 style={{ fontSize: 32, fontWeight: 700, color: '#111827', margin: 0, clear: 'both' }}>
              Crear Nuevo Viaje
            </h1>
            <p style={{ color: '#6b7280', marginTop: 12, fontSize: 16 }}>
              Selecciona el tipo de viaje que deseas crear
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20 }}>
            {/* Viaje Externo */}
            <button
              onClick={() => router.push('/admin/trips/new?type=external')}
              style={{
                border: '2px solid #e5e7eb',
                borderRadius: 12,
                padding: 30,
                background: '#fff',
                cursor: 'pointer',
                transition: 'all 0.2s',
                textAlign: 'center',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = '#3b82f6';
                (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 10px 25px rgba(59, 130, 246, 0.1)';
                (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = '#e5e7eb';
                (e.currentTarget as HTMLButtonElement).style.boxShadow = 'none';
                (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)';
              }}
            >
              <div style={{ fontSize: 48, marginBottom: 12 }}>✈️</div>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: '#111827', margin: '0 0 8px 0' }}>
                Viaje Internacional
              </h2>
              <p style={{ color: '#6b7280', fontSize: 14, margin: 0 }}>
                Viajes al extranjero y destinos internacionales
              </p>
            </button>

            {/* Viaje Interno */}
            <button
              onClick={() => router.push('/admin/trips/new?type=internal')}
              style={{
                border: '2px solid #e5e7eb',
                borderRadius: 12,
                padding: 30,
                background: '#fff',
                cursor: 'pointer',
                transition: 'all 0.2s',
                textAlign: 'center',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = '#3b82f6';
                (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 10px 25px rgba(59, 130, 246, 0.1)';
                (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = '#e5e7eb';
                (e.currentTarget as HTMLButtonElement).style.boxShadow = 'none';
                (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)';
              }}
            >
              <div style={{ fontSize: 48, marginBottom: 12 }}>🚌</div>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: '#111827', margin: '0 0 8px 0' }}>
                Viaje Interno
              </h2>
              <p style={{ color: '#6b7280', fontSize: 14, margin: 0 }}>
                Tours nacionales y viajes domésticos
              </p>
            </button>

            {/* Viaje de Migración */}
            <button
              onClick={() => router.push('/admin/trips/new?type=migration')}
              style={{
                border: '2px solid #e5e7eb',
                borderRadius: 12,
                padding: 30,
                background: '#fff',
                cursor: 'pointer',
                transition: 'all 0.2s',
                textAlign: 'center',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = '#3b82f6';
                (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 10px 25px rgba(59, 130, 246, 0.1)';
                (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = '#e5e7eb';
                (e.currentTarget as HTMLButtonElement).style.boxShadow = 'none';
                (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)';
              }}
            >
              <div style={{ fontSize: 48, marginBottom: 12 }}>🛂</div>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: '#111827', margin: '0 0 8px 0' }}>
                Viaje de Migración
              </h2>
              <p style={{ color: '#6b7280', fontSize: 14, margin: 0 }}>
                Gestión de contratos migratorios
              </p>
            </button>
          </div>
        </div>
      </main>
    );
  }

  // Si especifica tipo, muestra modal
  if (tripType === 'internal') {
    return (
      <CreateTripModal
        title="Crear Viaje Interno"
        tripType="internal"
        onSubmit={createInternalTrip}
        redirectUrl="/admin/internal-trips"
      />
    );
  }

  if (tripType === 'external') {
    return (
      <CreateTripModal
        title="Crear Viaje Internacional"
        tripType="international"
        onSubmit={async (data) => {
          await createTravelPackage(data);
        }}
        redirectUrl="/admin/travel-packages"
      />
    );
  }

  if (tripType === 'migration') {
    return (
      <CreateTripModal
        title="Crear Viaje de Migración"
        tripType="migration"
        onSubmit={async (data) => {
          await createTravelPackage({ ...data, travelType: 'MIGRATION' });
        }}
        redirectUrl="/admin/migration-trips"
      />
    );
  }

  return <PageLoader />;
}

export default function CreateTripPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <CreateTripContent />
    </Suspense>
  );
}
