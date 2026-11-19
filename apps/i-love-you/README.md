# I Love You

A private messaging and calling app for exactly two people. Channels for
different kinds of talk (each one a name, an icon and a set of settings),
notifications that say which kind of conversation they come from, a drop-in
call room, and a real desktop app. Part of the family monorepo: it uses
`@family/design` (Paper/Evening, the header and button grammar) and
`@family/infra` (Supabase client, timeout budgets, dialogs) unchanged.

- Why it works this way: [`docs/i-love-you-design.md`](../../docs/i-love-you-design.md) (repo root)
- What it does, feature by feature: [`FEATURES.md`](FEATURES.md)
- Getting it running for real (Supabase, Twilio, LiveKit, EAS, desktop): [`SETUP.md`](SETUP.md)
- Where things stand: [`STATUS.md`](STATUS.md)
- Desktop shell: [`desktop/i-love-you`](../../desktop/i-love-you/README.md) (repo root)

## Stack

Expo SDK 54, Expo Router (`(auth)` / `(app)` groups), strict TypeScript;
Supabase (Postgres with RLS on every table, SECURITY DEFINER RPCs, Realtime,
Storage, Edge Functions); phone + SMS OTP sign-in; LiveKit for calls
(`livekit-client` on web, `@livekit/react-native` on phones); Expo push.

## Layout

```
app/(auth)/            sign-in, verify (phone + SMS code)
app/(app)/             pair, channel list (index), channel/[id], channels,
                       new-channel, settings, room; _layout = the shell
                       (two panes ≥900px, call dock, shortcuts, notifications)
app/_context/          SessionContext, ChatContext (the ChatEngine), CallContext (the room)
components/            ChannelList/Row, ChannelSettingsSheet, SettingRows,
                       CallDock, RoomBanner, NotificationNudge, conversation/*, call/*
lib/                   chatEngine, timeline, outbox, cache, realtime, api (the
                       data seam), channelSettings (registry), notifications
                       (.ts web/PWA/Tauri, .native.ts phones), call/ (quality
                       config + platform split), links, format, shortcuts
supabase/migrations/   schema, pairing, channels, messages, realtime/storage/account, push claims
supabase/functions/    livekit-token, send-push (+ _shared: payload grammar, token signer)
supabase/tests/        SQL semantics suites + run_local.sh
e2e/                   Playwright specs + stack.sh (local Supabase + LiveKit)
public/                index.html shell, PWA manifest, icons, service worker
```

## Developing

From the repo root:

```bash
npm install
npm run typecheck && npm run test:conventions      # both apps
npm run test:ily -- --runInBand                     # Jest
npm run test:sql:ily                                # SQL semantics (scratch Postgres)
npm run test:e2e:ily                                # Playwright vs the local stack (needs Docker)
```

Running it locally against a real backend without any account anywhere:

```bash
cd apps/i-love-you
npm run stack:up        # Supabase CLI stack + LiveKit dev server, DB reset, web build in .e2e/dist
npx serve -s .e2e/dist -l 8093    # open http://localhost:8093
# sign in with +1 555 555 0200 … 0209, code 246810 (local stack only)
npm run stack:down
```

For a phone you need a development build (LiveKit needs native WebRTC, so
Expo Go cannot run it): SETUP.md → EAS.
