'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getStoredToken, getStoredSession } from '@/lib/auth-api';
import { resolveApiBase } from '@/lib/runtime-config';
import { InternalTripsList } from './components/internal-trips-list';
import { PageLoader } from '@/components/loading-spinner';

interface InternalTrip {
  id: string;
  tripCode: string;
  name: string;
  destination: string;
  departureDate: string;
  returnDate: string;
  capacity: number;
  occupiedSlots: number;
  price: number;
  currency: string;
  status: string;
  createdAt: string;
}

export default function AdminInternalTripsPage() {
  const router = useRouter();
  const [trips, setTrips] = useState<InternalTrip[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const session = getStoredSession();
    const token = getStoredToken();

    if (!session?.user?.id || !token) {
      router.replace('/');
      return;
    }

    // Validar que sea ADMIN u OPERACIONES
    const role = String(session.user.role || '').toUpperCase();
    if (!['ADMIN', 'OPERACIONES'].includes(role)) {
      router.replace('/');
      return;
    }

    loadTrips(token);
  }, [router]);

  const loadTrips = async (token?: string) => {
    try {
      setLoading(true);
      const currentToken = token || getStoredToken();
      const apiBase = resolveApiBase();
      const response = await fetch(`${apiBase}/internal-trips`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${currentToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        setTrips(data);
      } else {
        setError(`Error: ${response.status} ${response.statusText}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error loading trips');
    } finally {
      setLoading(false);
    }
  }

  if (!mounted || loading) {
    return <PageLoader />;
  }

  return (
    <main className="app-shell" style={{ padding: "20px" }}>
      <div style={{ maxWidth: 1400, margin: "0 auto" }} className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Viajes Internos</h1>
          <p className="text-gray-600 mt-2">
            Gestiona tus viajes domésticos y reservaciones
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800">
            {error}
          </div>
        )}

        <InternalTripsList trips={trips} onTripsUpdated={() => loadTrips()} />
      </div>
    </main>
  );
}
