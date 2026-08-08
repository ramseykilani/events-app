import { getAuthUserMessage } from '../../lib/authErrors';

describe('lib/authErrors', () => {
  it('maps otp_expired / invalid token errors to friendly copy', () => {
    expect(
      getAuthUserMessage({
        message: 'Token has expired or is invalid',
        code: 'otp_expired',
      })
    ).toMatch(/incorrect or no longer valid/i);

    expect(
      getAuthUserMessage(Object.assign(new Error('Token has expired or is invalid'), { code: 'otp_expired' }))
    ).toMatch(/newest code/i);
  });

  it('maps rate-limit errors to friendly copy', () => {
    expect(
      getAuthUserMessage({
        message: 'For security purposes, you can only request this after 60 seconds.',
        code: 'over_sms_send_rate_limit',
      })
    ).toMatch(/too many codes/i);
  });

  it('maps SMS send failures to friendly copy', () => {
    expect(getAuthUserMessage({ message: 'sms_send_failed' })).toMatch(
      /could not send a verification code/i
    );
  });

  it('returns null for unexpected errors', () => {
    expect(getAuthUserMessage(new Error('database connection refused'))).toBeNull();
    expect(getAuthUserMessage(undefined)).toBeNull();
  });
});
