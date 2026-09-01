#!/usr/bin/env node
// Mechanical enforcement of the project conventions that users experience as
// "inconsistencies" when they slip. Runs in the fast CI checks
// (`npm run test:conventions`). Keep it fast, deterministic, and zero-false-
// positive — an intentional exception carries an inline `conventions-ok`
// comment explaining why.
//
// Rules:
//   1. Every <TouchableOpacity> / <Pressable> carries accessibilityRole
//      (project rule: interactive elements are accessible — and e2e-locatable).
//   2. No Alert.alert outside lib/dialogs.ts / lib/showError.ts
//      (react-native-web makes Alert a no-op; dialogs must render on web).
//   3. No hard-coded hex colors in app/, components/, hooks/, lib/
//      (every color is a role token from constants/Colors.ts via useTheme).
//   4. No emoji (Unicode Extended_Pictographic) in UI source — emoji render in
//      the OS emoji font and ignore role-token tints; use a vector icon
//      (@expo/vector-icons) colored by a theme token instead. Text-font
//      dingbats like ✓ (U+2713) are not pictographic and remain fine.
//   5. No importing withTimeout/timeoutSignal outside lib/timeoutSignal.ts —
//      they take a raw budget, and B-1 was a write wrapped in the 2s read
//      default. Use withFetchTimeout / withWriteTimeout / withRetries, which
//      fix the budget per kind. (Prevents the wrong-budget class; it does NOT
//      prove every future bare Supabase call carries a timeout.)
//   6. No showError(...) outside app/(auth)/**, app/_context/SessionContext.tsx,
//      lib/** — showError dumps stack traces, which is right for unexpected
//      auth/boot failures and wrong for user-triggered action failures (those
//      get a short showAlert). Intentional exceptions need conventions-ok.
//   7. No importing Switch from react-native outside components/ThemedSwitch.tsx —
//      react-native-web's on-state thumb ignores thumbColor and falls back to a
//      Material teal default outside the role-token palettes; ThemedSwitch owns
//      the token wiring.
//   8. Every <Modal> carries onRequestClose — RN's Android Modal consumes
//      hardware Back and only forwards it to onRequestClose, so a missing
//      handler leaves the sheet swallowing Back (KI-009/KI-012); on iOS a
//      pageSheet swipe-down attempt rubber-bands instead of closing. Wire it
//      to the sheet's own Close/Cancel.
//   9. A file that spends insets.top must also spend insets.bottom — Android
//      15+ enforces edge-to-edge (android.edgeToEdgeEnabled is inert), so the
//      window bottom sits under the 3-button nav bar and only explicit bottom
//      padding lifts content clear (KI-005). Short top-pinned forms that
//      never reach the window bottom opt out with conventions-ok.
//  10. fontSize stays inside the design-language §4 scale bands (12–18 and
//      28–32) — the 20px/24px drift class (audit UX-06) came from §4 having
//      no button-label rung; the button tiers own button text now.
//  11. borderRadius stays inside the §5 spectrum (4–12) unless the same
//      style object proves a pill: width/height/minWidth/minHeight of
//      2 × radius (chips, FAB, help button, theme swatch).
//  12. No bare "Back" text buttons outside components/AppHeader.tsx — the
//      one header grammar is chevron + destination label (audit UX-02/03).
//      Programmatic router.back() after an action is unaffected.
import ts from 'typescript';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const SCAN_DIRS = ['app', 'components', 'hooks', 'lib'];
const SOURCE_RE = /\.(ts|tsx)$/;
const HEX_RE = /#[0-9a-fA-F]{3}\b|#[0-9a-fA-F]{4}\b|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{8}\b/g;
const EMOJI_RE = /\p{Extended_Pictographic}/gu;
// lib/dialogs.ts and lib/showError.ts are the dialog implementations.
const ALERT_ALLOWED_FILES = new Set(['lib/dialogs.ts', 'lib/showError.ts']);
const TIMEOUT_MODULE_RE = /(^|\/)timeoutSignal$/;
const BANNED_TIMEOUT_NAMES = new Set(['withTimeout', 'timeoutSignal']);
const SHOWERROR_MODULE_RE = /(^|\/)showError$/;
const THEMED_SWITCH_FILE = 'components/ThemedSwitch.tsx';
const SHOWERROR_ALLOWED = (relPath) =>
  relPath.startsWith('app/(auth)/') ||
  relPath === 'app/_context/SessionContext.tsx' ||
  relPath.startsWith('lib/');
const APP_HEADER_FILE = 'components/AppHeader.tsx';

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* walk(path);
    else if (SOURCE_RE.test(entry)) yield path;
  }
}

function lineOf(source, pos) {
  return source.getLineAndCharacterOfPosition(pos).line + 1;
}

function hasAllowComment(lines, line) {
  // lines[] is 0-indexed; allow the marker on the line itself or up to two
  // lines above it.
  return [line, line - 1, line - 2].some(
    (ln) => ln >= 1 && ln <= lines.length && lines[ln - 1].includes('conventions-ok')
  );
}

const violations = [];

function checkAccessibilityRoles(path, source) {
  const visit = (node) => {
    if (
      (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) &&
      ts.isIdentifier(node.tagName) &&
      (node.tagName.text === 'TouchableOpacity' || node.tagName.text === 'Pressable')
    ) {
      const attrs = node.attributes.properties;
      const hasRole = attrs.some(
        (a) => ts.isJsxAttribute(a) && a.name.text === 'accessibilityRole'
      );
      const hasSpread = attrs.some((a) => ts.isJsxSpreadAttribute(a));
      if (!hasRole && !hasSpread) {
        violations.push(
          `${rel(path)}:${lineOf(source, node.getStart())} — <${node.tagName.text}> without accessibilityRole`
        );
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}

function checkTimeoutImports(path, source) {
  const relPath = rel(path);
  if (relPath === 'lib/timeoutSignal.ts') return;
  const visit = (node) => {
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      TIMEOUT_MODULE_RE.test(node.moduleSpecifier.text)
    ) {
      const named = node.importClause?.namedBindings;
      if (named && ts.isNamespaceImport(named)) {
        violations.push(
          `${relPath}:${lineOf(source, node.getStart())} — namespace import of the timeout module reaches the raw withTimeout/timeoutSignal; import withFetchTimeout/withWriteTimeout/withRetries instead`
        );
      } else if (named && ts.isNamedImports(named)) {
        for (const el of named.elements) {
          // propertyName covers `withTimeout as wt` aliases.
          const imported = (el.propertyName ?? el.name).text;
          if (BANNED_TIMEOUT_NAMES.has(imported)) {
            violations.push(
              `${relPath}:${lineOf(source, el.getStart())} — withTimeout/timeoutSignal take a raw budget (B-1 was a write on the 2s read budget); use withFetchTimeout/withWriteTimeout`
            );
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}

function checkShowErrorCalls(path, source, text) {
  const relPath = rel(path);
  if (SHOWERROR_ALLOWED(relPath)) return;
  const lines = text.split('\n');

  // Track the local bindings showError is imported as, so aliases and
  // namespace imports can't bypass the rule.
  const localNames = new Set();
  const namespaces = new Set();
  const collect = (node) => {
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      SHOWERROR_MODULE_RE.test(node.moduleSpecifier.text)
    ) {
      const named = node.importClause?.namedBindings;
      if (named && ts.isNamedImports(named)) {
        for (const el of named.elements) {
          if ((el.propertyName ?? el.name).text === 'showError') {
            localNames.add(el.name.text);
          }
        }
      } else if (named && ts.isNamespaceImport(named)) {
        namespaces.add(named.name.text);
      }
    }
    ts.forEachChild(node, collect);
  };
  collect(source);

  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const isLocalBinding = ts.isIdentifier(callee) && localNames.has(callee.text);
      // `ns.showError(...)` via a namespace import, or any member call — no
      // other type in this tree has a showError method, so this is safe.
      const isPropertyAccess =
        ts.isPropertyAccessExpression(callee) && callee.name.text === 'showError';
      if ((isLocalBinding || isPropertyAccess) && !hasAllowComment(lines, lineOf(source, node.getStart()))) {
        violations.push(
          `${relPath}:${lineOf(source, node.getStart())} — showError dumps a stack trace; user-triggered action failures use a short showAlert (allowlisted: app/(auth), SessionContext, lib)`
        );
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}

function checkModalRequestClose(path, source, text) {
  const relPath = rel(path);
  const lines = text.split('\n');
  const visit = (node) => {
    if (
      (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) &&
      ts.isIdentifier(node.tagName) &&
      node.tagName.text === 'Modal'
    ) {
      const attrs = node.attributes.properties;
      const hasHandler = attrs.some(
        (a) => ts.isJsxAttribute(a) && a.name.text === 'onRequestClose'
      );
      const hasSpread = attrs.some((a) => ts.isJsxSpreadAttribute(a));
      if (
        !hasHandler &&
        !hasSpread &&
        !hasAllowComment(lines, lineOf(source, node.getStart()))
      ) {
        violations.push(
          `${relPath}:${lineOf(source, node.getStart())} — <Modal> without onRequestClose swallows Android system Back and iOS pageSheet swipe-down attempts (KI-009/KI-012); wire it to the sheet's Close/Cancel`
        );
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}

function checkBottomInset(path, text) {
  const relPath = rel(path);
  const lines = text.split('\n');
  // Same comment-line tolerance as the hex/emoji rules: a trimmed line
  // starting with // or * is prose, not usage.
  const isCode = (l) => {
    const t = l.trim();
    return !t.startsWith('//') && !t.startsWith('*');
  };
  const topIdx = lines.findIndex((l) => isCode(l) && /insets\.top/.test(l));
  if (topIdx === -1) return;
  const hasBottom = lines.some((l) => isCode(l) && /insets\.bottom/.test(l));
  if (hasBottom) return;
  const line = topIdx + 1; // 1-indexed
  if (hasAllowComment(lines, line)) return;
  violations.push(
    `${relPath}:${line} — pads insets.top but never insets.bottom; Android 15+ enforces edge-to-edge, so the 3-button nav bar covers the unpadded window bottom (KI-005). Pad the scroll content or container by insets.bottom, or mark conventions-ok with why nothing reaches the bottom`
  );
}

function checkRawSwitchImport(path, source) {
  const relPath = rel(path);
  if (relPath === THEMED_SWITCH_FILE) return;
  const visit = (node) => {
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      node.moduleSpecifier.text === 'react-native'
    ) {
      const named = node.importClause?.namedBindings;
      if (named && ts.isNamedImports(named)) {
        for (const el of named.elements) {
          if ((el.propertyName ?? el.name).text === 'Switch') {
            violations.push(
              `${relPath}:${lineOf(source, el.getStart())} — raw Switch leaks react-native-web's off-palette teal on-thumb; use ThemedSwitch from components/ThemedSwitch.tsx`
            );
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}

function checkVisualTokens(path, source, text) {
  const relPath = rel(path);
  const lines = text.split('\n');
  const visit = (node) => {
    if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name)) {
      const prop = node.name.text;
      if (
        (prop === 'fontSize' || prop === 'borderRadius') &&
        ts.isNumericLiteral(node.initializer)
      ) {
        const value = Number(node.initializer.text);
        const line = lineOf(source, node.getStart());
        if (prop === 'fontSize') {
          const inScale = (value >= 12 && value <= 18) || (value >= 28 && value <= 32);
          if (!inScale && !hasAllowComment(lines, line)) {
            violations.push(
              `${relPath}:${line} — fontSize ${value} is off the design-language §4 scale (12–18, 28–32); the button tiers own button text — use a component or a scale rung`
            );
          }
        } else if (value < 4 || value > 12) {
          // Pill heuristic: a fully-rounded shape proves itself in the same
          // style object with a dimension of 2 × radius (chips, FAB, swatch).
          const obj = node.parent;
          const pill =
            ts.isObjectLiteralExpression(obj) &&
            obj.properties.some(
              (p) =>
                ts.isPropertyAssignment(p) &&
                ts.isIdentifier(p.name) &&
                ['width', 'height', 'minWidth', 'minHeight'].includes(p.name.text) &&
                ts.isNumericLiteral(p.initializer) &&
                Number(p.initializer.text) === 2 * value
            );
          if (!pill && !hasAllowComment(lines, line)) {
            violations.push(
              `${relPath}:${line} — borderRadius ${value} is outside the §5 spectrum (4–12); chips/pills prove the shape with width/height/minWidth/minHeight of 2 × radius in the same style object`
            );
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}

function checkBareBackButtons(path, source, text) {
  const relPath = rel(path);
  if (relPath === APP_HEADER_FILE) return;
  const lines = text.split('\n');
  const visit = (node) => {
    if (
      ts.isJsxElement(node) &&
      ts.isIdentifier(node.openingElement.tagName) &&
      (node.openingElement.tagName.text === 'TouchableOpacity' ||
        node.openingElement.tagName.text === 'Pressable')
    ) {
      let hasBackText = false;
      const findBack = (n) => {
        if (ts.isJsxText(n) && n.getText(source).trim() === 'Back') hasBackText = true;
        ts.forEachChild(n, findBack);
      };
      ts.forEachChild(node, findBack);
      const line = lineOf(source, node.getStart());
      if (hasBackText && !hasAllowComment(lines, line)) {
        violations.push(
          `${relPath}:${line} — bare "Back" text button; the one header grammar is AppHeader's chevron + destination label (audit UX-02/03)`
        );
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}

function checkRegexRules(path, text, source) {
  const lines = text.split('\n');
  const relPath = rel(path);

  if (!ALERT_ALLOWED_FILES.has(relPath)) {
    for (const m of text.matchAll(/Alert\.alert\(/g)) {
      const line = lineOf(source, m.index);
      if (!hasAllowComment(lines, line)) {
        violations.push(
          `${relPath}:${line} — Alert.alert is a no-op on web; use showAlert/showConfirm from lib/dialogs.ts`
        );
      }
    }
  }

  for (const m of text.matchAll(HEX_RE)) {
    const line = lineOf(source, m.index);
    const textLine = lines[line - 1].trim();
    if (textLine.startsWith('//') || textLine.startsWith('*')) continue;
    if (!hasAllowComment(lines, line)) {
      violations.push(
        `${relPath}:${line} — hard-coded color ${m[0]}; use a role token from constants/Colors.ts via useTheme`
      );
    }
  }

  for (const m of text.matchAll(EMOJI_RE)) {
    const line = lineOf(source, m.index);
    const textLine = lines[line - 1].trim();
    if (textLine.startsWith('//') || textLine.startsWith('*')) continue;
    if (!hasAllowComment(lines, line)) {
      violations.push(
        `${relPath}:${line} — emoji ${m[0]} renders in the OS emoji font and can't be tinted; use a vector icon with a role-token color`
      );
    }
  }
}

const rel = (path) => relative(ROOT, path);

for (const dir of SCAN_DIRS) {
  for (const path of walk(join(ROOT, dir))) {
    const text = readFileSync(path, 'utf8');
    const source = ts.createSourceFile(
      path,
      text,
      ts.ScriptTarget.Latest,
      true,
      path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    );
    checkAccessibilityRoles(path, source);
    checkRegexRules(path, text, source);
    checkTimeoutImports(path, source);
    checkShowErrorCalls(path, source, text);
    checkRawSwitchImport(path, source);
    checkModalRequestClose(path, source, text);
    checkBottomInset(path, text);
    checkVisualTokens(path, source, text);
    checkBareBackButtons(path, source, text);
  }
}

if (violations.length > 0) {
  console.error(`Convention violations (${violations.length}):\n`);
  for (const v of violations) console.error(`  ${v}`);
  console.error(
    '\nIntentional exceptions need an inline `conventions-ok` comment with the reason.'
  );
  process.exit(1);
}
console.log('Convention checks passed.');
