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
  // Free-text venue/address ("Sarah's place") — no Places autocomplete.
  // Renders as a tappable Maps search row on the detail screen; feeds
  // calendar exports and the share SMS venue line.
  location: string | null;
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
  // Archive Received Events: set when the owner archived this (received)
  // row — off the calendar, restorable from the Archived screen. NULL = on
  // the calendar. Written only by the set_event_archived RPC, never by
  // save_event (archiving is not an edit and never ends following).
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Send {
  id: string;
  event_id: string;
  person_id: string;
  created_at: string;
  // Share Delivery Status: what happened to the notification text. Written
  // by send-notification (at send time) and the twilio-status webhook
  // (carrier states). NULL sms_status = no SMS was attempted (app user with
  // texts off, Twilio unconfigured, reserved test number) or a pre-feature
  // row. The sheet assumes success — only terminal failures change the label
  // (✕ Unsubscribed / ✕ Undelivered); everything else renders "✓ Shared".
  sms_sid: string | null;
  sms_status: 'queued' | 'sent' | 'delivered' | 'undelivered' | 'failed' | null;
  sms_error_code: string | null;
  sms_status_at: string | null;
  // Who's Coming: the recipient's answer to the person who sent them the
  // event. NULL = they haven't said; yes/no only (no maybe); last write
  // wins. Only the asker reads it (sends_select_owner); recipients write it
  // via the respond_to_send RPC or the SMS receipt page (response_token).
  response: 'yes' | 'no' | null;
  responded_at: string | null;
  // Capability for the receipt-page link in the share SMS — never selected
  // by the client.
  response_token: string;
}

export interface CalendarEvent {
  id: string;
  title: string | null;
  description: string | null;
  image_url: string | null;
  location: string | null;
  url: string | null;
  event_date: string;
  event_time: string | null;
  sharer_contact_name: string | null;
  sharer_person_id: string | null;
  sharer_user_id: string;
  // Raw provenance (sharer_user_id is COALESCEd and cannot classify). The
  // detail screen's Archive-vs-Delete choice reads this from the calendar
  // preview, before its own fetch lands.
  from_user_id: string | null;
}

// A row in the Archived drawer (get_archived_events): the calendar shape
// plus provenance and when it was archived. Rows here are received by
// construction — the client never offers Archive on a self-created event.
export interface ArchivedEvent extends CalendarEvent {
  archived_at: string;
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
