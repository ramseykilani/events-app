import { buildGoogleUrl, buildIcs, buildNativeDetails } from '../../lib/calendarLinks';

// Add to Other Calendars (FEATURES.md): the two pure builders behind the
// event-detail export buttons. The receipt page carries an inline port of
// these — e2e/receipt.spec.ts pins that port against the same expectations.

const base = {
  id: 'evt-123',
  title: 'Board Game Night',
  description: 'Bring a game.',
  url: 'https://example.com/tickets',
  event_date: '2026-09-05',
  event_time: '19:00',
};

describe('buildGoogleUrl', () => {
  it('builds a timed event as a floating 1-hour block', () => {
    const url = buildGoogleUrl(base);
    expect(url).toContain('https://calendar.google.com/calendar/render?action=TEMPLATE');
    expect(url).toContain('text=Board%20Game%20Night');
    // Floating local time: no Z suffix, no ctz param.
    expect(url).toContain('dates=20260905T190000/20260905T200000');
    expect(url).not.toContain('ctz');
    expect(url).not.toMatch(/dates=[^&]*Z/);
  });

  it('accepts HH:MM:SS times from PostgREST', () => {
    expect(buildGoogleUrl({ ...base, event_time: '19:00:00' })).toContain(
      'dates=20260905T190000/20260905T200000'
    );
  });

  it('rolls the 1-hour block over midnight and month boundaries', () => {
    const url = buildGoogleUrl({
      ...base,
      event_date: '2026-01-31',
      event_time: '23:30',
    });
    expect(url).toContain('dates=20260131T233000/20260201T003000');
  });

  it('builds an all-day event when there is no time', () => {
    const url = buildGoogleUrl({ ...base, event_time: null });
    expect(url).toContain('dates=20260905/20260906');
  });

  it('rolls an all-day event over the year boundary', () => {
    const url = buildGoogleUrl({
      ...base,
      event_date: '2026-12-31',
      event_time: null,
    });
    expect(url).toContain('dates=20261231/20270101');
  });

  it('puts the full description and listing url in details', () => {
    const url = buildGoogleUrl(base);
    expect(url).toContain(
      `details=${encodeURIComponent('Bring a game.\n\nhttps://example.com/tickets')}`
    );
  });

  it('omits details when there is no description and no url', () => {
    const url = buildGoogleUrl({ ...base, description: null, url: null });
    expect(url).not.toContain('details=');
  });

  it('falls back to "Untitled event"', () => {
    expect(buildGoogleUrl({ ...base, title: null })).toContain('text=Untitled%20event');
  });

  it('encodes free text in params', () => {
    const url = buildGoogleUrl({ ...base, title: 'Trivia, Night & Fun' });
    expect(url).toContain('text=Trivia%2C%20Night%20%26%20Fun');
  });
});

describe('buildIcs', () => {
  it('is a well-formed VCALENDAR with CRLF endings and a stable UID', () => {
    const ics = buildIcs(base);
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics).toContain('VERSION:2.0\r\n');
    expect(ics).toContain('UID:evt-123@shared-events\r\n');
    expect(ics).toMatch(/DTSTAMP:\d{8}T\d{6}Z\r\n/);
    expect(ics).not.toContain('\n ');
  });

  it('writes a timed event as a floating 1-hour block', () => {
    const ics = buildIcs(base);
    expect(ics).toContain('DTSTART:20260905T190000\r\n');
    expect(ics).toContain('DTEND:20260905T200000\r\n');
    // Floating: no Z, no TZID.
    expect(ics).not.toContain('TZID');
    expect(ics).not.toMatch(/DT(START|END)[^:]*:[0-9T]+Z/);
  });

  it('rolls the 1-hour block over midnight and month boundaries', () => {
    const ics = buildIcs({ ...base, event_date: '2026-01-31', event_time: '23:30' });
    expect(ics).toContain('DTSTART:20260131T233000\r\n');
    expect(ics).toContain('DTEND:20260201T003000\r\n');
  });

  it('writes an all-day event with VALUE=DATE and an exclusive next-day end', () => {
    const ics = buildIcs({ ...base, event_time: null });
    expect(ics).toContain('DTSTART;VALUE=DATE:20260905\r\n');
    expect(ics).toContain('DTEND;VALUE=DATE:20260906\r\n');
  });

  it('escapes commas, semicolons, backslashes, and newlines in text', () => {
    const ics = buildIcs({
      ...base,
      title: 'Dinner, with; friends',
      description: 'Line one\nLine two \\ C:\\path',
      url: null,
    });
    expect(ics).toContain('SUMMARY:Dinner\\, with\\; friends\r\n');
    expect(ics).toContain('DESCRIPTION:Line one\\nLine two \\\\ C:\\\\path\r\n');
  });

  it('puts the full description and listing url in DESCRIPTION', () => {
    const ics = buildIcs(base);
    expect(ics).toContain(
      'DESCRIPTION:Bring a game.\\n\\nhttps://example.com/tickets\r\n'
    );
  });

  it('omits DESCRIPTION when there is no description and no url', () => {
    const ics = buildIcs({ ...base, description: null, url: null });
    expect(ics).not.toContain('DESCRIPTION');
  });

  it('falls back to "Untitled event"', () => {
    expect(buildIcs({ ...base, title: null })).toContain('SUMMARY:Untitled event\r\n');
  });

  it('folds lines longer than 75 octets and unfolds losslessly', () => {
    const long = 'x'.repeat(200);
    const ics = buildIcs({ ...base, description: long, url: null });
    const lines = ics.split('\r\n');
    for (const line of lines) {
      expect(Buffer.byteLength(line, 'utf8')).toBeLessThanOrEqual(75);
    }
    const description = lines.find((l) => l.startsWith('DESCRIPTION:'));
    expect(description).toBeDefined();
    // Unfolding (CRLF + single space) recovers the logical line.
    const unfolded = ics.replace(/\r\n /g, '');
    expect(unfolded).toContain(`DESCRIPTION:${'x'.repeat(200)}\r\n`);
  });

  it('never splits a multi-byte character across a fold', () => {
    // Pad so the fold boundary lands inside the emoji run.
    const description = `${'y'.repeat(60)}${'🎉'.repeat(10)}${'z'.repeat(60)}`; // conventions-ok — test data, not UI source
    const ics = buildIcs({ ...base, description, url: null });
    for (const line of ics.split('\r\n')) {
      expect(Buffer.byteLength(line, 'utf8')).toBeLessThanOrEqual(75);
    }
    expect(ics.replace(/\r\n /g, '')).toContain(`DESCRIPTION:${description}\r\n`);
  });
});

describe('buildNativeDetails', () => {
  it('maps a timed event to a local 1-hour block', () => {
    const d = buildNativeDetails(base);
    expect(d.title).toBe('Board Game Night');
    expect(d.allDay).toBe(false);
    // Local components — the device zone interprets them (floating time).
    expect(d.startDate.getFullYear()).toBe(2026);
    expect(d.startDate.getMonth()).toBe(8);
    expect(d.startDate.getDate()).toBe(5);
    expect(d.startDate.getHours()).toBe(19);
    expect(d.startDate.getMinutes()).toBe(0);
    expect(d.endDate.getTime() - d.startDate.getTime()).toBe(60 * 60 * 1000);
    expect(d.notes).toBe('Bring a game.\n\nhttps://example.com/tickets');
  });

  it('maps a time-less event to an all-day range ending the next day', () => {
    const d = buildNativeDetails({ ...base, event_time: null });
    expect(d.allDay).toBe(true);
    expect(d.startDate.getHours()).toBe(0);
    expect(d.endDate.getDate()).toBe(6);
  });

  it('omits notes when there is no description and no url', () => {
    const d = buildNativeDetails({ ...base, description: null, url: null });
    expect('notes' in d).toBe(false);
  });

  it('falls back to "Untitled event"', () => {
    expect(buildNativeDetails({ ...base, title: null }).title).toBe('Untitled event');
  });
});
