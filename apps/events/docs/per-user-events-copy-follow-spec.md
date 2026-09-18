# Per-User Events (Copy + Follow) — Implementation Spec

**Status:** Spec complete and **approved by the owner 2026-08-21**. This document is the implementation contract: schema, RLS, RPCs, backfill SQL, cutover order, rollback plan, and test plan. Implement from this document (not from the FEATURES.md section, which is preserved for context). Implementation lands as one coordinated change (client + backend move together — no dual-write period).

## Why

The storage does not match the product story. Today events are global immutable snapshots (`events`), calendars are pointers (`user_events`), and a share log (`event_shares`) doubles as the attribution/hide mechanism. That shape forces fork-on-edit, the five-call client-side save in `app/(app)/edit-event.tsx` (the B-1 bug class), KI-002 (global dedup drops description/image), disappearing "From X" attribution after a sender edits, and the re-share-after-edit double copy. The full motivation and postmortem live in FEATURES.md; this document only specifies the replacement.

## Owner decisions (locked 2026-08-21 — binding)

1. **No edit-triggered notifications in v1.** Edits cascade silently — no push, no SMS, at any depth of the follow tree. Followers see the corrected listing next time they open the app. Date/time pings later are a separate future decision, not designed here.
2. **Following ends on any save that changes a field.** Even a typo fix freezes the copy. A save that changes nothing does **not** end following (see `save_event` no-op rule).
3. **Two senders = two entries.** Receiving the same listing from two people puts two rows on the calendar, each following its own sender. No cross-sender dedup on receive.
4. **The extensive rollback plan (below) is part of the implementation**, not a follow-up.
5. **Cutover downtime is accepted.** A multi-hour outage is fine (owner + a few friends; the app is opened at most once a day; the new client cannot be tested or shipped until the migration is applied anyway). No machinery to shorten or engineer around the window.
6. **No native-tester messaging.** No individual messaging, no in-app force-update. Old builds fail quietly (retry banners, not crashes); store auto-update delivers the fixed binary.

## Target model

Replace the three event tables with two. `users`, `my_people`, `circles`, `circle_members`, `hidden_people` are unchanged.

### New `events` — a row on your calendar

```sql
CREATE TABLE public.events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  url           text,
  title         text,
  description   text,
  image_url     text,
  event_date    date NOT NULL,
  event_time    time,
  -- Where this copy came from. NULL = you created it (or the link was
  -- lost/cleared — see remove/delete-account semantics).
  from_event_id uuid REFERENCES public.events(id) ON DELETE SET NULL,
  -- The sender's account, for attribution + hide. SET NULL when the sender
  -- deletes their account (attribution disappears — same as today).
  from_user_id  uuid REFERENCES public.users(id) ON DELETE SET NULL,
  -- You edited this; stop following from_event_id.
  frozen        boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT events_url_or_title CHECK (url IS NOT NULL OR title IS NOT NULL)
);

CREATE INDEX idx_events_owner_date ON public.events(owner_id, event_date);
CREATE INDEX idx_events_from_event_id ON public.events(from_event_id)
  WHERE from_event_id IS NOT NULL;
-- One copy per sender-row per recipient: a re-share from the same sender row
-- cannot plant a second row. Two different senders still yield two rows
-- (owner decision 3).
CREATE UNIQUE INDEX idx_events_one_copy_per_sender_row
  ON public.events(owner_id, from_event_id) WHERE from_event_id IS NOT NULL;
```

Notes:

- **No global dedup index.** Two people adding "Lunch" at the same slot are two independent rows (KI-002 dies with the index).
- **No `created_by_user_id`.** Nothing in the client reads it today (type/fixture only); the originator of a listing is the root of the `from_event_id` chain and no UI needs it.
- **No stamped `from_person_id`.** The FEATURES.md draft listed one "so the UI can say From Bob," but a stamped copy of the recipient's contact row goes stale in exactly the case the live join handles for free today: the recipient adds the sharer as a contact *after* the share (attribution should upgrade to their contact_name, and hide should become available — the "Add Sharer to Your People" path). The calendar RPC resolves the recipient's `my_people` row live via `from_user_id` (see below), which reproduces today's attribution semantics exactly, including account-deletion scrubbing. `from_user_id` is the durable fact; the person row is derived.

### New `sends` — who you told

```sql
CREATE TABLE public.sends (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id   uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  person_id  uuid NOT NULL REFERENCES public.my_people(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(event_id, person_id)
);

CREATE INDEX idx_sends_person_id ON public.sends(person_id);
```

Replaces `event_shares`: drives the share sheet's ✓ Shared, the "Shared with" list, notifications, and the pending-delivery queue for contacts without an account. `person_id` is the **sender's** contact row for the recipient (same convention as `event_shares` today). Incoming and outgoing stay opposite arrows: `from_event_id`/`from_user_id` on your row say where it came from; `sends` on your row says who you sent it to.

### RLS

The entire access model collapses to ownership. All cross-user writes (recipient copies, follow cascades) happen only inside SECURITY DEFINER functions.

```sql
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sends   ENABLE ROW LEVEL SECURITY;

-- Reads and removes are direct client operations. Creates and edits go
-- through save_event so the frozen/cascade logic cannot be bypassed.
CREATE POLICY events_select_own ON public.events FOR SELECT
  USING (owner_id = auth.uid());
CREATE POLICY events_delete_own ON public.events FOR DELETE
  USING (owner_id = auth.uid());

-- sends are written only by share_event / deliver_pending_shares (definer);
-- the client reads them for ✓ Shared and "Shared with".
CREATE POLICY sends_select_owner ON public.sends FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = sends.event_id AND e.owner_id = auth.uid()
  ));
```

The legacy tables keep their existing policies after rename but get `REVOKE ALL ON legacy_events, legacy_user_events, legacy_event_shares FROM anon, authenticated;` so no client path can read stale data during the soak window.

### Dropped objects

- `find_or_create_event` (replaced by `save_event`)
- `cleanup_old_events` + the `cleanup-events` edge function + its pg_cron job (no orphan snapshots exist in this model — every row has exactly one owner, and removing a row is final)
- `owns_user_event` helper (was for `event_shares` RLS recursion; the new policies have no cross-table recursion)
- The global dedup index (dies with the `legacy_events` rename; nothing inserts there post-cutover)

## RPCs

All functions are `LANGUAGE plpgsql SECURITY DEFINER SET search_path = public`, with `EXECUTE` revoked from `PUBLIC`/`anon` and granted to `authenticated` (the `delete_my_account` hardening pattern).

### `save_event(p_id uuid, p_url text, p_title text, p_description text, p_image_url text, p_event_date date, p_event_time time) → uuid`

One entry point for create and edit. The client generates the id for new events (`crypto.randomUUID()`), which makes both paths naturally idempotent — a timed-out call retried with the same arguments is always safe, killing the B-1 failure mode by construction rather than by budget tuning.

```sql
DECLARE
  v_caller uuid := auth.uid();
  v_existing public.events;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_existing FROM public.events WHERE id = p_id;

  IF NOT FOUND THEN
    -- Create path. A retry of an aborted create finds the row and falls
    -- through to the no-op check below instead of double-creating.
    INSERT INTO public.events
      (id, owner_id, url, title, description, image_url, event_date, event_time)
    VALUES
      (p_id, v_caller, p_url, p_title, p_description, p_image_url, p_event_date, p_event_time);
    RETURN p_id;
  END IF;

  IF v_existing.owner_id <> v_caller THEN
    RAISE EXCEPTION 'Not your event';
  END IF;

  -- No-op rule: a save that changes nothing does NOT end following and
  -- does not cascade. (Also what makes create-retries side-effect-free.)
  IF v_existing.url         IS NOT DISTINCT FROM p_url
     AND v_existing.title       IS NOT DISTINCT FROM p_title
     AND v_existing.description IS NOT DISTINCT FROM p_description
     AND v_existing.image_url   IS NOT DISTINCT FROM p_image_url
     AND v_existing.event_date  IS NOT DISTINCT FROM p_event_date
     AND v_existing.event_time  IS NOT DISTINCT FROM p_event_time THEN
    RETURN p_id;
  END IF;

  -- Edit path: any change ends following (owner decision 2)...
  UPDATE public.events
  SET url = p_url, title = p_title, description = p_description,
      image_url = p_image_url, event_date = p_event_date, event_time = p_event_time,
      frozen = true, updated_at = now()
  WHERE id = p_id;

  -- ...then propagate to every row still following this one, walking the
  -- follow tree. UNION (not UNION ALL) dedupes visited ids, so a row is
  -- never updated twice and a cycle terminates by construction. The walk
  -- only descends through non-frozen rows, so a frozen intermediary prunes
  -- its whole subtree from this cascade.
  WITH RECURSIVE descendants AS (
    SELECT id FROM public.events
    WHERE from_event_id = p_id AND NOT frozen
    UNION
    SELECT e.id FROM public.events e
    JOIN descendants d ON e.from_event_id = d.id
    WHERE NOT e.frozen
  )
  UPDATE public.events e
  SET url = p_url, title = p_title, description = p_description,
      image_url = p_image_url, event_date = p_event_date, event_time = p_event_time,
      updated_at = now()
  FROM descendants d
  -- AND NOT e.frozen is load-bearing, not redundant with the CTE: the CTE is
  -- evaluated once at the statement snapshot, but this outer predicate is
  -- what EvalPlanQual re-evaluates on the new row version after a lock wait
  -- (see Concurrency below).
  WHERE e.id = d.id AND NOT e.frozen;

  RETURN p_id;
END;
```

Properties:

- **One server call, one transaction.** The whole follow tree updates or nothing does; there is no partial-propagation state. SECURITY DEFINER is required because the cascade writes other people's rows; ownership of the source row is verified explicitly.
- **Cycles cannot form in practice** — `from_event_id` is written once at copy creation and never updated, and sharing always mints a new row — so the follow graph is a forest. The UNION visited-set is belt-and-braces (also covers a backfill bug).
- **Concurrency:** the recursive CTE is evaluated once against the statement's snapshot, so its `NOT frozen` filter cannot see a concurrent commit. The guard that matters at lock-wait time is the outer UPDATE's `AND NOT e.frozen`: when the cascade waits on a row lock and the follower's own `save_event` commits first (setting `frozen = true` plus their values), EvalPlanQual re-evaluates the outer predicate against the new row version, the row no longer qualifies, and the late cascade skips it — the follower's edit survives. Without that clause EPQ re-checks only `e.id = d.id`, which still matches, and the cascade would silently overwrite the follower's fresh edit on a row now marked frozen. Accepted residual: a frozen intermediary's *subtree* can still receive one late cascade in the same race (CTE membership is fixed at snapshot), which is semantically defensible and vanishingly rare at this scale — the direct-overwrite case is the one that must be correct, and it is.
- **Silent:** no notifications fire on edit (owner decision 1). There is no ping path to scope.
- The client keeps the no-op detection it has today (unchanged form values never call `save_event`), so follow is preserved without relying on the server rule; the server rule is defense in depth.

### `share_event(p_event_id uuid, p_person_ids uuid[]) → integer`

Same contract as today (returns the count of newly recorded sends), re-pointed at the new tables. Sharing copies **your current row** onto each recipient's calendar.

```sql
DECLARE
  v_caller uuid := auth.uid();
  v_row public.events;
  v_inserted integer;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_row FROM public.events
  WHERE id = p_event_id AND owner_id = v_caller;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not your event'; END IF;

  -- Record the sends (own contacts only; idempotent).
  INSERT INTO public.sends (event_id, person_id)
  SELECT p_event_id, pid
  FROM unnest(p_person_ids) AS pid
  WHERE EXISTS (
    SELECT 1 FROM public.my_people mp
    WHERE mp.id = pid AND mp.owner_id = v_caller
  )
  ON CONFLICT (event_id, person_id) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  -- Deliver each app-user recipient their own copy of MY row as it is now.
  -- Contacts without an account get theirs at sign-up (deliver_pending_shares).
  INSERT INTO public.events
    (owner_id, url, title, description, image_url, event_date, event_time,
     from_event_id, from_user_id)
  SELECT mp.user_id, v_row.url, v_row.title, v_row.description, v_row.image_url,
         v_row.event_date, v_row.event_time, p_event_id, v_caller
  FROM public.my_people mp
  WHERE mp.owner_id = v_caller
    AND mp.id = ANY (p_person_ids)
    AND mp.user_id IS NOT NULL
    AND mp.user_id <> v_caller
  ON CONFLICT (owner_id, from_event_id) WHERE from_event_id IS NOT NULL DO NOTHING;

  UPDATE public.my_people SET last_shared_at = now()
  WHERE owner_id = v_caller AND id = ANY (p_person_ids);

  RETURN v_inserted;
END;
```

- Re-share is the same call: Bob sharing to Carol copies **Bob's** row, so Carol's row has `from_event_id = Bob's row` and follows Bob.
- The partial-unique `ON CONFLICT` makes a duplicate delivery from the same sender row impossible even if the client passes an already-shared person id.
- Forwarding a frozen copy works identically — the recipient's new row follows *your* row, and your future edits cascade to them. (Your row being frozen only ends *your* following of *your* sender.)

### `get_calendar_events(p_user_id uuid, p_start_date date, p_end_date date)`

Own rows only; attribution and hide resolve through a live join on `from_user_id`. Return shape drops the old dual id — `id` is now the event row itself:

```
RETURNS TABLE (id uuid, title text, description text, image_url text, url text,
               event_date date, event_time time,
               sharer_contact_name text, sharer_person_id uuid, sharer_user_id uuid)
```

```sql
-- same auth guards as today (p_user_id must equal auth.uid())
RETURN QUERY
SELECT
  e.id,
  e.title, e.description, e.image_url, e.url, e.event_date, e.event_time,
  COALESCE(mp.contact_name, u_from.display_name) AS sharer_contact_name,
  mp.id AS sharer_person_id,
  COALESCE(e.from_user_id, p_user_id) AS sharer_user_id
FROM public.events e
LEFT JOIN public.my_people mp
  ON mp.owner_id = p_user_id AND mp.user_id = e.from_user_id
LEFT JOIN public.users u_from
  ON u_from.id = e.from_user_id
LEFT JOIN public.hidden_people hp
  ON hp.owner_id = p_user_id AND hp.person_id = mp.id
WHERE e.owner_id = p_user_id
  AND e.event_date >= p_start_date
  AND e.event_date <= p_end_date
  AND hp.id IS NULL
ORDER BY e.event_date, e.event_time NULLS LAST;
```

- Attribution order is unchanged: my contact_name for the sender → sender's display_name → NULL (the notify layer adds phone). Self-created rows (`from_user_id` NULL) get NULL attribution, same as today.
- **Hide filter:** each row has exactly one sender, so "suppress events whose only incoming shares are from hidden people" collapses to `hp.id IS NULL`. Hiding Sarah suppresses the row Sarah sent; a second row of the same listing from Bob still shows.
- `sharer_user_id` keeps its current contract (`COALESCE(..., p_user_id)`); the client maps but never branches on it today.

### `deliver_pending_shares` (trigger, rewritten)

Same trigger point (`AFTER UPDATE OF user_id ON public.my_people`). Pending copies are stamped from the sender's row **as it is at sign-up**, so pre-sign-up edits are simply included (confirms the FEATURES.md draft answer).

```sql
IF NEW.user_id IS NOT NULL AND OLD.user_id IS DISTINCT FROM NEW.user_id THEN
  INSERT INTO public.events
    (owner_id, url, title, description, image_url, event_date, event_time,
     from_event_id, from_user_id)
  SELECT NEW.user_id, s.url, s.title, s.description, s.image_url,
         s.event_date, s.event_time, s.id, s.owner_id
  FROM public.sends sd
  JOIN public.events s ON s.id = sd.event_id
  WHERE sd.person_id = NEW.id
    AND s.owner_id <> NEW.user_id
  ON CONFLICT (owner_id, from_event_id) WHERE from_event_id IS NOT NULL DO NOTHING;
END IF;
RETURN NEW;
```

If the sender removed their row (or deleted their account) before the recipient signs up, the `sends` row cascaded away with it and nothing is delivered — same as today.

### `delete_my_account` — unchanged body, new cascade graph

`DELETE FROM auth.users WHERE id = auth.uid()` stays. The cascades now do the whole job: the caller's `events` rows go (owner cascade) and their `sends` go with them; followers' rows survive with `from_event_id`/`from_user_id` SET NULL — they keep the event, following ends, attribution disappears (exactly today's post-delete behavior); other users' contact rows for the caller revert to pending (`my_people.user_id` SET NULL, unchanged).

## Id scoping

Today one global snapshot id is valid for every user, and two mechanisms depend on it. With per-user rows, ids are owner-scoped; both mechanisms get explicit rules.

### `send-notification`: per-recipient row ids in push payloads

The function currently computes `const eventId = userEvent.event_id` once and puts it in every recipient's push `data.eventId`. Post-cutover each recipient's push must carry **that recipient's own row id**, or tapping the notification lands on "Event not found."

Interface decision: **the function resolves copies itself** — the client call shape stays `{ eventId, personIds? }` (renamed from `userEventId`; still the *sender's* row id), and inside the per-recipient loop the function looks up the copy it just delivered:

```
recipient copy = SELECT id FROM public.events
                 WHERE from_event_id = <sender row id> AND owner_id = <recipient user id>
```

Push for that recipient carries `data.eventId = <copy id>`. If the copy row is missing (recipient removed it in the race between share and notify), skip the push and still send the SMS. The alternative — `share_event` returning a person→row-id map that the client passes through — was considered and rejected: it widens the client/server contract for no benefit, since the function already has service-role access.

SMS is unaffected: it carries the listing's own URL and no app links (distribution-strategy rule). When SMS Links at Launch ships, its app-user deep link inherits this contract — either per-recipient row ids (same resolution) or the sender's row id relying on the client fallback below.

### `event/[id].tsx`: resolution chain for ids the caller doesn't own

Today the screen resolves `user_events WHERE event_id = :id` when no `userEventId` param exists (the notification-tap path passes only the snapshot id). Post-cutover rule, in order:

1. `SELECT ... FROM events WHERE id = :id` — RLS returns the row only if it's the caller's own. (Calendar taps and post-cutover notification taps land here.)
2. On no row: `SELECT ... FROM events WHERE from_event_id = :id` — the caller's copy of a followed sender's row. Covers taps carrying the sender's row id (future deep links, any sender-perspective payload).
3. Still nothing → the existing "Event not found" / access-revoked UI.

Known limitation (accepted): a **pre-cutover** notification tapped post-cutover carries a legacy snapshot id that no new row references (the backfill mints new ids), so it lands on "Event not found" — a quiet failure consistent with the accepted native outage. The fallback exists for post-cutover sender-row-id taps, not to rescue stale pre-cutover payloads.

`app/_layout.tsx`'s tap handler (`params: { id: eventId }`) is unchanged code; only the id's meaning changes.

## Client changes (file by file)

- `lib/types.ts` — `Event` becomes the per-user row (`owner_id`, `from_event_id`, `from_user_id`, `frozen`, `updated_at`; drop `created_by_user_id`). Delete `UserEvent` and `EventShare`; add `Send { id, event_id, person_id, created_at }`. `CalendarEvent` drops `event_id`; `id` is the row id.
- `lib/eventPreviewCache.ts` — keyed by the row id; the `userEventId` field disappears.
- `app/(app)/index.tsx` — maps the new `CalendarEvent` (single id). Onboarding gate and retry banner unchanged.
- `components/Calendar.tsx` — navigates with `{ id }` (row id) + `sharedByPersonId`; no more `userEventId` param.
- `components/EventCard.tsx` — unchanged (renders `sharer_contact_name`).
- `app/(app)/add-event.tsx` — create via `save_event` with a client-generated uuid. The global URL "use existing" prompt (`checkExistingEvents` against the shared table) is replaced by a per-user check against the caller's own rows (see Open Questions → create-path dedup).
- `app/(app)/edit-event.tsx` — the five-call fork, the `23505` merge, and the candidate-event reconcile branch are deleted. Save is one `save_event` call inside `withWriteTimeout`. Timeout reconcile simplifies to: read the row by id; if every field matches the intended values, navigate; otherwise show the friendly alert. (The interim B-1 layers — timeout split, friendly failures, latency e2e, conventions rules — all survive unchanged.)
- `app/(app)/share.tsx` — params collapse to `{ eventId }`; ✓ Shared loads from `sends`; calls `share_event(p_event_id, ...)`; invokes `send-notification` with `{ eventId, personIds }`. The `user_events` ensure-ownership block is deleted (the calendar/detail screens only ever link to rows the caller owns).
- `app/(app)/event/[id].tsx` — the resolution chain above; "Shared with" reads `sends`; remove deletes the caller's own row (unchanged UX); hide/unhide via the `sharedByPersonId` param (unchanged).
- `supabase/functions/send-notification/index.ts` — per Id scoping above; ownership check becomes `events.owner_id = caller`; reads `sends` instead of `event_shares`.
- `supabase/functions/cleanup-events/` — deleted. `cleanup-people` stays (touches `my_people` only; its cascades now reach `sends` and `from_user_id` instead of `event_shares`).

## Backfill

Runs inside the cutover migration, after the new tables are created. Data volume is tiny (internal testing), so the row-by-row loop is deliberate — readable and exactly correct, no set-based cleverness.

```sql
-- 0. Rename, don't drop (rollback element 3).
ALTER TABLE public.events       RENAME TO legacy_events;
ALTER TABLE public.user_events  RENAME TO legacy_user_events;
ALTER TABLE public.event_shares RENAME TO legacy_event_shares;
-- (create new tables, policies, functions as above)

-- 1. One new events row per legacy_user_events row, fields from its snapshot.
--    A temp map ties each legacy pointer to its new row for steps 2-3.
CREATE TEMP TABLE _ue_map (
  legacy_ue_id uuid PRIMARY KEY,
  new_event_id uuid NOT NULL,
  owner_id uuid NOT NULL,
  legacy_snapshot_id uuid NOT NULL
) ON COMMIT DROP;

-- (plpgsql block)
FOR r IN
  SELECT ue.id AS ue_id, ue.user_id, ue.created_at AS ue_created_at, e.*
  FROM legacy_user_events ue
  JOIN legacy_events e ON e.id = ue.event_id
LOOP
  INSERT INTO public.events
    (owner_id, url, title, description, image_url, event_date, event_time, created_at, updated_at)
  VALUES
    (r.user_id, r.url, r.title, r.description, r.image_url, r.event_date, r.event_time,
     r.ue_created_at, r.ue_created_at)
  RETURNING id INTO v_new_id;
  INSERT INTO _ue_map VALUES (r.ue_id, v_new_id, r.user_id, r.id);
END LOOP;

-- 2. Every legacy_event_shares row becomes a sends line on the SENDER's new row.
INSERT INTO public.sends (event_id, person_id, created_at)
SELECT m.new_event_id, es.person_id, es.created_at
FROM legacy_event_shares es
JOIN _ue_map m ON m.legacy_ue_id = es.user_event_id;

-- 3. Follow links: exact snapshot match only. A recipient copy links to the
--    sender's new row only when the recipient's copy is of the snapshot the
--    sender's pointer references NOW (i.e. the sender never forked after
--    sharing). Forked shares backfill as independent rows (from_* NULL) —
--    the fork graph is lossy and we do not guess. When several senders'
--    shares match one recipient copy (today's shared-snapshot case), the
--    most recent share wins the link, matching the current DISTINCT ON
--    attribution; the other senders keep their sends lines from step 2.
WITH candidate AS (
  SELECT DISTINCT ON (mr.new_event_id)
    mr.new_event_id  AS recipient_new_id,
    ms.new_event_id  AS sender_new_id,
    ue_s.user_id     AS sender_user_id
  FROM legacy_event_shares es
  JOIN legacy_user_events ue_s ON ue_s.id = es.user_event_id
  JOIN _ue_map ms ON ms.legacy_ue_id = ue_s.id
  JOIN public.my_people mp ON mp.id = es.person_id
  JOIN legacy_user_events ue_r
    ON ue_r.user_id = mp.user_id AND ue_r.event_id = ue_s.event_id
  JOIN _ue_map mr ON mr.legacy_ue_id = ue_r.id
  WHERE mp.user_id IS NOT NULL
    AND mp.user_id <> ue_s.user_id
  ORDER BY mr.new_event_id, es.created_at DESC
)
UPDATE public.events e
SET from_event_id = c.sender_new_id,
    from_user_id  = c.sender_user_id
FROM candidate c
WHERE e.id = c.recipient_new_id;
```

- All backfilled rows are `frozen = false`. Rows with `from_event_id` NULL follow nothing, so there is nothing to freeze from.
- Pending contacts (no account) get no row — their `sends` lines from step 2 deliver at sign-up via the new trigger, stamped with the sender's current values at that moment.
- Self-shares (a contact row resolving to the owner's own account) are excluded everywhere (`mp.user_id <> ue_s.user_id`), matching today.

## Cutover

One coordinated session, in this order. Precondition: the implementation is complete as a local commit on top of `staging` — client, migration, tests, docs together — with the fast checks green locally (`npx tsc --noEmit && npm run test:conventions && npm test -- --runInBand && npm run test:sql`). There is exactly one Supabase project (`ijmwtjyuvdnvhblwwtpt`) serving both the staging preview and production, so the schema cutover is global the moment step 5 runs; production web and old native builds are down from step 5 until step 10 (accepted — owner decision 5).

1. **Tag the restore point:** `git tag forwarding-model-final <last pre-cutover commit>` and push the tag (rollback element 1).
2. **Snapshot:** `pg_dump` the live database immediately before migrating; verify the file restores (it is also the rehearsal input — element 4/5).
3. **Rehearse** on the restored copy: apply the migration, run the verification queries, execute the revert procedure, verify the round-trip (rollback elements 5–6). If anything fails, stop — the live project is untouched.
4. **Native builds:** build and submit from the **local implementation commit** — `eas build` uploads the local project and does not need the commit pushed anywhere. The commit must be final: the exact SHA built here is pushed unchanged at step 7, so the binaries match the shipped code. `eas build --platform android --profile production --non-interactive --wait` + `eas submit`, and the iOS equivalents with the ASC key setup from AGENTS.md. Submitting before the migration lets store processing overlap the outage so auto-update (Play on its idle/wifi schedule; TestFlight faster) delivers the fixed binary. Builds are metered — one per platform, no speculative rebuilds; if the post-migration blocker policy forces a client fix, the fix-forward path produces a new commit and a second pair of builds (accepted). (Alternative considered and rejected: push to `staging` before the migration and let the full suite run red against the old schema until the migration lands — a deliberately red run erodes the "red means fix forward" signal, and the staging preview keeps serving the old, now-broken client during the window.)
5. **Apply the migration:** `npx supabase db push` against the linked project. The migration also unschedules the `cleanup-events-weekly` cron job (defensive `DO` block calling `cron.unschedule` when the job exists; runbook fallback: SQL editor).
6. **Deploy the edge function:** `npx supabase functions deploy send-notification --project-ref ijmwtjyuvdnvhblwwtpt`; delete `cleanup-events` (`npx supabase functions delete cleanup-events`).
7. **Push the client to `staging`** — the same SHA built in step 4, unchanged. The full suite runs in CI (e2e now passes against the new schema) and the staging preview redeploys when green.
8. **Go/no-go verification queries** against the live DB (below).
9. **Manual regression subset** on the staging preview: E-104 (share lands), E-108 (forwarding), E-105 (hide), an edit-propagation pass, and a pending-signup delivery pass (third test-OTP account per the AGENTS.md runbook).
10. **Release review** per `scripts/release-review-orchestrator.md`, with the post-migration blocker policy below in force. On SHIP: `git push origin origin/staging:production` — production web is restored by the deploy. Native testers receive the step-4 binaries via auto-update; no messaging (owner decision 6).

### Post-migration blocker policy (named exception to the review rules)

The standard ship-it rule — on a blocker, halt everything, write the DON'T SHIP report, end the turn, never fix mid-review — assumes production keeps working during the review. Between steps 5 and 10 that is false. For this release window only:

- **Client-side or edge-function blocker** (fixable by a web redeploy / function redeploy): **fix forward.** Fix, re-run the failed checks, continue the review. The fix is reviewed like any other finding.
- **Schema, migration, or backfill blocker** (data is wrong): **roll back** per the rollback plan (code revert + data revert), restoring production to the forwarding model; then write the DON'T SHIP report and end the turn.
- Either way, the release report records which branch was taken and why.

### Go/no-go verification queries

GO requires all of:

- `SELECT count(*) FROM public.events` = `SELECT count(*) FROM legacy_user_events`
- `SELECT count(*) FROM public.sends` = `SELECT count(*) FROM legacy_event_shares`
- Per-user counts match (`owner_id` vs legacy `user_id`, grouped counts equal)
- Zero new rows violating the follow FK (impossible by constraint — asserted anyway)
- Spot-check ≥ 3 shared events: the recipient's row exists, fields match the sender's row, `from_event_id` points at the sender's row, and both calendars render it
- Cascade smoke test on the staging preview: A shares to B, A edits the time, B's row shows the new time on next focus; B edits the title, A's second edit no longer reaches B
- Pending-signup smoke test: share to a fresh test-OTP number, sign up, event present with the sender's current values

Any failure is NO-GO → rollback plan.

## Rollback plan (owner requirement — part of the implementation)

Code rollback is a git revert; data rollback is the one-way door. These seven elements keep the door open.

1. **Named restore point.** The `forwarding-model-final` tag on the last pre-cutover commit, pushed to origin. The old behavior — `docs/events-technical-architecture.md`, agent context, migrations, `supabase/tests/forwarding_semantics.sql`, client — is one findable point.
2. **Archived plain-language description.** `docs/archive/forwarding-model.md`, written as part of the implementation: the old model's rules (share = copy at send time; edits never propagate — fork-on-edit with the five-call save; remove is personal; global dedup on `(url, title, date, time)`; attribution reconstructed from the share log; hide via the share-log filter; pending delivery on sign-up; orphan-snapshot GC) **including the bugs it carried** (the B-1 class, KI-002, vanishing From-X, re-share double copy) — so a future revert knows both the behavior and its price.
3. **Legacy tables renamed, not dropped.** `legacy_events` / `legacy_user_events` / `legacy_event_shares` live, client-revoked, for a **30-day soak window** after production cutover; a follow-up migration drops them after the soak.
4. **Database snapshot.** `pg_dump` immediately before the migration (cutover step 2), retained until the soak ends.
5. **Backfill rehearsal.** The migration runs against a restored copy of the real dump before the real run (cutover step 3).
6. **Written revert procedure, rehearsed on the restored copy** (there is no staging database — a "staging" drill would be a second live-data outage). The drill runs the full round-trip on the copy: restore → migrate → verify → revert → verify. The revert procedure itself:
   - **Code:** git revert the cutover commits, redeploy web + `send-notification`, redeploy `cleanup-events` and re-schedule its cron job.
   - **Data, option A (fast, loses soak-window writes):** drop the new tables, rename the legacy tables back. Anything shared or edited during the soak is lost.
   - **Data, option B (preserves soak-window writes, lossy):** reverse-backfill first — each new `events` row becomes a `legacy_events` snapshot + `legacy_user_events` pointer (ON CONFLICT DO NOTHING against the restored dedup index; a second sender's row of the same listing collapses into the first, losing that attribution), each `sends` row becomes a `legacy_event_shares` row. Follow links have no legacy home and are discarded. Then rename back.
   - The drill exercises option B once (option A is trivial); the written procedure states the choice rule: soak ≤ 1 day and few writes → A; otherwise B.
7. **Post-cutover verification queries with go/no-go criteria** — the list above, run at step 8 and again during the soak on demand.

## Open questions from FEATURES.md — closed here

- **Hide vs corrections arriving via someone you follow:** confirmed default. Hide filters (a) calendar visibility of rows whose direct sender is hidden and (b) share notifications from hidden people. It does **not** block cascade updates walking through a followed row — the correction arrives via the person you follow, not from the hidden person. Unhiding restores visibility with all corrections already applied.
- **Create-path dedup:** the global "use existing" prompt dies with the shared table. In its place, `add-event` keeps a **per-user** check: pasting a URL already on *my* calendar offers to jump to the existing row instead of adding a second copy. No cross-user aspect.
- **Cycles:** cannot form (follow pointers are write-once at copy creation; sharing mints new rows). The recursive cascade's UNION visited-set terminates regardless. Two users sharing the same listing to each other simply get two rows each following its sender — reads sensibly. No special handling.
- **Creator-Linked Events:** superseded. Copy + Follow delivers the wanted half (a time fix reaches the people you told) without the hosted-event model. At implementation, the FEATURES.md entry is edited to point here as the chosen direction; hosted events stay unbuilt.
- **Soak window:** 30 days after production cutover, then a drop-legacy migration.
- **Native-tester messaging:** none (owner decision 6).

## Test plan

### SQL semantics (`bash supabase/tests/run_local.sh`)

Rewrite `supabase/tests/forwarding_semantics.sql` as `copy_follow_semantics.sql` (the harness globs `*_semantics.sql`), covering:

1. Share delivers the recipient's own copy with `from_event_id`/`from_user_id` set; `sends` recorded; pending contact gets no copy yet
2. Re-share chain A→B→C: C's row follows B's row, not A's
3. Edit cascade depth ≥ 2: A edits → B's and C's rows updated; both still following
4. Frozen pruning: B edits → B stops following A; B's edit cascades to C; A's later edit reaches neither B nor C
5. Remove: A deletes their row → B/C keep theirs; `from_event_id` SET NULL; no further updates
6. Hide: hiding A suppresses A's row from the calendar; unhide restores it; cascades still update the hidden row while hidden
7. Two senders, same listing: two rows, each following its own sender
8. Pending delivery: share to a non-account, edit after sharing, then sign up → copy carries the post-edit values
9. IDOR: cannot select another user's rows (RLS), cannot `save_event`/`share_event` a row you don't own, cannot record sends against another user's contacts
10. No-op save does not freeze (fields unchanged → still following → a later sender edit still lands)
11. Cycle safety: hand-craft a follow loop as definer, then `save_event` terminates and each row updates at most once
12. `delete_account_test.sql` / `display_name_test.sql` updated to the new tables (attribution via the live `from_user_id` join; account delete → followers keep rows, `from_*` SET NULL)

### Jest (`npm test -- --runInBand`)

Rewrite the model-coupled suites: `edit-event` (single `save_event`; no `23505` merge; reconcile = read my row by id), `share` (`p_event_id`; `sends`; `{ eventId, personIds }` notify body), `event-detail` (resolution chain incl. the `from_event_id` fallback; remove deletes own row), `index` + `Calendar` (single-id `CalendarEvent`, nav params), `eventPreviewCache` (row-id keyed), `EventCard` (shape update).

### E2E (`npm run build:web && npm run test:e2e`)

- `write-latency.spec.ts` stubs `save_event` instead of `find_or_create_event` (delayed save still lands; delayed calendar read still banners).
- `share` / `hide` / `event-detail` / `visual` specs updated to the single-id model.
- New edit-propagation spec: A shares to B → A edits → B sees the update on refocus → B edits → A's second edit does not reach B.
- New notification-tap assertion (web-testable via URL): as the recipient, navigating to `/event/<sender's row id>` lands on the recipient's own copy via the fallback — not "Event not found."
- Per-recipient push-id resolution in `send-notification` is verified by code review plus the native N-005 smoke path (push has no web surface).

### Manual regression

Update E-103–E-109 and M-005–M-007 wording (own row, not `user_events` copy); add a follow-cascade test and a pending-delivery-stamps-current-values test; close KI-002 and record the B-1 class as deleted in `manual-tests/known_issues.md`.

## Docs updated in the implementation change

`docs/events-technical-architecture.md` (model, queries, flows, RLS sections), `.cursor/rules/project.mdc` (architectural rules + data-flow cheat sheet), `README.md`, `SETUP.md` (migration list; `cleanup-events` removed), `FEATURES.md` (status + Creator-Linked pointer), `docs/archive/forwarding-model.md` (rollback element 2), `manual-tests/known_issues.md`, `manual-tests/cloud_manual_regression.md`.

## Acceptance criteria

- [x] Owner approves this spec before any migration is written — approved 2026-08-21.
- [ ] Implementation includes the data migration and the full rollback plan above — not as follow-ups.
- [ ] v1 ships no edit-triggered notifications (push or SMS); edits propagate silently.
- [ ] Any field-changing save ends following; no-op saves do not.
- [ ] Two senders delivering the same listing produce two rows, each following its sender.
- [ ] Tapping a share notification lands on the recipient's own copy (per-recipient push ids + the `from_event_id` fallback).
- [ ] All suites green on the staging push: tsc, conventions, Jest, SQL semantics, web build, Playwright (desktop Chrome, Mobile Safari, Mobile Chrome).
