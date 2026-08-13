import {
  FETCH_ATTEMPTS,
  FETCH_TIMEOUT_MS,
  WRITE_TIMEOUT_MS,
  withRetries,
  withTimeout,
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

  it('resolves when the work finishes before the budget', async () => {
    const result = withTimeout(async () => 'ok');
    await expect(result).resolves.toBe('ok');
  });

  it('rejects with AbortError when the work never settles', async () => {
    const result = withTimeout(() => new Promise(() => {}));
    const assertion = expect(result).rejects.toMatchObject({ name: 'AbortError' });
    await jest.advanceTimersByTimeAsync(FETCH_TIMEOUT_MS);
    await assertion;
  });

  it('honors a longer write budget instead of aborting at 2s', async () => {
    let rejected = false;
    const result = withTimeout(() => new Promise(() => {}), WRITE_TIMEOUT_MS);
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

  it('retries the budget a few times then gives up', async () => {
    const fn = jest.fn(() => new Promise<string>(() => {}));
    const result = withRetries(fn);
    const assertion = expect(result).rejects.toMatchObject({ name: 'AbortError' });
    await jest.advanceTimersByTimeAsync(FETCH_TIMEOUT_MS * FETCH_ATTEMPTS);
    await assertion;
    expect(fn).toHaveBeenCalledTimes(FETCH_ATTEMPTS);
  });
});
