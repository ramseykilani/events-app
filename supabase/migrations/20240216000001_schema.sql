-- Events app schema
-- Run this in Supabase SQL Editor or via supabase db push

-- Users (extends auth.users)
CREATE TABLE IF NOT EXISTS public.users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  phone_number text UNIQUE NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- My people (user's curated contact list, max 50)
CREATE TABLE IF NOT EXISTS public.my_people (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  phone_number text NOT NULL,
  user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  contact_name text,
  added_at timestamptz NOT NULL DEFAULT now(),
  last_shared_at timestamptz,
  UNIQUE(owner_id, phone_number)
);

CREATE INDEX idx_my_people_owner_id ON public.my_people(owner_id);
CREATE INDEX idx_my_people_user_id ON public.my_people(user_id);

-- Circles (saved groups)
CREATE TABLE IF NOT EXISTS public.circles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Circle members
CREATE TABLE IF NOT EXISTS public.circle_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  circle_id uuid NOT NULL REFERENCES public.circles(id) ON DELETE CASCADE,
  person_id uuid NOT NULL REFERENCES public.my_people(id) ON DELETE CASCADE,
  UNIQUE(circle_id, person_id)
);

-- Events (immutable snapshots)
CREATE TABLE IF NOT EXISTS public.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  url text,
  title text,
  description text,
  image_url text,
  event_date date NOT NULL,
  event_time time,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT events_url_or_title CHECK (url IS NOT NULL OR title IS NOT NULL)
);

CREATE INDEX idx_events_event_date ON public.events(event_date);
CREATE INDEX idx_events_url ON public.events(url) WHERE url IS NOT NULL;

-- Unique for dedup: same url+title+date+time = same snapshot
CREATE UNIQUE INDEX idx_events_dedup ON public.events(
  COALESCE(url, ''), COALESCE(title, ''), event_date, COALESCE(event_time::text, '')
);

-- User events (ownership of a snapshot)
CREATE TABLE IF NOT EXISTS public.user_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, event_id)
);

CREATE INDEX idx_user_events_user_id ON public.user_events(user_id);

-- Event shares (routing)
CREATE TABLE IF NOT EXISTS public.event_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_event_id uuid NOT NULL REFERENCES public.user_events(id) ON DELETE CASCADE,
  person_id uuid NOT NULL REFERENCES public.my_people(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_event_id, person_id)
);

CREATE INDEX idx_event_shares_person_id ON public.event_shares(person_id);
