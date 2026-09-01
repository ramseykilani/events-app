import { parsePhoneNumberFromString } from 'libphonenumber-js';

/**
 * Format an ISO event date (YYYY-MM-DD) for display, e.g. "Fri, Aug 7".
 * Parsed as a local date so the rendered day never shifts across timezones.
 */
export function formatEventDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!y || !m || !d) return isoDate;
  return new Date(y, m - 1, d).toLocaleDateString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Local YYYY-MM-DD for a Date — the day the user is looking at, never the
 * UTC day. Used where a client-local day boundary crosses into a query
 * (e.g. the Archived drawer's upcoming/past split).
 */
export function localDateString(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * Format an E.164 phone number for display, e.g. "(416) 555-0001".
 * Falls back to the raw string when the number can't be parsed.
 */
export function formatPhoneDisplay(phone: string): string {
  try {
    const parsed = parsePhoneNumberFromString(phone);
    return parsed ? parsed.formatNational() : phone;
  } catch {
    return phone;
  }
}
