/**
 * Every timestamp is stored UTC. These render it in the salon's timezone, so a
 * salon in a different zone never sees the server's idea of "today".
 */

export function salonToday(timeZone: string, now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD, which matches the service_date column.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

export function salonTime(timeZone: string, value: Date | string): string {
  const date = typeof value === 'string' ? new Date(value) : value
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(date)
}
