import type { CalendarEvent, Event } from '../../lib/types';
import {
  clearEventPreviewCache,
  eventFromPreview,
  previewFromCalendarEvent,
  previewFromEvent,
  readEventPreview,
  rememberEventPreview,
} from '../../lib/eventPreviewCache';

describe('lib/eventPreviewCache', () => {
  afterEach(() => {
    clearEventPreviewCache();
  });

  it('stores and reads a calendar preview by the row id', () => {
    const calendarEvent: CalendarEvent = {
      id: 'e-1',
      title: 'Picnic',
      description: 'Park',
      image_url: null,
      location: 'Prospect Park',
      url: null,
      event_date: '2026-08-13',
      event_time: null,
      sharer_contact_name: 'Alice',
      sharer_person_id: 'mp-1',
      sharer_user_id: 'u-2',
      from_user_id: 'u-2',
    };

    rememberEventPreview(previewFromCalendarEvent(calendarEvent));
    const preview = readEventPreview('e-1');
    expect(preview?.title).toBe('Picnic');
    expect(preview?.sharer_contact_name).toBe('Alice');
    expect(eventFromPreview(preview!).id).toBe('e-1');
    // Location rides the preview so the detail row renders before the fetch lands.
    expect(preview?.location).toBe('Prospect Park');
    expect(eventFromPreview(preview!).location).toBe('Prospect Park');
  });

  it('remembers a loaded event row', () => {
    const event: Event = {
      id: 'e-2',
      owner_id: 'u1',
      url: null,
      title: 'Show',
      description: null,
      image_url: null,
      location: null,
      event_date: '2026-08-14',
      event_time: '19:00:00',
      from_event_id: null,
      from_user_id: null,
      frozen: false,
      archived_at: null,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    };
    rememberEventPreview(previewFromEvent(event));
    expect(readEventPreview('e-2')?.title).toBe('Show');
    expect(readEventPreview('e-2')?.event_time).toBe('19:00:00');
  });

  it('keeps provenance when re-seeding from a loaded row (previewFromEvent)', () => {
    // A received row re-seeded after a detail load or edit save must still
    // classify as received (and archived) on the next mount — otherwise the
    // preview would offer a working Remove button on a received event.
    const received: Event = {
      id: 'e-3',
      owner_id: 'u1',
      url: null,
      title: 'Forwarded Show',
      description: null,
      image_url: null,
      location: null,
      event_date: '2026-08-15',
      event_time: null,
      from_event_id: 'e-sender',
      from_user_id: 'u-sender',
      frozen: false,
      archived_at: '2026-09-01T00:00:00.000Z',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    };

    rememberEventPreview(previewFromEvent(received));
    const seeded = eventFromPreview(readEventPreview('e-3')!);
    expect(seeded.from_user_id).toBe('u-sender');
    expect(seeded.archived_at).toBe('2026-09-01T00:00:00.000Z');
  });
});
