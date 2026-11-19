import '@testing-library/jest-native/extend-expect';

jest.mock(
  '@react-native-async-storage/async-storage',
  () =>
    require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('expo-router', () => {
  const React = require('react');
  const { View } = require('react-native');

  const router = {
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: jest.fn(() => true),
  };

  const useLocalSearchParams = jest.fn(() => ({}));
  const useSegments = jest.fn(() => ['(app)']);

  const useFocusEffect = (effect: () => void | (() => void)) => {
    React.useEffect(() => effect(), [effect]);
  };

  const Stack = ({ children }: { children: React.ReactNode }) =>
    React.createElement(View, null, children);

  Stack.Screen = ({ children }: { children?: React.ReactNode }) =>
    React.createElement(View, null, children ?? null);

  return {
    router,
    useRouter: () => router,
    useSegments,
    useLocalSearchParams,
    useFocusEffect,
    Stack,
  };
});

// Screens render outside a SafeAreaProvider in tests
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return {
    SafeAreaView: View,
    SafeAreaProvider: View,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

// expo-crypto's randomUUID is native-backed; tests just need unique strings.
jest.mock('expo-crypto', () => ({
  randomUUID: () =>
    `test-${Math.random().toString(16).slice(2)}-${Date.now().toString(16)}`,
}));

// Native-only modules the app touches at import time. Tests that care about a
// module's behavior override these locally.
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(() => Promise.resolve(null)),
  deleteNotificationChannelAsync: jest.fn(() => Promise.resolve()),
  getNotificationChannelsAsync: jest.fn(() => Promise.resolve([])),
  setNotificationCategoryAsync: jest.fn(() => Promise.resolve(null)),
  getPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'undetermined' })),
  requestPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
  getExpoPushTokenAsync: jest.fn(() => Promise.resolve({ data: 'ExponentPushToken[test]' })),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  addNotificationReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  getLastNotificationResponseAsync: jest.fn(() => Promise.resolve(null)),
  dismissNotificationAsync: jest.fn(() => Promise.resolve()),
  AndroidImportance: { HIGH: 4, DEFAULT: 3, LOW: 2, MIN: 1 },
  AndroidNotificationVisibility: { PRIVATE: 0, PUBLIC: 1 },
}));

jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(() => Promise.resolve(true)) }));
