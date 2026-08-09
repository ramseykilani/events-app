import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

// Must match Colors.paper.background / DEFAULT_THEME. Do not import constants/Colors
// here — that module pulls react-native Platform, which breaks the Node HTML shell.
const DEFAULT_WEB_BACKGROUND = '#faf7f0';

// Static HTML shell for web. Runtime theme changes update these via
// applyWebBrowserChrome; the default matches Paper so first paint isn't white
// against the Dynamic Island / Safari chrome before React hydrates.
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en" style={{ backgroundColor: DEFAULT_WEB_BACKGROUND }}>
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover"
        />
        <meta name="theme-color" content={DEFAULT_WEB_BACKGROUND} />
        <meta name="color-scheme" content="light dark" />
        <ScrollViewStyleReset />
        <style
          dangerouslySetInnerHTML={{
            __html: `html, body { background-color: ${DEFAULT_WEB_BACKGROUND}; }`,
          }}
        />
      </head>
      <body style={{ backgroundColor: DEFAULT_WEB_BACKGROUND }}>{children}</body>
    </html>
  );
}
