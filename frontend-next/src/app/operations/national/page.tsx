'use client';

import Link from 'next/link';
import { OperationsAccessGate } from '@/components/operations/operations-access-gate';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function OperationsNationalPage() {
  return <OperationsAccessGate><main className="app-shell p-5"><div className="mx-auto max-w-2xl"><Link href="/operations" className="text-sm text-primary hover:underline">Operaciones</Link><Card className="mt-4"><CardHeader><CardTitle className="flex items-center gap-2">Nacionales <Badge variant="outline">Próximamente</Badge></CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">La operación de viajes nacionales estará disponible en una historia posterior.</CardContent></Card></div></main></OperationsAccessGate>;
}
