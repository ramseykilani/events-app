import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import OnboardingScreen, {
  pageIndexAfterSwipe,
  SWIPE_THRESHOLD,
} from '../../../app/(app)/onboarding';

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

  it('advances and retreats pages on horizontal swipe gestures', () => {
    const screen = render(<OnboardingScreen />);
    const page = screen.getByTestId('onboarding-page');

    fireEvent(page, 'responderGrant', {
      nativeEvent: { pageX: 200 },
    });
    fireEvent(page, 'responderRelease', {
      nativeEvent: { pageX: 200 - SWIPE_THRESHOLD - 1 },
    });
    expect(screen.getByText('Add from a link or from scratch')).toBeTruthy();

    fireEvent(page, 'responderGrant', {
      nativeEvent: { pageX: 100 },
    });
    fireEvent(page, 'responderRelease', {
      nativeEvent: { pageX: 100 + SWIPE_THRESHOLD + 1 },
    });
    expect(screen.getByText('One place for events')).toBeTruthy();
  });
});

describe('pageIndexAfterSwipe', () => {
  it('moves forward and backward past the threshold only', () => {
    expect(pageIndexAfterSwipe(0, -SWIPE_THRESHOLD, 3)).toBe(1);
    expect(pageIndexAfterSwipe(1, SWIPE_THRESHOLD, 3)).toBe(0);
    expect(pageIndexAfterSwipe(0, -(SWIPE_THRESHOLD - 1), 3)).toBe(0);
    expect(pageIndexAfterSwipe(2, -SWIPE_THRESHOLD, 3)).toBe(2);
    expect(pageIndexAfterSwipe(0, SWIPE_THRESHOLD, 3)).toBe(0);
  });
});
