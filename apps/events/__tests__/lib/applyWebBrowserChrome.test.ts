/**
 * @jest-environment jsdom
 */
import { Platform } from 'react-native';
import { applyWebBrowserChrome } from '../../lib/applyWebBrowserChrome';
import { Colors } from '../../constants/Colors';

/** jsdom may round-trip hex style colors as rgb(); normalize for assertions. */
function cssColor(value: string): string {
  const hex = value.trim().match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
  }
  return value.replace(/\s+/g, ' ');
}

describe('applyWebBrowserChrome', () => {
  const originalOS = Platform.OS;

  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    document.documentElement.style.backgroundColor = '';
    document.documentElement.style.colorScheme = '';
    document.body.style.backgroundColor = '';
    document.body.style.colorScheme = '';
  });

  afterEach(() => {
    Platform.OS = originalOS;
  });

  it('is a no-op off web', () => {
    Platform.OS = 'ios';
    applyWebBrowserChrome(Colors.evening);
    expect(document.querySelector('meta[name="theme-color"]')).toBeNull();
    expect(document.getElementById('events-safari-chrome')).toBeNull();
  });

  it('paints Evening onto document chrome and theme-color', () => {
    Platform.OS = 'web';
    applyWebBrowserChrome(Colors.evening);

    expect(cssColor(document.documentElement.style.backgroundColor)).toBe(
      cssColor(Colors.evening.background)
    );
    expect(cssColor(document.body.style.backgroundColor)).toBe(
      cssColor(Colors.evening.background)
    );
    expect(document.documentElement.style.colorScheme).toBe('dark');
    expect(
      document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.content
    ).toBe(Colors.evening.background);
    expect(
      cssColor(document.getElementById('events-safari-chrome')!.style.backgroundColor)
    ).toBe(cssColor(Colors.evening.background));
  });

  it('switches back to Paper light chrome without duplicating meta', () => {
    Platform.OS = 'web';
    applyWebBrowserChrome(Colors.evening);
    applyWebBrowserChrome(Colors.paper);

    expect(document.querySelectorAll('meta[name="theme-color"]')).toHaveLength(1);
    expect(
      document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.content
    ).toBe(Colors.paper.background);
    expect(document.documentElement.style.colorScheme).toBe('light');
    expect(
      cssColor(document.getElementById('events-safari-chrome')!.style.backgroundColor)
    ).toBe(cssColor(Colors.paper.background));
  });
});
