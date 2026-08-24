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

// A row on the owner's calendar (Copy + Follow model — see
// docs/per-user-events-copy-follow-spec.md). Ids are owner-scoped: every row
// the client can read belongs to the caller (RLS is owner-only).
export interface Event {
  id: string;
  owner_id: string;
  url: string | null;
  title: string | null;
  description: string | null;
  image_url: string | null;
  event_date: string;
  event_time: string | null;
  // Where this copy came from. NULL = the owner created it (or the link was
  // cleared when the sender removed their row / deleted their account).
  from_event_id: string | null;
  // The sender's account, for attribution + hide. NULL once the sender
  // deletes their account.
  from_user_id: string | null;
  // The owner edited this copy; it no longer follows from_event_id.
  frozen: boolean;
  created_at: string;
  updated_at: string;
}

export interface Send {
  id: string;
  event_id: string;
  person_id: string;
  created_at: string;
}

export interface CalendarEvent {
  id: string;
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
