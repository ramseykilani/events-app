import {
  FETCH_ATTEMPTS,
  FETCH_TIMEOUT_MS,
  NETWORK_BACKSTOP_TIMEOUT_MS,
  WRITE_TIMEOUT_MS,
  boundedFetch,
  isAbortError,
  withFetchTimeout,
  withRetries,
  withWriteTimeout,
} from '../../lib/timeoutSignal';

describe('lib/timeoutSignal', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('keeps the write budget well above the load-fetch budget', () => {
    expect(WRITE_TIMEOUT_MS).toBeGreaterThan(FETCH_TIMEOUT_MS * FETCH_ATTEMPTS);
  });

  it('withFetchTimeout resolves when the work finishes before the budget', async () => {
    const result = withFetchTimeout(async () => 'ok');
    await expect(result).resolves.toBe('ok');
  });

  it('withFetchTimeout rejects with AbortError when the work never settles', async () => {
    const result = withFetchTimeout(() => new Promise(() => {}));
    const assertion = expect(result).rejects.toMatchObject({ name: 'AbortError' });
    await jest.advanceTimersByTimeAsync(FETCH_TIMEOUT_MS);
    await assertion;
  });

  it('withWriteTimeout holds past the read budget instead of aborting at 2s', async () => {
    let rejected = false;
    const result = withWriteTimeout(() => new Promise(() => {}));
    result.catch(() => {
      rejected = true;
    });
    await jest.advanceTimersByTimeAsync(FETCH_TIMEOUT_MS);
    await Promise.resolve();
    expect(rejected).toBe(false);
    const assertion = expect(result).rejects.toMatchObject({ name: 'AbortError' });
    await jest.advanceTimersByTimeAsync(WRITE_TIMEOUT_MS - FETCH_TIMEOUT_MS);
    await assertion;
    expect(rejected).toBe(true);
  });

  it('withRetries retries the read budget a few times then gives up', async () => {
    const fn = jest.fn(() => new Promise<string>(() => {}));
    const result = withRetries(fn);
    const assertion = expect(result).rejects.toMatchObject({ name: 'AbortError' });
    await jest.advanceTimersByTimeAsync(FETCH_TIMEOUT_MS * FETCH_ATTEMPTS);
    await assertion;
    expect(fn).toHaveBeenCalledTimes(FETCH_ATTEMPTS);
  });

  it('isAbortError recognizes the timeout rejection and ignores other errors', () => {
    expect(isAbortError(Object.assign(new Error('Timed out'), { name: 'AbortError' }))).toBe(true);
    expect(isAbortError(new Error('boom'))).toBe(false);
    expect(isAbortError(null)).toBe(false);
  });
});

describe('boundedFetch', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  // Stands in for RN fetch, which rejects when its AbortSignal fires.
  function spyOnFetchNeverSettling() {
    return jest.spyOn(globalThis, 'fetch').mockImplementation(((
      _input: unknown,
      init?: RequestInit
    ) =>
      new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }))
        );
      })) as typeof fetch);
  }

  it('sits above the write budget so wrapped calls time out on their own signal first', () => {
    expect(NETWORK_BACKSTOP_TIMEOUT_MS).toBeGreaterThan(WRITE_TIMEOUT_MS);
  });

  it('aborts a fetch that never settles once the backstop budget elapses (KI-013)', async () => {
    spyOnFetchNeverSettling();

    const result = boundedFetch('https://example.com/token');
    const assertion = expect(result).rejects.toMatchObject({ name: 'AbortError' });
    await jest.advanceTimersByTimeAsync(NETWORK_BACKSTOP_TIMEOUT_MS);
    await assertion;
    expect(jest.getTimerCount()).toBe(0);
  });

  it('does not abort before the backstop budget', async () => {
    spyOnFetchNeverSettling();

    const result = boundedFetch('https://example.com/token');
    let settled = false;
    result.catch(() => {
      settled = true;
    });
    await jest.advanceTimersByTimeAsync(NETWORK_BACKSTOP_TIMEOUT_MS - 1);
    expect(settled).toBe(false);
  });

  it('forwards a caller-provided signal so app budgets win, and clears the backstop', async () => {
    const fetchSpy = spyOnFetchNeverSettling();
    const upstream = new AbortController();

    const result = boundedFetch('https://example.com/rpc', { signal: upstream.signal });
    const assertion = expect(result).rejects.toMatchObject({ name: 'AbortError' });
    upstream.abort();
    await assertion;

    const passedSignal = fetchSpy.mock.calls[0][1]?.signal;
    expect(passedSignal).toBeInstanceOf(AbortSignal);
    expect(passedSignal).not.toBe(upstream.signal);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('passes a timely response through and clears the backstop timer', async () => {
    const response = { ok: true } as unknown as Response;
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation((() => Promise.resolve(response)) as typeof fetch);

    await expect(boundedFetch('https://example.com/rpc')).resolves.toBe(response);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });
});
