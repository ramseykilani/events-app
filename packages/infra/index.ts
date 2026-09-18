// @family/infra — product-agnostic client infrastructure: the Supabase
// client, timeout budgets, dialog helpers, and auth error mapping.
export * from './timeoutSignal';
export { supabase, resolveClientConfig } from './supabase';
export { showAlert, showConfirm } from './dialogs';
export { showError } from './showError';
export { getAuthUserMessage } from './authErrors';
export { isReservedTestPhone } from './reservedPhone';
