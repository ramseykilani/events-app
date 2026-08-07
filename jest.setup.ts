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
  const actual = jest.requireActual('react-native-safe-area-context');
  return {
    ...actual,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});
