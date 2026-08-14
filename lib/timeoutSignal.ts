// Per-attempt budget is short on purpose: people hit refresh around the
// two-second mark, so an 8s spinner is already a hang. Load paths retry a
// couple of times, then surface the existing "Could not load" UI.
export const FETCH_TIMEOUT_MS = 2000;
export const FETCH_ATTEMPTS = 3;

// Writes must not share that budget. A 2s abort of find_or_create_event
// dumps AbortError via showError and can leave the server committed while
// the client still shows the old title (B-1, 2026-08-13). Do not retry an
// aborted write: the RPC is not idempotent with description/image_url
// (KI-002). Navigation stays outside this timer.
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
 * Writes: 15s, and never retried — find_or_create_event may have already
 * committed (KI-002), so an aborted write is reconciled by reading, not by
 * trying again.
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
