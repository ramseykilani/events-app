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

export function timeoutSignal(ms = FETCH_TIMEOUT_MS): {
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

export async function withTimeout<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  ms = FETCH_TIMEOUT_MS
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

export async function withRetries<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  attempts = FETCH_ATTEMPTS,
  ms = FETCH_TIMEOUT_MS
): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await withTimeout(fn, ms);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}
