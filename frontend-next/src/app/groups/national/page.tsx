import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export const dynamic = 'force-dynamic';

export default function NationalGroupsPage() {
  return (
    <main className="app-shell p-5"><div className="mx-auto max-w-2xl"><Link href="/groups" className="text-sm text-primary hover:underline">Agrupaciones</Link><Card className="mt-4"><CardHeader><CardTitle className="flex items-center gap-2">Nacionales <Badge variant="outline">Próximamente</Badge></CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">La agrupación de pasajeros para viajes nacionales estará disponible en una historia posterior.</CardContent></Card></div></main>
  );
}
