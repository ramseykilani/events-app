import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SIX_MONTHS_MS = 180 * 24 * 60 * 60 * 1000;

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  const cutoff = new Date(Date.now() - SIX_MONTHS_MS).toISOString().slice(0, 10);

  const { data: toRemove, error: selectErr } = await supabase
    .from('my_people')
    .select('id')
    .or(`last_shared_at.lt.${cutoff},and(last_shared_at.is.null,added_at.lt.${cutoff})`);

  if (selectErr) {
    console.error('cleanup-people select error:', selectErr);
    return new Response(
      JSON.stringify({ error: selectErr.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const ids = (toRemove ?? []).map((r) => r.id);
  if (ids.length === 0) {
    return new Response(
      JSON.stringify({ deleted: 0 }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  }

  const { error: deleteErr } = await supabase
    .from('my_people')
    .delete()
    .in('id', ids);

  if (deleteErr) {
    console.error('cleanup-people delete error:', deleteErr);
    return new Response(
      JSON.stringify({ error: deleteErr.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  return new Response(
    JSON.stringify({ deleted: ids.length }),
    { headers: { 'Content-Type': 'application/json' } }
  );
});
