import { useWindowDimensions } from 'react-native';

// Desktop is the web build done properly, not a stretched phone
// (FEATURES.md -> Desktop): at 900px and up the app runs two panes — the
// channel list beside the conversation. A tablet in landscape gets the same.
export const WIDE_BREAKPOINT = 900;
export const LIST_PANE_WIDTH = 320;
// One content measure (Events UX checklist): conversations and forms never
// run wider than this, however wide the window.
export const CONTENT_MAX_WIDTH = 760;

export function useLayout() {
  const { width, height } = useWindowDimensions();
  return { wide: width >= WIDE_BREAKPOINT, width, height };
}
