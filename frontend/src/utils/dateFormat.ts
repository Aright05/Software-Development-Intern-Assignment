/**
 * Formats an ISO date into relative readable time
 */
export function formatRelativeTime(dateString: string | null | undefined): string {
  if (!dateString) return '—';

  const date = new Date(dateString);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffSec = Math.round(diffMs / 1000);
  const isFuture = diffSec > 0;
  const absSec = Math.abs(diffSec);

  if (absSec < 45) {
    return isFuture ? 'in moments' : 'just now';
  }

  const minutes = Math.round(absSec / 60);
  if (minutes < 60) {
    return isFuture ? `in ${minutes}m` : `${minutes}m ago`;
  }

  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return isFuture ? `in ${hours}h` : `${hours}h ago`;
  }

  const days = Math.round(hours / 24);
  if (days < 30) {
    return isFuture ? `in ${days}d` : `${days}d ago`;
  }

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Formats an ISO date string into absolute format: "Feb 24, 2026, 04:30 PM"
 */
export function formatDateTime(dateString: string | null | undefined): string {
  if (!dateString) return '—';

  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '—';

  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Helper to convert a Date into YYYY-MM-DDTHH:MM for HTML <input type="datetime-local" />
 */
export function toDatetimeLocal(date: Date = new Date()): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}
