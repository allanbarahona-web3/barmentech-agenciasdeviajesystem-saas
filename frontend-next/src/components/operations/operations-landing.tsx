'use client';

import { type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Bus, ClipboardCheck, FileText, Globe2, ListTodo } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function OperationsLanding() {
  const router = useRouter();
  return <main className="app-shell p-5"><div className="mx-auto max-w-5xl">
    <section className="rounded-2xl border border-primary/15 bg-primary/5 px-6 py-7 shadow-ui-xs"><div className="flex items-start gap-4">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-ui-xs"><ClipboardCheck aria-hidden="true" size={22} /></span>
      <div><p className="text-sm font-medium text-primary">Ejecución operativa</p><h1 className="mt-1 text-2xl font-semibold tracking-tight">Operaciones</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Da seguimiento al trabajo operativo, las gestiones, compras y preparación de cada viaje.</p></div>
    </div></section>
    <div className="mt-6 grid gap-5 md:grid-cols-2">
      <OperationsOption title="Internacionales" description="Seleccionar viaje para operación" icon={<Globe2 aria-hidden="true" size={22} />} onClick={() => router.push('/operations/international')} />
      <OperationsOption title="Migraciones" description="Seleccionar viaje para operación" icon={<FileText aria-hidden="true" size={22} />} onClick={() => router.push('/operations/migration')} />
      <OperationsOption title="Solicitudes independientes" description="Gestionar trabajo operativo sin viaje asociado" actionLabel="Ver solicitudes" icon={<ListTodo aria-hidden="true" size={22} />} onClick={() => router.push('/operations/standalone')} />
      <Card className="border-dashed bg-muted/40"><CardHeader><div className="flex items-start justify-between gap-3"><span className="flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground"><Bus aria-hidden="true" size={21} /></span><Badge variant="outline">Próximamente</Badge></div><CardTitle className="mt-4">Nacionales</CardTitle></CardHeader><CardContent><p className="text-sm leading-6 text-muted-foreground">La operación de viajes nacionales estará disponible en una historia posterior.</p></CardContent></Card>
    </div>
  </div></main>;
}

function OperationsOption({ title, description, icon, onClick, actionLabel = 'Ver viajes' }: { title: string; description: string; icon: ReactNode; onClick: () => void; actionLabel?: string }) {
  return <Card className="group border-t-4 border-t-primary/70 transition-all hover:-translate-y-0.5 hover:border-primary hover:shadow-ui-md"><CardHeader><span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">{icon}</span><CardTitle className="mt-4">{title}</CardTitle></CardHeader><CardContent><p className="mb-5 text-sm leading-6 text-muted-foreground">{description}</p><Button type="button" variant="outline" className="w-full justify-between" onClick={onClick}>{actionLabel} <ArrowRight aria-hidden="true" /></Button></CardContent></Card>;
}
