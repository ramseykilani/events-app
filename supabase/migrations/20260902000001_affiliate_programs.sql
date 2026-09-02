-- Affiliate Link Tagging (FEATURES.md): the machine-readable on/off registry
-- for outbound listing-link tagging. One row per affiliate program (the
-- registered domains it covers + the network's tracking-link template) plus a
-- single-row global switch. Ships dark: no program rows, global off. Each
-- program is switched on by one SQL INSERT/UPDATE as its network application
-- is approved — no deploy, no app release (docs/affiliate-programs.md →
-- The switch).
--
-- Read access: this is world-readable configuration, not user data — the
-- SELECT USING (true) policies are deliberate (the standing ban on
-- USING (true) is events-specific). There are no write policies, so clients
-- can only read; the service role bypasses RLS, which is how activations
-- are applied.
CREATE TABLE public.affiliate_programs (
  id text PRIMARY KEY,
  -- Registered domains the program covers, lowercase (one program can cover
  -- several: Ticketmaster's covers livenation.com + admission.com, and
  -- regional TLDs like ticketmaster.co.uk are listed explicitly). Matching is
  -- host-equals-or-subdomain against these entries.
  -- cardinality, not array_length: array_length('{}', 1) is NULL and a NULL
  -- CHECK passes, so the empty array would slip through.
  domains text[] NOT NULL CHECK (cardinality(domains) > 0),
  -- The network's tracking-link template; '{url}' is replaced with the
  -- percent-encoded destination URL. Covers both redirect-wrap and
  -- query-param tag formats.
  url_template text NOT NULL CHECK (position('{url}' in url_template) > 0),
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.affiliate_programs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "affiliate_programs_read_all"
  ON public.affiliate_programs FOR SELECT USING (true);

-- Single-row global switch: the strip lever if anything about tagging needs
-- to go off everywhere at once (the RESPONSE_LINK_BASE_URL precedent).
CREATE TABLE public.affiliate_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  enabled boolean NOT NULL DEFAULT false
);

ALTER TABLE public.affiliate_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "affiliate_config_read_all"
  ON public.affiliate_config FOR SELECT USING (true);

INSERT INTO public.affiliate_config (id, enabled) VALUES (true, false);
