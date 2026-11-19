# Setup

Everything the owner has to create or supply to run I Love You for real, in
order. Nothing here has been created yet — the app has only run against the
local stack (`e2e/stack.sh`). Every credential below is yours to create; none
is in the repository, and none should ever be.

| You will create | Used for | Where the secret lives |
|-----------------|----------|------------------------|
| A Supabase project | Database, auth, realtime, storage, functions | Dashboard; URL + publishable key go in `.env` / EAS env |
| A Twilio account (Messaging Service) | Sign-in codes by SMS | Supabase Auth settings |
| A LiveKit Cloud project | Calls | Supabase function secrets |
| An Expo/EAS project | Native builds, push tokens | `ILY_EAS_PROJECT_ID`; Expo credentials |
| Firebase project (Android push) | FCM for Expo push | `google-services.json` (public identifiers) + FCM key in Expo |
| APNs key (iOS push) | iOS push | Expo credentials |
| A static host for the web/PWA build | Desktop app (PWA) | Host's own settings |

---

## 1. Supabase project

1. supabase.com/dashboard → **New project**. Name `i-love-you`, a strong
   database password (keep it in your password manager), the region nearest
   you both. A separate project from Events.
2. Project Settings → **API Keys**: note the **Project URL** and the
   **Publishable key** (`sb_publishable_…`). Both are public by design; RLS is
   the boundary.
3. Apply the schema with the CLI (from `apps/i-love-you`):

   ```bash
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push        # applies supabase/migrations in order
   ```

   The migrations also create the private `attachments` storage bucket, its
   policies, the Realtime publication entries and the private-topic policy.
   Check Database → Publications → `supabase_realtime` lists `messages`,
   `channels`, `channel_prefs`, `couple_members`, `couples`.
4. Realtime → Settings: leave **"Allow public access"** OFF (the app uses a
   private channel per couple, authorized by policy).
5. Deploy the functions (both verify the caller's JWT, the default):

   ```bash
   npx supabase functions deploy livekit-token send-push
   ```

## 2. Phone sign-in (Twilio)

1. twilio.com → create an account → buy a number, create a **Messaging
   Service** containing it. For US numbers, complete A2P 10DLC registration
   (the Events repo's `apps/events/docs/a2p-registration.md` is the playbook
   that got Events approved).
2. Supabase → Authentication → Sign In / Providers → **Phone**: enable, choose
   Twilio, paste Account SID, Auth Token and Messaging Service SID.
3. Authentication → SMS template: `I Love You: {{ .Code }} is your sign-in code.`
4. Optional for testing on the hosted project: Authentication → Phone → test
   OTP numbers (fictional 555 numbers only, never real ones) — keep those
   codes out of the repo.

## 3. LiveKit (calls)

1. cloud.livekit.io → **New project**. Settings → **Keys** → create a key;
   note the **WebSocket URL** (`wss://<project>.livekit.cloud`), **API Key**
   and **API Secret** (shown once).
2. Set them as function secrets (never in the app):

   ```bash
   npx supabase secrets set LIVEKIT_URL=wss://<project>.livekit.cloud \
     LIVEKIT_API_KEY=<key> LIVEKIT_API_SECRET=<secret>
   ```

   Without them the call screen says "Calls are not set up on this server
   yet" (the function answers 503).
3. Optional: LiveKit Cloud's Krisp noise filter (FEATURES.md → Krisp).

## 4. Environment for the app

```bash
cp apps/i-love-you/.env.example apps/i-love-you/.env
# EXPO_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
# EXPO_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...
```

Web: `npm run web:ily` (dev) or `npm run build:web:ily` (→ `apps/i-love-you/dist`).

## 5. EAS (iOS and Android builds)

LiveKit needs native WebRTC, so the app runs in a **development build**, not
Expo Go.

1. `cd apps/i-love-you && npx eas-cli login && npx eas-cli init` — creates the
   EAS project; put the printed id in `.env` as `ILY_EAS_PROJECT_ID` (read by
   `app.config.js`) and in EAS env.
2. EAS environment variables (development, preview, production):
   `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`,
   `ILY_EAS_PROJECT_ID` (EAS builds do not read your local `.env`).
3. Bundle ids are `com.rkilani.iloveyou` (iOS and Android). Create the App ID
   in Apple Developer with **Push Notifications** and **Time Sensitive
   Notifications** capabilities (the app requests the time-sensitive
   entitlement for "needs you now").
4. Builds:

   ```bash
   npx eas-cli build --profile development --platform ios      # dev client for your phone
   npx eas-cli build --profile development --platform android
   npx eas-cli build --profile preview --platform android      # sideloadable APK
   ```

## 6. Push notifications

- **Android (FCM):** Firebase console → new project → add an Android app with
  package `com.rkilani.iloveyou` → download `google-services.json` into
  `apps/i-love-you/` (public identifiers; the Events repo commits its own) →
  Expo dashboard → project → Credentials → Android → upload the **FCM V1
  service account key**.
- **iOS (APNs):** Apple Developer → Keys → new key with **Apple Push
  Notifications service** → Expo dashboard → Credentials → iOS → upload it.
  (Not the App Store Connect API key — a different key.)
- Push goes out through Expo's push service from the `send-push` function;
  no extra secret is needed for that.
- After installing, open the app, accept the notification card, and each
  channel appears as its own category in Android's notification settings.

## 7. Desktop

- **PWA (works today):** host `apps/i-love-you/dist` on any static host with
  HTTPS and an SPA fallback (`public/_redirects` is already in Cloudflare
  Pages format). Open it in Chrome/Edge → install icon in the address bar, or
  Safari → File → Add to Dock. Each of you installs it once.
- **Tauri shell (optional):** build it on each Mac/PC —
  `desktop/i-love-you/README.md`.

## 8. Pair

Both of you sign in with your own phone numbers. One taps **Start our
space** and reads the code to the other, who taps **Enter a code**. Done —
nobody else can ever join that space.

---

## Local development without any account

```bash
cd apps/i-love-you
npm run stack:up      # needs Docker
```

`e2e/stack.sh` runs the Supabase CLI stack (port 54321, database on 55422)
with test numbers `+1 555 555 0200`–`0209` (code `246810`, local only,
`supabase/config.toml`), a LiveKit dev server on 7880, the edge functions,
and builds the web bundle against it into `.e2e/dist`.
