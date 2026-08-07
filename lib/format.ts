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
