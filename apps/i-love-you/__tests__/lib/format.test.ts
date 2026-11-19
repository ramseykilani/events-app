import { formatDayLabel, formatDuration, formatInviteCode, formatListTime, formatPhoneDisplay } from '../../lib/format';

describe('format', () => {
  const now = new Date(2026, 10, 18, 15, 0);

  it('labels days relative to now, with the year only when it differs', () => {
    expect(formatDayLabel(new Date(2026, 10, 18, 9).toISOString(), now)).toBe('Today');
    expect(formatDayLabel(new Date(2026, 10, 17, 9).toISOString(), now)).toBe('Yesterday');
    expect(formatDayLabel(new Date(2026, 10, 14, 9).toISOString(), now)).toBe('Saturday');
    expect(formatDayLabel(new Date(2026, 9, 1, 9).toISOString(), now)).toMatch(/Oct 1$/);
    expect(formatDayLabel(new Date(2025, 9, 1, 9).toISOString(), now)).toMatch(/2025/);
  });

  it('list times: time today, then Yesterday, weekday, date', () => {
    expect(formatListTime(new Date(2026, 10, 18, 9, 5).toISOString(), now)).toMatch(/9:05/);
    expect(formatListTime(new Date(2026, 10, 17, 9).toISOString(), now)).toBe('Yesterday');
    expect(formatListTime(new Date(2026, 10, 1, 9).toISOString(), now)).toBe('Nov 1');
  });

  it('formats durations, invite codes and phones', () => {
    expect(formatDuration(65_400)).toBe('1:05');
    expect(formatInviteCode('K7QMPX2D')).toBe('K7QM PX2D');
    expect(formatPhoneDisplay('+14165551234')).toBe('(416) 555-1234');
  });
});
