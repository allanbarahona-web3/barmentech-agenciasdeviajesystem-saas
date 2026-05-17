'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getStoredSession } from '@/lib/auth-api';
import { createInternalTrip } from '@/lib/internal-trips-api';
import { CreateTripForm } from '@/components/create-trip-form';
import { PageLoader } from '@/components/loading-spinner';

export default function CreateInternalTripPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const session = getStoredSession();

    if (!session?.user?.id) {
      router.replace('/');
      return;
    }

    // Validar que sea ADMIN u OPERACIONES
    const role = String(session.user.role || '').toUpperCase();
    if (!['ADMIN', 'OPERACIONES'].includes(role)) {
      router.replace('/');
      return;
    }
  }, [router]);

  if (!mounted) {
    return <PageLoader />;
  }

  return (
    <CreateTripForm
      title="Crear Viaje Interno"
      description="Configura los detalles de tu nuevo viaje doméstico"
      tripType="internal"
      onSubmit={createInternalTrip}
      redirectUrl="/admin/internal-trips"
      showTransportType={true}
      showItinerary={true}
    />
  );
}
