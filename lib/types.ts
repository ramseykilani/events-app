export interface User {
  id: string;
  phone_number: string;
  created_at: string;
}

export interface MyPerson {
  id: string;
  owner_id: string;
  phone_number: string;
  user_id: string | null;
  contact_name: string | null;
  added_at: string;
  last_shared_at: string | null;
}

export interface Circle {
  id: string;
  owner_id: string;
  name: string;
  created_at: string;
}

export interface CircleMember {
  id: string;
  circle_id: string;
  person_id: string;
}

export interface Event {
  id: string;
  created_by_user_id: string;
  url: string | null;
  title: string | null;
  description: string | null;
  image_url: string | null;
  event_date: string;
  event_time: string | null;
  created_at: string;
}

export interface UserEvent {
  id: string;
  user_id: string;
  event_id: string;
  created_at: string;
}

export interface EventShare {
  id: string;
  user_event_id: string;
  person_id: string;
  created_at: string;
}

export interface CalendarEvent {
  id: string;
  event_id: string;
  title: string | null;
  description: string | null;
  image_url: string | null;
  url: string | null;
  event_date: string;
  event_time: string | null;
  sharer_contact_name: string | null;
  sharer_user_id: string;
}

export interface OgMetadata {
  title: string | null;
  description: string | null;
  image_url: string | null;
}

export type Database = Record<string, unknown>;
