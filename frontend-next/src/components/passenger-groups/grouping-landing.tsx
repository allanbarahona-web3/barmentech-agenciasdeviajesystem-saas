'use client';

import { type ReactNode, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Bus, FileText, Globe2, Layers3 } from 'lucide-react';
import { getHomeRouteForRole, getStoredSession } from '@/lib/auth-api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const allowedRoles = ['ADMIN', 'AGENT', 'AGENTE', 'OPERACIONES', 'OPERATIONS'];

export function GroupingLanding() {
  const router = useRouter();

  useEffect(() => {
    const session = getStoredSession();
    if (!session?.user?.id) {
      router.replace('/');
      return;
    }
    const role = String(session.user.role || '').toUpperCase();
    if (!allowedRoles.includes(role)) router.replace(getHomeRouteForRole(role));
  }, [router]);

  return (
    <main className="app-shell p-5">
      <div className="mx-auto max-w-5xl">
        <section className="rounded-2xl border border-primary/15 bg-primary/5 px-6 py-7 shadow-ui-xs">
          <div className="flex items-start gap-4">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-ui-xs"><Layers3 aria-hidden="true" size={22} /></span>
            <div>
              <p className="text-sm font-medium text-primary">Organización operativa</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight">Agrupaciones</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                Organiza pasajeros por viaje para facilitar reservas y gestión operativa.
              </p>
            </div>
          </div>
        </section>
        <div className="mt-6 grid gap-5 md:grid-cols-3">
          <GroupingOption
            title="Internacionales"
            description="Gestionar grupos de pasajeros"
            icon={<Globe2 aria-hidden="true" size={22} />}
            onClick={() => router.push('/groups/international')}
          />
          <GroupingOption
            title="Migraciones"
            description="Gestionar grupos de pasajeros"
            icon={<FileText aria-hidden="true" size={22} />}
            onClick={() => router.push('/groups/migration')}
          />
          <Card className="border-dashed bg-muted/40">
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <span className="flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground"><Bus aria-hidden="true" size={21} /></span>
                <Badge variant="outline">Próximamente</Badge>
              </div>
              <CardTitle className="mt-4">Nacionales</CardTitle>
            </CardHeader>
            <CardContent><p className="text-sm leading-6 text-muted-foreground">La agrupación de pasajeros para viajes nacionales aún no está disponible.</p></CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}

function GroupingOption({ title, description, icon, onClick }: { title: string; description: string; icon: ReactNode; onClick: () => void }) {
  return (
    <Card className="group border-t-4 border-t-primary/70 transition-all hover:-translate-y-0.5 hover:border-primary hover:shadow-ui-md">
      <CardHeader>
        <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">{icon}</span>
        <CardTitle className="mt-4">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-5 text-sm leading-6 text-muted-foreground">{description}</p>
        <Button type="button" variant="outline" className="w-full justify-between" onClick={onClick}>Ver viajes <ArrowRight aria-hidden="true" /></Button>
      </CardContent>
    </Card>
  );
}
