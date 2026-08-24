import type { CalendarEvent, Event } from './types';

// Previews are keyed by the event row id (owner-scoped in the Copy + Follow
// model — every row the client can show belongs to the caller).
export type EventPreview = {
  event_id: string;
  title: string | null;
  description: string | null;
  image_url: string | null;
  url: string | null;
  event_date: string;
  event_time: string | null;
  sharer_person_id?: string | null;
  sharer_contact_name?: string | null;
};

const cache = new Map<string, EventPreview>();

export function rememberEventPreview(preview: EventPreview): void {
  cache.set(preview.event_id, preview);
}

export function readEventPreview(eventId: string): EventPreview | undefined {
  return cache.get(eventId);
}

export function clearEventPreviewCache(): void {
  cache.clear();
}

export function previewFromCalendarEvent(event: CalendarEvent): EventPreview {
  return {
    event_id: event.id,
    title: event.title,
    description: event.description,
    image_url: event.image_url,
    url: event.url,
    event_date: event.event_date,
    event_time: event.event_time,
    sharer_person_id: event.sharer_person_id,
    sharer_contact_name: event.sharer_contact_name,
  };
}

export function previewFromEvent(event: Event): EventPreview {
  return {
    event_id: event.id,
    title: event.title,
    description: event.description,
    image_url: event.image_url,
    url: event.url,
    event_date: event.event_date,
    event_time: event.event_time,
  };
}

export function eventFromPreview(preview: EventPreview): Event {
  return {
    id: preview.event_id,
    owner_id: '',
    url: preview.url,
    title: preview.title,
    description: preview.description,
    image_url: preview.image_url,
    event_date: preview.event_date,
    event_time: preview.event_time,
    from_event_id: null,
    from_user_id: null,
    frozen: false,
    created_at: '',
    updated_at: '',
  };
}
