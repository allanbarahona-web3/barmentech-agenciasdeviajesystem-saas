import { formatBusinessDate } from '@/shared/regional';

export function formatDate(dateString: string): string {
  return formatBusinessDate(dateString);
}

export function formatDateTime(dateString: string): string {
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('es-CR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch (e) {
    return dateString;
  }
}

export function formatTime(timeString: string): string {
  try {
    const [hours, minutes] = timeString.split(':');
    return `${hours}:${minutes}`;
  } catch (e) {
    return timeString;
  }
}
