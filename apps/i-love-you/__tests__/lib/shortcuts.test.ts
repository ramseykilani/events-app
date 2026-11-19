import { shortcutFor, stepChannel } from '../../lib/shortcuts';

const key = (k: string, mods: Partial<{ metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean }> = {}) => ({
  key: k,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...mods,
});

describe('desktop shortcuts', () => {
  it('mod+N opens channel N, with ⌘ on macOS and Ctrl elsewhere', () => {
    expect(shortcutFor(key('2', { metaKey: true }), true)).toEqual({ kind: 'channel-index', index: 1 });
    expect(shortcutFor(key('2', { ctrlKey: true }), false)).toEqual({ kind: 'channel-index', index: 1 });
    expect(shortcutFor(key('2', { ctrlKey: true }), true)).toBeNull();
  });

  it('Alt+arrows step channels; mod+Shift+M toggles the mic; mod+, opens settings', () => {
    expect(shortcutFor(key('ArrowDown', { altKey: true }), false)).toEqual({ kind: 'channel-step', delta: 1 });
    expect(shortcutFor(key('M', { ctrlKey: true, shiftKey: true }), false)).toEqual({ kind: 'toggle-mic' });
    expect(shortcutFor(key(',', { metaKey: true }), true)).toEqual({ kind: 'settings' });
    expect(shortcutFor(key('a'), false)).toBeNull();
  });

  it('stepChannel wraps at both ends and starts from the edge with nothing open', () => {
    expect(stepChannel(['a', 'b', 'c'], 'c', 1)).toBe('a');
    expect(stepChannel(['a', 'b', 'c'], 'a', -1)).toBe('c');
    expect(stepChannel(['a', 'b', 'c'], null, 1)).toBe('a');
    expect(stepChannel([], null, 1)).toBeNull();
  });
});
