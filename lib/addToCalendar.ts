import { Linking } from 'react-native';
import { buildGoogleUrl, buildIcs } from './calendarLinks';
import type { Event } from './types';

// Add to Other Calendars (FEATURES.md) — the web/default hand-off. The
// builders are shared pure functions (lib/calendarLinks.ts); only the
// delivery differs per platform. Metro bundles the .ios/.android variants
// on native instead — this file is the web surface (dev/staging/CI).

export type CalendarExportEvent = Pick<
  Event,
  'id' | 'title' | 'description' | 'location' | 'url' | 'event_date' | 'event_time'
>;

// Google Calendar's template link — no auth, no SDK. Linking routes it to a
// calendar app when one claims the URL, a new browser tab otherwise.
export async function addToGoogle(event: CalendarExportEvent): Promise<void> {
  await Linking.openURL(buildGoogleUrl(event));
}

// Apple / Outlook / Other: download the .ics as a Blob. Web-only DOM by
// design — native never resolves this file.
export async function addToOtherCalendar(event: CalendarExportEvent): Promise<void> {
  const blob = new Blob([buildIcs(event)], { type: 'text/calendar' });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = `${slug(event.title) || 'event'}.ics`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}

function slug(title: string | null): string {
  return (title ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
