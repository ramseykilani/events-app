export interface User {
  id: string;
  phone_number: string;
  // Self-chosen attribution name ("X wants to go to ... with you"). NULL
  // until the user's first share — the share screen gates on it. Editable
  // from the People screen footer; never removable.
  display_name: string | null;
  expo_push_token: string | null;
  // Recipient-side share-notification preferences (People footer toggles).
  // Both default true; send-notification reads them at send time. Events
  // land on the calendar regardless — these only gate the pings.
  notify_push: boolean;
  notify_sms: boolean;
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
  // NULL once the creator deletes their account — the snapshot belongs to
  // whoever still owns a copy (see delete_my_account).
  created_by_user_id: string | null;
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
  sharer_person_id: string | null;
  sharer_user_id: string;
}

export interface HiddenPerson {
  id: string;
  owner_id: string;
  person_id: string;
  hidden_at: string;
}

export interface OgMetadata {
  title: string | null;
  description: string | null;
  image_url: string | null;
}

export type Database = Record<string, unknown>;
