export const AUTH_FILE_A = 'e2e/.auth/user-a.json';
export const AUTH_FILE_B = 'e2e/.auth/user-b.json';

// Fictional NANP-555 numbers registered in supabase/config.toml
// [auth.sms.test_otp] for the LOCAL stack only (one shared local code, not a
// secret — it works nowhere else). 0200/0201 are the standing couple the
// setup project pairs; 0202–0209 are minted by specs that need fresh people.
export const LOCAL_OTP = '246810';
export const PHONE_A = '+15555550200';
export const PHONE_B = '+15555550201';
export const NAME_A = 'Ramsey';
export const NAME_B = 'Natasha';
