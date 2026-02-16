import * as Contacts from 'expo-contacts';
import { parsePhoneNumber, type CountryCode } from 'libphonenumber-js';

export interface ContactWithPhone {
  id: string;
  name: string | null;
  phoneNumber: string;
  normalized: string;
}

/**
 * Request contacts permission. Call before accessing contacts.
 */
export async function requestContactsPermission(): Promise<boolean> {
  const { status } = await Contacts.requestPermissionsAsync();
  return status === 'granted';
}

/**
 * Get contacts permission status.
 */
export async function getContactsPermissionStatus(): Promise<boolean> {
  const { status } = await Contacts.getPermissionsAsync();
  return status === 'granted';
}

/**
 * Normalize phone number to E.164 format.
 * Returns null if the number cannot be parsed.
 */
export function normalizeToE164(phone: string, defaultCountry: CountryCode = 'US'): string | null {
  try {
    const parsed = parsePhoneNumber(phone, defaultCountry);
    return parsed ? parsed.format('E.164') : null;
  } catch {
    return null;
  }
}

/**
 * Fetch device contacts and normalize phone numbers.
 * Returns contacts that have at least one valid phone number.
 */
export async function getContactsWithPhones(): Promise<ContactWithPhone[]> {
  const hasPermission = await getContactsPermissionStatus();
  if (!hasPermission) {
    const granted = await requestContactsPermission();
    if (!granted) return [];
  }

  const { data } = await Contacts.getContactsAsync({
    fields: [Contacts.Fields.PhoneNumbers],
  });

  const result: ContactWithPhone[] = [];
  const seen = new Set<string>();

  for (const contact of data) {
    const name = contact.name ?? null;
    const numbers = contact.phoneNumbers ?? [];

    for (const pn of numbers) {
      const raw = pn.number?.replace(/\s/g, '') ?? '';
      const normalized = normalizeToE164(raw);
      if (normalized && !seen.has(normalized)) {
        seen.add(normalized);
        result.push({
          id: `${contact.id}-${normalized}`,
          name,
          phoneNumber: raw,
          normalized,
        });
      }
    }
  }

  return result;
}
