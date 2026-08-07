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
// Iteration 2 additions:
//   - Artificial data-arrival delay knobs (dbgShareDelayMs / dbgEventDelayMs),
//     seedable via URL query param (persisted to sessionStorage) or console.
//   - Navigation event logging (pushState/replaceState/popstate) so data
//     landing can be timed against the screen transition.
//   - Dense probe phases incl. mount-time probes (pre-data) to capture the
//     transition window itself.
//   - Scene-stack dump per probe (aria-hidden/display/opacity/transform/inline
//     style of every stacked screen) + rAF heartbeat (main-thread/raster
//     stall detection) + mount ids.
// Everything is a no-op off-web so Jest (Platform.OS='ios') is unaffected.

import { Appearance, Platform } from 'react-native';

const SINK_URL = 'http://localhost:9100/log';

function isWeb(): boolean {
  return Platform.OS === 'web' && typeof document !== 'undefined';
}

function tNow(): number {
  try {
    return Math.round(globalThis.performance?.now() ?? Date.now());
  } catch {
    return Date.now();
  }
}

// ---------------------------------------------------------------------------
// Delay knobs. Set once via URL query param on any full page load, e.g.
//   http://localhost:8081/?dbgShareDelayMs=400&dbgEventDelayMs=800
// (persisted into sessionStorage so client-side navigations keep it), or at
// any time from devtools: sessionStorage.setItem('dbgShareDelayMs','400').
// Knobs are re-read on every data load, so console changes take effect on the
// next navigation without a reload.
// ---------------------------------------------------------------------------
function initKnobsFromUrl() {
  if (!isWeb()) return;
  try {
    const sp = new URLSearchParams(window.location.search);
    sp.forEach((value, key) => {
      if (key.startsWith('dbg')) {
        sessionStorage.setItem(key, value);
      }
    });
  } catch {
    /* ignore */
  }
}

export function dbgKnob(name: string): number {
  if (!isWeb()) return 0;
  try {
    const v = sessionStorage.getItem(name) ?? localStorage.getItem(name);
    const n = v ? parseInt(v, 10) : 0;
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

export function dbgSleep(ms: number): Promise<void> {
  return ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve();
}

// ---------------------------------------------------------------------------
// Mount ids: correlate all logs belonging to one screen mount.
// ---------------------------------------------------------------------------
let mountCounter = 0;
export function nextMountId(): number {
  mountCounter += 1;
  return mountCounter;
}

// ---------------------------------------------------------------------------
// rAF heartbeat: while active (started per screen mount for ~3s), records
// frame timestamps. If text is computed-visible but frames stalled, that is
// evidence for a raster/main-thread stall (hypothesis A).
// ---------------------------------------------------------------------------
let heartbeatFrames: number[] = [];
let heartbeatUntil = 0;
let heartbeatRunning = false;

export function startHeartbeat(ms: number) {
  if (!isWeb()) return;
  try {
    heartbeatUntil = Math.max(heartbeatUntil, performance.now() + ms);
    if (heartbeatRunning) return;
    heartbeatRunning = true;
    const tick = (t: number) => {
      heartbeatFrames.push(t);
      if (heartbeatFrames.length > 240) heartbeatFrames.shift();
      if (performance.now() < heartbeatUntil) {
        requestAnimationFrame(tick);
      } else {
        heartbeatRunning = false;
      }
    };
    requestAnimationFrame(tick);
  } catch {
    /* ignore */
  }
}

function heartbeatSummary() {
  const frames = heartbeatFrames.slice(-180);
  let maxGap = 0;
  for (let i = 1; i < frames.length; i++) {
    maxGap = Math.max(maxGap, frames[i] - frames[i - 1]);
  }
  const last = frames.length > 0 ? frames[frames.length - 1] : null;
  return {
    count: frames.length,
    maxGapMs: Math.round(maxGap),
    lastFrameAgoMs: last != null ? Math.round(performance.now() - last) : -1,
  };
}

// ---------------------------------------------------------------------------
// Navigation logging: exact URL-change timestamps = transition start times.
// ---------------------------------------------------------------------------
let navPatched = false;
function initNavLogging() {
  if (!isWeb() || navPatched) return;
  navPatched = true;
  try {
    const wrap =
      (fn: History['pushState'], tag: string): History['pushState'] =>
      function (this: History, ...args: Parameters<History['pushState']>) {
        const before = dbgUrl();
        const ret = fn.apply(this, args);
        const after = dbgUrl();
        if (after !== before) {
          dbgLog(
            'debugInstrumentation:nav',
            `url ${tag}`,
            { from: before, to: after, tPerf: tNow() },
            'E'
          );
        }
        return ret;
      };
    history.pushState = wrap(history.pushState, 'pushState');
    history.replaceState = wrap(history.replaceState, 'replaceState');
    window.addEventListener('popstate', () => {
      dbgLog(
        'debugInstrumentation:nav',
        'url popstate',
        { to: dbgUrl(), tPerf: tNow() },
        'E'
      );
    });
  } catch {
    /* ignore */
  }
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
  initNavLogging();
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
      position: cs.position !== 'static' ? cs.position : undefined,
      zIndex: cs.zIndex !== 'auto' ? cs.zIndex : undefined,
      opacity: cs.opacity !== '1' ? cs.opacity : undefined,
      visibility: cs.visibility !== 'visible' ? cs.visibility : undefined,
      transform: cs.transform !== 'none' ? cs.transform.slice(0, 60) : undefined,
      transition:
        cs.transitionProperty && cs.transitionProperty !== 'none'
          ? `${cs.transitionProperty} ${cs.transitionDuration}`.slice(0, 60)
          : undefined,
      anims: (node.getAnimations ? node.getAnimations().length : 0) || undefined,
      // Animated-driven transitions on web mutate inline styles; capture them.
      inline: (node.getAttribute('style') || '').slice(0, 140) || undefined,
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

// Dump the stacked screen containers (expo-router keeps previous screens
// mounted, toggling aria-hidden/display and animating inline styles). At each
// probe phase this shows whether the active scene is mid-transition.
function dumpScenes(): unknown[] {
  const out: unknown[] = [];
  try {
    const root = document.getElementById('root') ?? document.body;
    let node: Element | null = root;
    let hops = 0;
    while (node && hops < 9 && out.length < 3) {
      const kids: Element[] = Array.from(node.children);
      if (kids.length > 1) {
        out.push({
          parentClass: (node.className || '').toString().slice(0, 60),
          scenes: kids.slice(0, 8).map((k: Element) => {
            const cs = window.getComputedStyle(k);
            return {
              class: (k.className || '').toString().slice(0, 70),
              ariaHidden: k.getAttribute('aria-hidden') || undefined,
              display: cs.display,
              opacity: cs.opacity,
              transform:
                cs.transform !== 'none' ? cs.transform.slice(0, 50) : undefined,
              transition:
                cs.transitionProperty && cs.transitionProperty !== 'none'
                  ? `${cs.transitionProperty} ${cs.transitionDuration}`.slice(
                      0,
                      50
                    )
                  : undefined,
              textChars: (k.textContent || '').length,
              inline: (k.getAttribute('style') || '').slice(0, 120) || undefined,
            };
          }),
        });
        node = kids[kids.length - 1];
      } else {
        node = kids[0] ?? null;
      }
      hops += 1;
    }
  } catch {
    /* ignore */
  }
  return out;
}

export function probeScreenTexts(spec: {
  screen: string;
  phase: string;
  targets: string[];
  controls: string[];
  hypothesisId: string;
  mount?: number;
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
        mount: spec.mount,
        url:
          typeof window !== 'undefined'
            ? window.location.pathname + window.location.search
            : '',
        tPerf: tNow(),
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
        heartbeat: heartbeatSummary(),
        scenes: dumpScenes(),
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

// Run probes right after paint and at dense offsets afterwards, so transient
// transition-window states are captured, not just settled end states.
export function scheduleDomProbes(run: (phase: string) => void) {
  if (!isWeb()) return;
  try {
    requestAnimationFrame(() => run('raf1'));
    requestAnimationFrame(() => requestAnimationFrame(() => run('raf2')));
    [150, 350, 600, 1200, 2500].forEach((ms) =>
      setTimeout(() => run(`t${ms}`), ms)
    );
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

initKnobsFromUrl();
// #endregion
