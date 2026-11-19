# I Love You — desktop shell (Tauri v2)

The desktop app is the I Love You web build (`apps/i-love-you`) — the same
two-pane desktop layout the installable PWA uses — wrapped in Tauri v2 for
what a browser tab cannot do:

- **Tray icon**; closing the window hides it to the tray so the live
  connection and notifications keep running (Quit is in the tray menu).
- **OS notifications** through `tauri-plugin-notification`; the web build
  uses it automatically when `window.__TAURI__` is present
  (`apps/i-love-you/lib/notifications.ts`), with the same per-channel levels.
- **Single instance** (launching again focuses the window) and a remembered
  window size and position.
- Microphone and camera usage strings / entitlements for calls (macOS).

This directory is deliberately outside the npm workspaces (`apps/*`,
`packages/*`): it is a Rust project with no JavaScript of its own.

## What has been built

Only a Linux debug build, in the cloud VM that scaffolded it (it compiles and
the window renders the app under Xvfb). **No macOS or Windows binary has been
built** — Tauri builds each platform's bundle on that platform. See
`apps/i-love-you/STATUS.md`.

## Prerequisites

- Rust (stable) — https://rustup.rs
- Node 22 and the repo's dependencies (`npm ci` at the repo root)
- macOS: Xcode Command Line Tools (`xcode-select --install`)
- Windows: Microsoft C++ Build Tools ("Desktop development with C++") and
  WebView2 (preinstalled on Windows 11)
- Linux: `libwebkit2gtk-4.1-dev libgtk-3-dev librsvg2-dev
  libayatana-appindicator3-dev libssl-dev pkg-config`

The web build bakes in the Supabase URL and publishable key, so create
`apps/i-love-you/.env` first (SETUP.md → Environment).

## Build

From this directory (`beforeBuildCommand` runs `npm run build:web:ily` at the
repo root first):

```bash
# macOS — produces .app and .dmg under src-tauri/target/release/bundle/
npx @tauri-apps/cli@2 build

# Universal macOS binary (Apple silicon + Intel)
rustup target add aarch64-apple-darwin x86_64-apple-darwin
npx @tauri-apps/cli@2 build --target universal-apple-darwin

# Windows — produces .msi and NSIS .exe under src-tauri\target\release\bundle\
npx @tauri-apps/cli@2 build

# Development window against the built web bundle
npx @tauri-apps/cli@2 dev
```

Distributing outside your own machines needs signing: an Apple Developer ID
certificate and notarization on macOS (`APPLE_SIGNING_IDENTITY`,
`APPLE_ID`/`APPLE_PASSWORD`/`APPLE_TEAM_ID` for `tauri build`), and a code-
signing certificate on Windows. For two people's own computers, an unsigned
build (right-click → Open on macOS once) is enough.

## Icons

Generated from `apps/i-love-you/assets/icon.png`:

```bash
npx @tauri-apps/cli@2 icon ../../apps/i-love-you/assets/icon.png -o src-tauri/icons
```
