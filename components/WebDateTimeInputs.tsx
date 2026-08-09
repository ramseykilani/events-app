import React from 'react';
import { useTheme } from '../hooks/useTheme';

// Web-only date/time inputs. @react-native-community/datetimepicker is
// native-only (its pickers never open in the browser), so the add/edit event
// forms render these HTML inputs on web instead. Only import this file behind
// a Platform.OS === 'web' guard.

function toDateInputValue(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function toTimeInputValue(date: Date): string {
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

function inputStyle(borderColor: string): React.CSSProperties {
  return {
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    fontFamily: 'inherit',
    backgroundColor: 'transparent',
    color: 'inherit',
    width: '100%',
    boxSizing: 'border-box',
  };
}

// The browser's segmented date widget makes it easy to mistype the YEAR
// (typing "2026" can land as 1906) and silently save an event a century off.
// min/max constrain the picker; the save path re-validates (see
// isPlausibleEventDate) since typed input can still blow past them.
export const EVENT_DATE_MIN = '2020-01-01';
export const EVENT_DATE_MAX = '2100-12-31';

export function isPlausibleEventDate(date: Date): boolean {
  const year = date.getFullYear();
  return year >= 2020 && year <= 2100;
}

export function WebDateInput({
  value,
  onChange,
}: {
  value: Date;
  onChange: (date: Date) => void;
}) {
  const theme = useTheme();
  return (
    <input
      type="date"
      aria-label="Date"
      style={inputStyle(theme.border)}
      value={toDateInputValue(value)}
      min={EVENT_DATE_MIN}
      max={EVENT_DATE_MAX}
      onChange={(e) => {
        const v = e.target.value; // YYYY-MM-DD
        const [y, m, d] = v.split('-').map(Number);
        // Construct as a local date — `new Date(v)` would parse as UTC and can
        // shift the day in timezones behind UTC.
        if (y && m && d) onChange(new Date(y, m - 1, d));
      }}
    />
  );
}

export function WebTimeInput({
  value,
  onChange,
}: {
  value: Date | null;
  onChange: (date: Date | null) => void;
}) {
  const theme = useTheme();
  return (
    <input
      type="time"
      aria-label="Time (optional)"
      style={inputStyle(theme.border)}
      value={value ? toTimeInputValue(value) : ''}
      onChange={(e) => {
        const v = e.target.value; // "HH:MM", or "" when cleared
        if (!v) {
          onChange(null);
          return;
        }
        const [h, m] = v.split(':').map(Number);
        onChange(new Date(1970, 0, 1, h, m));
      }}
    />
  );
}
