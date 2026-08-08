/**
 * Map expected Supabase Auth failures to short, user-facing copy.
 * Returns null for unexpected errors that should still use showError.
 */
export function getAuthUserMessage(err: unknown): string | null {
  const { code, message } = readAuthError(err);
  const normalized = message.toLowerCase();

  if (
    code === 'otp_expired' ||
    normalized.includes('token has expired') ||
    normalized.includes('otp_expired') ||
    (normalized.includes('invalid') && normalized.includes('token'))
  ) {
    return 'That code is incorrect or no longer valid. Enter the newest code we sent, or wait and request a new one.';
  }

  if (
    code === 'over_sms_send_rate_limit' ||
    code === 'over_request_rate_limit' ||
    normalized.includes('rate limit') ||
    normalized.includes('too many requests')
  ) {
    return 'Too many codes requested. Please wait a minute before trying again.';
  }

  if (normalized.includes('sms_send_failed') || normalized.includes('unable to send')) {
    return 'We could not send a verification code to that number. Check the number and try again.';
  }

  return null;
}

function readAuthError(err: unknown): { code: string; message: string } {
  if (err instanceof Error) {
    const rec = err as unknown as Record<string, unknown>;
    return {
      code: typeof rec.code === 'string' ? rec.code : '',
      message: err.message ?? '',
    };
  }

  if (typeof err === 'object' && err !== null) {
    const obj = err as Record<string, unknown>;
    return {
      code: typeof obj.code === 'string' ? obj.code : '',
      message: typeof obj.message === 'string' ? obj.message : '',
    };
  }

  if (typeof err === 'string') {
    return { code: '', message: err };
  }

  return { code: '', message: '' };
}
