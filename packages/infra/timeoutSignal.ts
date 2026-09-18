// Per-attempt budget is short on purpose: people hit refresh around the
// two-second mark, so an 8s spinner is already a hang. Load paths retry a
// couple of times, then surface the existing "Could not load" UI.
export const FETCH_TIMEOUT_MS = 2000;
export const FETCH_ATTEMPTS = 3;

// Writes must not share that budget. A 2s abort of a save dumps AbortError
// via showError and can leave the server committed while the client still
// shows the old title (B-1, 2026-08-13). An aborted write is reconciled by
// reading, not by blind retry. Navigation stays outside this timer.
export const WRITE_TIMEOUT_MS = 15000;

// The budget is fixed per kind on purpose: withFetchTimeout/withWriteTimeout
// take no ms argument, so a call site cannot pass the wrong one (B-1 was a
// write wrapped in the read default). The generic helpers stay
// module-private — importing them is a conventions violation.
function timeoutSignal(ms: number): {
  signal: AbortSignal;
  cancel: () => void;
} {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return {
    signal: controller.signal,
    cancel: () => clearTimeout(timer),
  };
}

export function isAbortError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'name' in err &&
    (err as { name?: string }).name === 'AbortError'
  );
}

async function withTimeoutMs<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  ms: number
): Promise<T> {
  const { signal, cancel } = timeoutSignal(ms);
  try {
    return await new Promise<T>((resolve, reject) => {
      const onAbort = () => {
        reject(Object.assign(new Error('Timed out'), { name: 'AbortError' }));
      };
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener('abort', onAbort, { once: true });
      fn(signal).then(
        (value) => {
          signal.removeEventListener('abort', onAbort);
          resolve(value);
        },
        (err) => {
          signal.removeEventListener('abort', onAbort);
          reject(err);
        }
      );
    });
  } finally {
    cancel();
  }
}

/** Reads: the 2s "people hit refresh" budget. Load paths use withRetries. */
export function withFetchTimeout<T>(
  fn: (signal: AbortSignal) => Promise<T>
): Promise<T> {
  return withTimeoutMs(fn, FETCH_TIMEOUT_MS);
}

/**
 * Writes: 15s, and never auto-retried — a write may have already committed
 * server-side, so an aborted write is reconciled by reading (save_event is
 * idempotent, which is what makes a same-arguments retry safe), not by
 * blindly trying again.
 */
export function withWriteTimeout<T>(
  fn: (signal: AbortSignal) => Promise<T>
): Promise<T> {
  return withTimeoutMs(fn, WRITE_TIMEOUT_MS);
}

/** Reads only: a few short attempts, then the caller's "Could not load" UI. */
export async function withRetries<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  attempts = FETCH_ATTEMPTS
): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await withFetchTimeout(fn);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

// Backstop for Supabase calls that carry no budget of their own (auth
// refresh/OTP, fire-and-forget invokes). auth-js has no timeout support and
// RN's OkHttp client is built with infinite timeouts, so without this a
// black-holed connection hangs the caller forever — KI-013 was the boot
// spinner waiting on the expired-session refresh after a day idle. Wired as
// global.fetch in lib/supabase.ts, which supabase-js forwards to auth,
// postgrest, storage, and functions. 20s sits above the write budget so
// wrapped calls always time out on their own signal first.
export const NETWORK_BACKSTOP_TIMEOUT_MS = 20000;

export function boundedFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NETWORK_BACKSTOP_TIMEOUT_MS);
  const upstream = init?.signal ?? null;
  const onUpstreamAbort = () => controller.abort();
  if (upstream) {
    if (upstream.aborted) {
      controller.abort();
    } else {
      upstream.addEventListener('abort', onUpstreamAbort, { once: true });
    }
  }
  return fetch(input, { ...init, signal: controller.signal }).finally(() => {
    clearTimeout(timer);
    upstream?.removeEventListener('abort', onUpstreamAbort);
  });
}
