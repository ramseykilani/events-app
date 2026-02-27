import React from 'react';
import { Dimensions, FlatList } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { fireEvent, render } from '@testing-library/react-native';
import OnboardingScreen from '../../../app/(app)/onboarding';

describe('app/(app)/onboarding', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('skips onboarding and stores completion flag', async () => {
    const screen = render(<OnboardingScreen />);

    fireEvent.press(screen.getByText('Skip'));

    expect(AsyncStorage.setItem).toHaveBeenCalledWith('onboarding_complete', 'true');
    expect(router.replace).toHaveBeenCalledWith('/(app)');
  });

  it('shows Get Started on last page and completes onboarding', () => {
    const screen = render(<OnboardingScreen />);
    const list = screen.UNSAFE_getByType(FlatList);
    const width = Dimensions.get('window').width;

    fireEvent(list, 'onMomentumScrollEnd', {
      nativeEvent: { contentOffset: { x: width * 2 } },
    });

    fireEvent.press(screen.getByText('Get Started'));
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('onboarding_complete', 'true');
    expect(router.replace).toHaveBeenCalledWith('/(app)');
  });
});
