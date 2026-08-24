# The Forwarding Model (archived 2026-08-24)

This is the plain-language description of the event storage model the app ran
on from 2026-08-07 until the Copy + Follow cutover on 2026-08-24. It exists
so a future revert knows both the behavior and its price (rollback element 2
of `docs/per-user-events-copy-follow-spec.md`). The code restore point is the
`forwarding-model-final` git tag; the live behavior description that matched
it is `docs/events-technical-architecture.md` at that tag.

## The rules

- **Events are global immutable snapshots.** One `events` row per
  `(url, title, event_date, event_time)` for the whole world, enforced by a
  unique index. Two people adding "Lunch" at the same slot shared one row.
  An events row was never updated after creation.
- **Calendars are pointers.** `user_events` linked a user to a snapshot. Your
  calendar was the list of snapshots you pointed at.
- **Sharing is forwarding.** The `share_event` RPC delivered each recipient
  their own `user_events` pointer at the same snapshot at share time.
  Contacts without accounts got their pointer on sign-up via the
  `deliver_pending_shares` trigger. A share was a completed action — no
  unshare, and removing your pointer never affected anyone else's calendar.
- **`event_shares` was the share record**, not the visibility mechanism:
  attribution ("From X"), the hide filter, the "Shared with" list,
  notifications, and the pending-delivery queue. Attribution was
  reconstructed from the log: the most recent incoming share of the same
  snapshot from a non-hidden person.
- **Edits fork; they never propagate.** Saving an edit created a new snapshot
  (`find_or_create_event`, server-side dedup) and re-pointed the caller's
  `user_events` row. Everyone else kept the old snapshot. On a unique
  conflict (the caller already owned the target snapshot) the client merged:
  shares moved onto the existing row, then the old row was deleted.
- **Remove is personal.** Deleting an event deleted only the caller's
  `user_events` row; their `event_shares` records cascaded. The app never
  deleted `events` rows.
- **Orphan snapshots were garbage-collected.** The `cleanup-events` cron job
  (weekly, `CRON_SECRET` header) called `cleanup_old_events()`, which deleted
  `events` rows with zero remaining `user_events` pointers.
- **Hide filtered via the share log.** Hiding a person suppressed events
  whose only incoming shares were from hidden people.

## The price (bugs this model carried)

- **The B-1 bug class.** The edit save was five client-side calls
  (`find_or_create_event` → re-point `user_events` → on 23505, read both
  share lists → insert missing shares → delete the old row). A client-side
  abort mid-sequence left the server committed while the client showed the
  old title. The interim fix layers (write budget, friendly alerts,
  reconcile-read) bounded it; only the model change deleted it.
- **KI-002.** Global dedup keyed on `(url, title, date, time)` and ignored
  `description`/`image_url`: an edit whose four key fields matched an
  existing snapshot silently dropped the typed description/image.
- **Vanishing "From X".** Attribution came from the share log of the
  snapshot; when the sender edited (forked), the recipient's pointer still
  referenced the old snapshot while the share records pointed at the sender's
  new one — the "From X" line could disappear.
- **Re-share-after-edit double copy.** Re-sharing after an edit delivered a
  second, divergent copy to someone who already had the old one.

## Why it was replaced

Copy + Follow (`docs/per-user-events-copy-follow-spec.md`, owner-approved
2026-08-21) gives every user a real row per calendar entry
(`events.owner_id`), with `from_event_id`/`from_user_id` provenance and a
`frozen` flag. Edits are one `save_event` call that updates the caller's row
and cascades to followers silently. The share log became `sends` (who you
told), and the follow links carry attribution and hide.
