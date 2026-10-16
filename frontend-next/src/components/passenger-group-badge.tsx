import { passengerGroupForegroundColor, resolvePassengerGroupColor } from '@/lib/passenger-group-presentation';

export function PassengerGroupBadge({ name, color }: { name: string; color: string | null | undefined }) {
  const resolvedColor = resolvePassengerGroupColor(color);
  return <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border px-2 py-1 text-xs font-semibold shadow-ui-xs" style={{ backgroundColor: `${resolvedColor}26`, borderColor: resolvedColor, color: passengerGroupForegroundColor(resolvedColor) }}><span aria-hidden="true" className="size-2 shrink-0 rounded-full ring-1 ring-black/10" style={{ backgroundColor: resolvedColor }} /><span className="truncate">{name}</span></span>;
}
