import { isReservedTestPhone } from '../../lib/reservedPhone';

describe('isReservedTestPhone', () => {
  it('matches standing e2e accounts in E.164 and digits-only form', () => {
    expect(isReservedTestPhone('+15555550100')).toBe(true);
    expect(isReservedTestPhone('15555550103')).toBe(true);
    expect(isReservedTestPhone('+1 555 555 0110')).toBe(true);
  });

  it('does not match real-format numbers, including other 555 exchanges', () => {
    expect(isReservedTestPhone('+14165551234')).toBe(false);
    expect(isReservedTestPhone('+16462655565')).toBe(false);
    expect(isReservedTestPhone('+15145550100')).toBe(false);
  });

  it('rejects empty values', () => {
    expect(isReservedTestPhone(null)).toBe(false);
    expect(isReservedTestPhone(undefined)).toBe(false);
    expect(isReservedTestPhone('')).toBe(false);
  });
});
