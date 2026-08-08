import React from 'react';

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

const inputStyle: React.CSSProperties = {
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: '#ccc',
  borderRadius: 12,
  padding: 14,
  fontSize: 16,
  fontFamily: 'inherit',
  backgroundColor: 'transparent',
  color: 'inherit',
  width: '100%',
  boxSizing: 'border-box',
};

export function WebDateInput({
  value,
  onChange,
}: {
  value: Date;
  onChange: (date: Date) => void;
}) {
  return (
    <input
      type="date"
      aria-label="Date"
      style={inputStyle}
      value={toDateInputValue(value)}
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
  return (
    <input
      type="time"
      aria-label="Time (optional)"
      style={inputStyle}
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
