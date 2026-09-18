import { Alert, Platform } from 'react-native';

/**
 * Show a detailed error dialog for alpha/beta debugging.
 * Includes the error message, error code (if present), stack trace, and raw JSON dump.
 */
export function showError(title: string, err: unknown): void {
  const parts: string[] = [];

  if (err instanceof Error) {
    parts.push(err.message);

    // Supabase errors often carry extra fields not present on the Error type
    const rec = err as unknown as Record<string, unknown>;
    const code = rec.code;
    if (code) parts.push(`Code: ${code}`);

    const details = rec.details;
    if (details) parts.push(`Details: ${details}`);

    const hint = rec.hint;
    if (hint) parts.push(`Hint: ${hint}`);

    if (err.stack) parts.push(`\nStack:\n${err.stack}`);
  } else if (typeof err === 'object' && err !== null) {
    // Handle Supabase PostgrestError or other plain error objects
    const obj = err as Record<string, unknown>;
    if (obj.message) parts.push(String(obj.message));
    if (obj.code) parts.push(`Code: ${obj.code}`);
    if (obj.details) parts.push(`Details: ${obj.details}`);
    if (obj.hint) parts.push(`Hint: ${obj.hint}`);

    parts.push(`\nRaw:\n${JSON.stringify(err, null, 2)}`);
  } else if (err !== undefined && err !== null) {
    parts.push(String(err));
  }

  if (parts.length === 0) {
    parts.push('Unknown error (no details available)');
  }

  const message = parts.join('\n');

  // react-native-web's Alert.alert is a no-op, so use the browser dialog to
  // keep failures visible on web.
  if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.alert === 'function') {
    window.alert(`${title}\n\n${message}`);
    return;
  }

  Alert.alert(title, message);
}
