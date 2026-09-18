import type { Event } from './types';

// Add to Other Calendars (FEATURES.md): one-shot snapshot export. The event
// lands in someone's Google/Apple/Outlook calendar as a COPY — later in-app
// edits do not reach it (no subscribe/sync, by owner decision 2026-09-01).
//
// Two mechanisms cover every calendar app; there is no per-brand list:
// - buildGoogleUrl: Google's template link (no auth, no SDK).
// - buildIcs: an RFC 5545 .ics file for Apple / Outlook / the long tail.
//
// Field mapping (the events row has no end time or timezone):
// - timed event → a 1-hour block (both formats need an end; 1h is the
//   convention);
// - no event_time → an all-day event (DTEND is the exclusive next day);
// - floating local time everywhere: no Z, no TZID, no ctz — the recipient's
//   calendar interprets it in their own zone, matching the app's
//   local-date semantics (lib/format.ts);
// - free-text location → Google's location= param, the .ics LOCATION line,
//   and the native compose UIs' location field; omitted everywhere when
//   empty;
// - full description + the listing url go into the event body;
// - the .ics UID is stable (<event-id>@shared-events) so apps that dedupe
//   by UID update rather than duplicate on re-add. Google's template
//   ignores UIDs — re-adding there always creates a new event (standard).
//
// The receipt page (receipt/index.html) carries an inline vanilla-JS port of
// these two builders — it is a static page with no build step and cannot
// import this module. Jest pins this one; e2e/receipt.spec.ts pins the port.

type CalendarFields = Pick<
  Event,
  'title' | 'description' | 'location' | 'url' | 'event_date' | 'event_time'
>;

const UNTITLED = 'Untitled event';
const GOOGLE_RENDER_BASE = 'https://calendar.google.com/calendar/render';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

// event_date is YYYY-MM-DD, parsed as a LOCAL date (never Date.parse — a
// bare date string is UTC and the rendered day would shift across zones).
function parseDate(isoDate: string): [number, number, number] {
  const [y, m, d] = isoDate.split('-').map(Number);
  return [y, m, d];
}

// event_time arrives as HH:MM or HH:MM:SS (Postgres time via PostgREST).
function parseTime(time: string): [number, number] {
  const [h, m] = time.split(':').map(Number);
  return [h, m];
}

function ymd(y: number, m: number, d: number): string {
  return `${y}${pad2(m)}${pad2(d)}`;
}

function ymdHms(y: number, m: number, d: number, h: number, min: number): string {
  return `${ymd(y, m, d)}T${pad2(h)}${pad2(min)}00`;
}

// The event body: full description and the listing URL, blank-line separated.
function buildDetails(event: CalendarFields): string {
  return [event.description, event.url].filter(Boolean).join('\n\n');
}

// The pre-fill shape for the native compose UIs (iOS createEventInCalendarAsync,
// Android ACTION_INSERT) — same field mapping as the URL/ICS builders: timed →
// 1-hour block, no time → all-day, local Date components = floating local time.
export type NativeEventDetails = {
  title: string;
  startDate: Date;
  endDate: Date;
  allDay: boolean;
  location?: string;
  notes?: string;
};

export function buildNativeDetails(event: CalendarFields): NativeEventDetails {
  const [y, m, d] = parseDate(event.event_date);
  const details = buildDetails(event);
  const base = {
    title: event.title ?? UNTITLED,
    ...(event.location ? { location: event.location } : {}),
    ...(details ? { notes: details } : {}),
  };
  if (event.event_time) {
    const [h, min] = parseTime(event.event_time);
    return {
      ...base,
      startDate: new Date(y, m - 1, d, h, min),
      endDate: new Date(y, m - 1, d, h + 1, min),
      allDay: false,
    };
  }
  return {
    ...base,
    startDate: new Date(y, m - 1, d),
    endDate: new Date(y, m - 1, d + 1),
    allDay: true,
  };
}

export function buildGoogleUrl(event: CalendarFields): string {
  const [y, m, d] = parseDate(event.event_date);
  let dates: string;
  if (event.event_time) {
    const [h, min] = parseTime(event.event_time);
    // Local Date arithmetic gives the +1h end, rolling over midnight/month.
    const end = new Date(y, m - 1, d, h + 1, min);
    dates = `${ymdHms(y, m, d, h, min)}/${ymdHms(
      end.getFullYear(),
      end.getMonth() + 1,
      end.getDate(),
      end.getHours(),
      end.getMinutes()
    )}`;
  } else {
    const end = new Date(y, m - 1, d + 1);
    dates = `${ymd(y, m, d)}/${ymd(end.getFullYear(), end.getMonth() + 1, end.getDate())}`;
  }
  // dates is [0-9T/] only — left literal; free-text params are encoded.
  let url = `${GOOGLE_RENDER_BASE}?action=TEMPLATE&text=${encodeURIComponent(
    event.title ?? UNTITLED
  )}&dates=${dates}`;
  const details = buildDetails(event);
  if (details) url += `&details=${encodeURIComponent(details)}`;
  if (event.location) url += `&location=${encodeURIComponent(event.location)}`;
  return url;
}

// RFC 5545 §3.3.11 text escaping. Backslash first — it introduces the rest.
function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n/g, '\\n');
}

function utf8Bytes(ch: string): number {
  const cp = ch.codePointAt(0) ?? 0;
  return cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
}

// RFC 5545 §3.1: content lines are at most 75 octets; longer lines fold onto
// a continuation line starting with a single space (which counts toward the
// 75, so later chunks carry 74). Folding never splits a UTF-8 code point.
function foldLine(line: string): string {
  const chunks: string[] = [];
  let current = '';
  let currentBytes = 0;
  let limit = 75;
  for (const ch of line) {
    const bytes = utf8Bytes(ch);
    if (currentBytes + bytes > limit) {
      chunks.push(current);
      current = '';
      currentBytes = 0;
      limit = 74;
    }
    current += ch;
    currentBytes += bytes;
  }
  chunks.push(current);
  return chunks.join('\r\n ');
}

function dtstamp(): string {
  // DTSTAMP is the one UTC-stamped field (RFC requires it); it identifies
  // when the snapshot was made, not when the event happens.
  return new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
}

export function buildIcs(event: CalendarFields & Pick<Event, 'id'>): string {
  const [y, m, d] = parseDate(event.event_date);
  let startLine: string;
  let endLine: string;
  if (event.event_time) {
    const [h, min] = parseTime(event.event_time);
    const end = new Date(y, m - 1, d, h + 1, min);
    startLine = `DTSTART:${ymdHms(y, m, d, h, min)}`;
    endLine = `DTEND:${ymdHms(
      end.getFullYear(),
      end.getMonth() + 1,
      end.getDate(),
      end.getHours(),
      end.getMinutes()
    )}`;
  } else {
    const end = new Date(y, m - 1, d + 1);
    startLine = `DTSTART;VALUE=DATE:${ymd(y, m, d)}`;
    endLine = `DTEND;VALUE=DATE:${ymd(end.getFullYear(), end.getMonth() + 1, end.getDate())}`;
  }
  const details = buildDetails(event);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//shared-events//events-app//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${event.id}@shared-events`,
    `DTSTAMP:${dtstamp()}`,
    startLine,
    endLine,
    `SUMMARY:${escapeIcsText(event.title ?? UNTITLED)}`,
    ...(details ? [`DESCRIPTION:${escapeIcsText(details)}`] : []),
    ...(event.location ? [`LOCATION:${escapeIcsText(event.location)}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.map(foldLine).join('\r\n') + '\r\n';
}
