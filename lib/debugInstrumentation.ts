// #region agent log
// DEBUG-ONLY instrumentation (temporary; remove entirely after the
// invisible-text-on-first-mount investigation is resolved).
//
// Two jobs:
//  1. dbgLog(): emit NDJSON runtime evidence to the browser console AND to a
//     local sink (http://localhost:9100/log -> /opt/cursor/logs/debug.log).
//  2. probeScreenTexts()/scheduleDomProbes(): after paint, walk the DOM and
//     dump everything relevant about text nodes that should be visible
//     (content, geometry, computed style, CSS-rule presence, ancestors,
//     occluding element, fonts/animation state) so we can distinguish:
//       A: browser paint/raster stall (DOM+styles correct, nothing painted)
//       B: atomic CSS rules missing at first paint
//       C: text content empty/wrong at first render
//       D: theme/color-scheme flip making text same color as background
//       E: ancestor hidden/opacity-0/display:none (screen transition state)
//       F: webfont not loaded (document.fonts)
// Everything is a no-op off-web so Jest (Platform.OS='ios') is unaffected.

import { Appearance, Platform } from 'react-native';

const SINK_URL = 'http://localhost:9100/log';

function isWeb(): boolean {
  return Platform.OS === 'web' && typeof document !== 'undefined';
}

export function dbgUrl(): string {
  try {
    if (
      typeof window !== 'undefined' &&
      window.location &&
      typeof window.location.pathname === 'string'
    ) {
      return window.location.pathname + window.location.search;
    }
  } catch {
    /* ignore */
  }
  return '';
}

export function dbgLog(
  location: string,
  message: string,
  data: Record<string, unknown>,
  hypothesisId: string
) {
  const line = JSON.stringify({
    id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: Date.now(),
    location,
    message,
    data,
    hypothesisId,
  });
  // Browser console copy (visible in devtools; Metro does not stream web logs).
  console.log('[DBG]', line);
  if (isWeb() && typeof fetch === 'function') {
    try {
      fetch(SINK_URL, { method: 'POST', body: line }).catch(() => {});
    } catch {
      /* never break the app for logging */
    }
  }
}

type CssSubset = Record<string, string>;

function cssSubset(el: Element): CssSubset {
  const cs = window.getComputedStyle(el);
  const out: CssSubset = {};
  const props = [
    'color',
    'backgroundColor',
    'fontSize',
    'fontWeight',
    'lineHeight',
    'opacity',
    'visibility',
    'display',
    'overflow',
    'position',
    'zIndex',
    'transform',
    'filter',
    'mixBlendMode',
    'clipPath',
    'textIndent',
    'contentVisibility',
  ];
  props.forEach((p) => {
    // @ts-expect-error index access on CSSStyleDeclaration
    const v = cs[p];
    if (v != null && v !== '') out[p] = String(v).slice(0, 120);
  });
  const fill = cs.getPropertyValue('-webkit-text-fill-color');
  if (fill) out.webkitTextFillColor = fill;
  out.fontFamily = (cs.fontFamily || '').slice(0, 80);
  return out;
}

function describeElement(el: Element, allCssText: string) {
  const rect = el.getBoundingClientRect();
  const classes = (el.className || '').toString().split(/\s+/).filter(Boolean);
  const classRulesMissing = classes
    .slice(0, 8)
    .filter((c) => !allCssText.includes('.' + c));
  let occluder: unknown = null;
  if (rect.width > 0 && rect.height > 0) {
    const cx = Math.min(Math.max(rect.left + rect.width / 2, 0), window.innerWidth - 1);
    const cy = Math.min(Math.max(rect.top + rect.height / 2, 0), window.innerHeight - 1);
    const hit = document.elementFromPoint(cx, cy);
    if (hit && hit !== el && !el.contains(hit)) {
      occluder = {
        tag: hit.tagName,
        class: (hit.className || '').toString().slice(0, 80),
        dbg: (hit.getAttribute('data-testid') || undefined) as string | undefined,
      };
    }
  }
  const ancestors: unknown[] = [];
  let node: Element | null = el.parentElement;
  let depth = 0;
  while (node && depth < 10) {
    const cs = window.getComputedStyle(node);
    ancestors.push({
      tag: node.tagName,
      class: (node.className || '').toString().slice(0, 60),
      role: node.getAttribute('role') || undefined,
      hiddenAttr: node.hasAttribute('hidden') || undefined,
      ariaHidden: node.getAttribute('aria-hidden') || undefined,
      inert: node.hasAttribute('inert') || undefined,
      display: cs.display,
      opacity: cs.opacity !== '1' ? cs.opacity : undefined,
      visibility: cs.visibility !== 'visible' ? cs.visibility : undefined,
      transform: cs.transform !== 'none' ? cs.transform.slice(0, 60) : undefined,
      anims: (node.getAnimations ? node.getAnimations().length : 0) || undefined,
    });
    node = node.parentElement;
    depth += 1;
  }
  let checkVisibility: unknown = undefined;
  // Chromium-only: reports false if not painted due to opacity/visibility.
  const elWithCheck = el as Element & {
    checkVisibility?: (opts?: {
      checkOpacity?: boolean;
      checkVisibilityCSS?: boolean;
    }) => boolean;
  };
  if (typeof elWithCheck.checkVisibility === 'function') {
    try {
      checkVisibility = elWithCheck.checkVisibility({
        checkOpacity: true,
        checkVisibilityCSS: true,
      });
    } catch {
      checkVisibility = 'error';
    }
  }
  return {
    tag: el.tagName,
    dbg: el.getAttribute('data-testid') || undefined,
    dir: el.getAttribute('dir') || undefined,
    class: (el.className || '').toString().slice(0, 100),
    text: (el.textContent || '').slice(0, 60),
    rect: {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      w: Math.round(rect.width * 10) / 10,
      h: Math.round(rect.height * 10) / 10,
    },
    css: cssSubset(el),
    classRulesMissing,
    checkVisibility,
    occluder,
    hiddenAttr: el.hasAttribute('hidden') || undefined,
    ariaHidden: el.getAttribute('aria-hidden') || undefined,
    ancestors,
  };
}

function findTextHosts(needle: string): Element[] {
  const out: Element[] = [];
  const all = document.body ? document.body.querySelectorAll('*') : [];
  for (let i = 0; i < all.length && out.length < 3; i++) {
    const el = all[i];
    for (let j = 0; j < el.childNodes.length; j++) {
      const n = el.childNodes[j];
      if (
        n.nodeType === 3 &&
        n.textContent &&
        n.textContent.trim() === needle
      ) {
        out.push(el);
        break;
      }
    }
  }
  return out;
}

export function probeScreenTexts(spec: {
  screen: string;
  phase: string;
  targets: string[];
  controls: string[];
  hypothesisId: string;
}) {
  if (!isWeb()) return;
  try {
    let allCssText = '';
    for (let i = 0; i < document.styleSheets.length; i++) {
      try {
        const rules = document.styleSheets[i].cssRules;
        for (let j = 0; j < rules.length; j++) allCssText += rules[j].cssText;
      } catch {
        /* cross-origin sheet */
      }
    }
    const probeOne = (needle: string, kind: 'target' | 'control') => {
      const hosts = findTextHosts(needle);
      return {
        needle: needle.slice(0, 40),
        kind,
        found: hosts.length,
        els: hosts.map((el) => describeElement(el, allCssText)),
      };
    };
    dbgLog(
      'debugInstrumentation:probe',
      `DOM probe ${spec.screen} (${spec.phase})`,
      {
        screen: spec.screen,
        phase: spec.phase,
        url:
          typeof window !== 'undefined'
            ? window.location.pathname + window.location.search
            : '',
        colorScheme: Appearance.getColorScheme(),
        fontsStatus:
          typeof document.fonts !== 'undefined' ? document.fonts.status : 'n/a',
        visibilityState: document.visibilityState,
        styleSheetCount: document.styleSheets.length,
        cssRulesTotal: allCssText.length,
        runningAnimations:
          typeof document.getAnimations === 'function'
            ? document.getAnimations().length
            : -1,
        dpr: window.devicePixelRatio,
        results: [
          ...spec.targets.map((t) => probeOne(t, 'target')),
          ...spec.controls.map((c) => probeOne(c, 'control')),
        ],
      },
      spec.hypothesisId
    );
  } catch (err) {
    dbgLog('debugInstrumentation:probe', 'probe threw', { error: String(err) }, 'X');
  }
}

// Run the probe right after first paint (double rAF) and twice later, so we
// can tell a permanent paint failure from a delayed recovery. Diagnostic
// sampling only.
export function scheduleDomProbes(run: (phase: string) => void) {
  if (!isWeb()) return;
  try {
    requestAnimationFrame(() => requestAnimationFrame(() => run('raf2')));
    setTimeout(() => run('t600'), 600);
    setTimeout(() => run('t2500'), 2500);
  } catch {
    /* ignore */
  }
}

export function probeOnceLater(ms: number, run: (phase: string) => void) {
  if (!isWeb()) return;
  try {
    setTimeout(() => run(`t+${ms}`), ms);
  } catch {
    /* ignore */
  }
}
// #endregion
