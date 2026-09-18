import { formatEventDate, formatPhoneDisplay } from '../../lib/format';

describe('lib/format', () => {
  describe('formatEventDate', () => {
    it('formats an ISO date as a friendly local date', () => {
      expect(formatEventDate('2026-08-07')).toBe('Fri, Aug 7');
    });

    it('does not shift the day across timezones', () => {
      // Midnight UTC boundaries would shift a naive `new Date(iso)` parse
      expect(formatEventDate('2026-01-01')).toBe('Thu, Jan 1');
    });

    it('returns the input when it is not an ISO date', () => {
      expect(formatEventDate('not-a-date')).toBe('not-a-date');
    });
  });

  describe('formatPhoneDisplay', () => {
    it('formats a US E.164 number nationally', () => {
      expect(formatPhoneDisplay('+14165550100')).toBe('(416) 555-0100');
    });

    it('returns the raw string when parsing fails', () => {
      expect(formatPhoneDisplay('abc')).toBe('abc');
    });
  });
});
