import { Platform, Switch, type SwitchProps } from 'react-native';
import type { ComponentType } from 'react';
import { useTheme } from '../hooks/useTheme';

// react-native-web's Switch applies thumbColor only to the off state; the
// on-state thumb takes activeThumbColor — a web-only prop missing from RN's
// SwitchProps — and otherwise falls back to the library's Material teal
// default, a color outside the role-token palettes. This wrapper owns the
// token wiring so every switch is palette-correct on web and native; the
// conventions checker bans importing the raw Switch anywhere else.
type WebSwitchProps = SwitchProps & {
  activeThumbColor?: string;
  activeTrackColor?: string;
};

const WebAwareSwitch = Switch as ComponentType<WebSwitchProps>;

export function ThemedSwitch(props: SwitchProps) {
  const theme = useTheme();
  return (
    <WebAwareSwitch
      trackColor={{ false: theme.surfaceSecondary, true: theme.primaryButtonBg }}
      thumbColor={theme.surface}
      {...(Platform.OS === 'web'
        ? { activeThumbColor: theme.surface, activeTrackColor: theme.primaryButtonBg }
        : {})}
      {...props}
    />
  );
}
