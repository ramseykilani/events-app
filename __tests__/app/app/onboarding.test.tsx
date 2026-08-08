import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import OnboardingScreen from '../../../app/(app)/onboarding';

describe('app/(app)/onboarding', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('skips onboarding and stores completion flag', async () => {
    const screen = render(<OnboardingScreen />);

    fireEvent.press(screen.getByText('Skip'));

    expect(AsyncStorage.setItem).toHaveBeenCalledWith('onboarding_complete', 'true');
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/(app)'));
  });

  it('advances pages with Next and completes on Get Started', async () => {
    const screen = render(<OnboardingScreen />);

    expect(screen.getByText('One place for events')).toBeTruthy();
    expect(screen.getByText('Next')).toBeTruthy();

    fireEvent.press(screen.getByText('Next'));
    expect(screen.getByText('Add from a link or from scratch')).toBeTruthy();
    expect(screen.getByText('Next')).toBeTruthy();
    expect(screen.getByText('Skip')).toBeTruthy();

    fireEvent.press(screen.getByText('Next'));
    expect(screen.getByText("You choose who's in")).toBeTruthy();
    expect(screen.getByText('Get Started')).toBeTruthy();
    expect(screen.queryByText('Skip')).toBeNull();

    fireEvent.press(screen.getByText('Get Started'));
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('onboarding_complete', 'true');
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/(app)'));
  });
});
