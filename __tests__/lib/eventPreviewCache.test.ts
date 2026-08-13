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

  it('stores and reads a calendar preview by event_id', () => {
    const calendarEvent: CalendarEvent = {
      id: 'ue-1',
      event_id: 'e-1',
      title: 'Picnic',
      description: 'Park',
      image_url: null,
      url: null,
      event_date: '2026-08-13',
      event_time: null,
      sharer_contact_name: 'Alice',
      sharer_person_id: 'mp-1',
      sharer_user_id: 'u-2',
    };

    rememberEventPreview(previewFromCalendarEvent(calendarEvent));
    const preview = readEventPreview('e-1');
    expect(preview?.userEventId).toBe('ue-1');
    expect(preview?.title).toBe('Picnic');
    expect(eventFromPreview(preview!).id).toBe('e-1');
  });

  it('keeps a userEventId when remembering a loaded event', () => {
    const event: Event = {
      id: 'e-2',
      created_by_user_id: 'u1',
      url: null,
      title: 'Show',
      description: null,
      image_url: null,
      event_date: '2026-08-14',
      event_time: '19:00:00',
      created_at: '2026-01-01T00:00:00.000Z',
    };
    rememberEventPreview(previewFromEvent(event, 'ue-2'));
    expect(readEventPreview('e-2')?.userEventId).toBe('ue-2');
  });
});
