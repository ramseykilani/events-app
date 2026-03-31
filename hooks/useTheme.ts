import { useColorScheme } from 'react-native';
import { Colors } from '../constants/Colors';

export function useTheme() {
  const scheme = useColorScheme();
  return Colors[scheme === 'dark' ? 'dark' : 'light'];
}
