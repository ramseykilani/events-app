-- Row Level Security

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.my_people ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.circles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.circle_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_shares ENABLE ROW LEVEL SECURITY;

-- users: read own row only; insert own row (for app fallback when trigger misses)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'users_select_own') THEN
    CREATE POLICY "users_select_own" ON public.users FOR SELECT USING (auth.uid() = id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'users_insert_own') THEN
    CREATE POLICY "users_insert_own" ON public.users FOR INSERT WITH CHECK (auth.uid() = id);
  END IF;
END $$;

-- my_people: owner can CRUD their own
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'my_people_all_own') THEN
    CREATE POLICY "my_people_all_own" ON public.my_people FOR ALL USING (auth.uid() = owner_id);
  END IF;
END $$;

-- circles: owner can CRUD their own
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'circles_all_own') THEN
    CREATE POLICY "circles_all_own" ON public.circles FOR ALL USING (auth.uid() = owner_id);
  END IF;
END $$;

-- circle_members: owner of circle can CRUD
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'circle_members_all_own') THEN
    CREATE POLICY "circle_members_all_own" ON public.circle_members FOR ALL USING (
      EXISTS (
        SELECT 1 FROM public.circles c
        WHERE c.id = circle_id AND c.owner_id = auth.uid()
      )
    );
  END IF;
END $$;

-- events: readable if user created (via user_events) or was shared (via event_shares)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'events_select_shared_or_owned') THEN
    CREATE POLICY "events_select_shared_or_owned" ON public.events FOR SELECT USING (
      created_by_user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.user_events ue
        JOIN public.event_shares es ON es.user_event_id = ue.id
        JOIN public.my_people mp ON mp.id = es.person_id
        WHERE ue.event_id = events.id AND mp.user_id = auth.uid()
      )
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'events_insert_auth') THEN
    CREATE POLICY "events_insert_auth" ON public.events FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
  END IF;
END $$;

-- user_events: create/delete own; read if shared with you
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'user_events_select_own_or_shared') THEN
    CREATE POLICY "user_events_select_own_or_shared" ON public.user_events FOR SELECT USING (
      user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.event_shares es
        JOIN public.my_people mp ON mp.id = es.person_id
        WHERE es.user_event_id = user_events.id AND mp.user_id = auth.uid()
      )
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'user_events_insert_own') THEN
    CREATE POLICY "user_events_insert_own" ON public.user_events FOR INSERT WITH CHECK (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'user_events_update_own') THEN
    CREATE POLICY "user_events_update_own" ON public.user_events FOR UPDATE USING (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'user_events_delete_own') THEN
    CREATE POLICY "user_events_delete_own" ON public.user_events FOR DELETE USING (user_id = auth.uid());
  END IF;
END $$;

-- event_shares: create by user_event owner; read by share recipient
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'event_shares_select_recipient') THEN
    CREATE POLICY "event_shares_select_recipient" ON public.event_shares FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM public.my_people mp
        WHERE mp.id = person_id AND mp.user_id = auth.uid()
      )
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'event_shares_select_owner') THEN
    CREATE POLICY "event_shares_select_owner" ON public.event_shares FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM public.user_events ue
        WHERE ue.id = user_event_id AND ue.user_id = auth.uid()
      )
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'event_shares_insert_owner') THEN
    CREATE POLICY "event_shares_insert_owner" ON public.event_shares FOR INSERT WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.user_events ue
        WHERE ue.id = user_event_id AND ue.user_id = auth.uid()
      )
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'event_shares_delete_owner') THEN
    CREATE POLICY "event_shares_delete_owner" ON public.event_shares FOR DELETE USING (
      EXISTS (
        SELECT 1 FROM public.user_events ue
        WHERE ue.id = user_event_id AND ue.user_id = auth.uid()
      )
    );
  END IF;
END $$;
