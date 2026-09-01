-- Archive Received Events: deliberately drop the delete-policy hardening.
--
-- 20260901000002 tightened events_delete_own to self-created rows
-- (from_user_id IS NULL) as defense-in-depth for "no delete path for
-- received events". It was applied to the live project before the client
-- shipped and immediately bound every client — the production app still
-- shows Remove Event on received events, so recipients' removes silently
-- no-opped (see FEATURES.md → Archive Received Events → Coordination Notes).
-- The live policy was manually restored to owner-only.
--
-- Decision (2026-09-01): the hardening stays dropped. The approved Technical
-- Notes deliver the no-delete path via the UI (Archive replaces Remove Event
-- on received rows — pinned by Jest, e2e, and preview provenance), and
-- set_event_archived rejects self-created rows server-side. The ship-it
-- protocol has no migration-timing step, so a DB-only invariant cannot be
-- reliably synchronized with the production client — optional belt-and-
-- braces is not worth a repeat of today's production breakage.
--
-- This migration makes the repo's migration chain match the live policy, so
-- local scratch DBs (run_local.sh) and any future fresh project do not
-- silently drift from the shipped reality. On the live project it is a
-- state no-op (the policy is already owner-only).

DROP POLICY events_delete_own ON public.events;
CREATE POLICY events_delete_own ON public.events FOR DELETE
  USING (owner_id = auth.uid());
