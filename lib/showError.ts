import { Alert } from 'react-native';

/**
 * Show a detailed error dialog for alpha/beta debugging.
 * Includes the error message, error code (if present), stack trace, and raw JSON dump.
 */
export function showError(title: string, err: unknown): void {
  const parts: string[] = [];

  if (err instanceof Error) {
    parts.push(err.message);

    // Supabase errors often carry a `code` property
    const code = (err as Record<string, unknown>).code;
    if (code) parts.push(`Code: ${code}`);

    // Also check for `details` and `hint` (PostgrestError fields)
    const details = (err as Record<string, unknown>).details;
    if (details) parts.push(`Details: ${details}`);

    const hint = (err as Record<string, unknown>).hint;
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

  Alert.alert(title, parts.join('\n'));
}
