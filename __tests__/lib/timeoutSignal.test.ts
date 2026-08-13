import {
  FETCH_ATTEMPTS,
  FETCH_TIMEOUT_MS,
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

  it('retries the budget a few times then gives up', async () => {
    const fn = jest.fn(() => new Promise<string>(() => {}));
    const result = withRetries(fn);
    const assertion = expect(result).rejects.toMatchObject({ name: 'AbortError' });
    await jest.advanceTimersByTimeAsync(FETCH_TIMEOUT_MS * FETCH_ATTEMPTS);
    await assertion;
    expect(fn).toHaveBeenCalledTimes(FETCH_ATTEMPTS);
  });
});
