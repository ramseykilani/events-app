import React from 'react';
import { ScrollView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import OnboardingScreen, { pageIndexFromOffset } from '../../../app/(app)/onboarding';

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
    const pager = screen.UNSAFE_getByType(ScrollView);

    fireEvent(pager, 'layout', {
      nativeEvent: { layout: { width: 390, height: 700, x: 0, y: 0 } },
    });

    expect(screen.getByText('One place for events')).toBeTruthy();
    expect(screen.getByText('Next')).toBeTruthy();

    fireEvent.press(screen.getByText('Next'));
    expect(screen.getByLabelText('Page 2 of 3').props.accessibilityState).toEqual({
      selected: true,
    });
    expect(screen.getByText('Next')).toBeTruthy();
    expect(screen.getByText('Skip')).toBeTruthy();

    fireEvent.press(screen.getByText('Next'));
    expect(screen.getByLabelText('Page 3 of 3').props.accessibilityState).toEqual({
      selected: true,
    });
    expect(screen.getByText('Get Started')).toBeTruthy();
    expect(screen.queryByText('Skip')).toBeNull();

    fireEvent.press(screen.getByText('Get Started'));
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('onboarding_complete', 'true');
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/(app)'));
  });

  it('syncs page state when the pager finishes a swipe', () => {
    const screen = render(<OnboardingScreen />);
    const pager = screen.UNSAFE_getByType(ScrollView);

    fireEvent(pager, 'layout', {
      nativeEvent: { layout: { width: 390, height: 700, x: 0, y: 0 } },
    });
    fireEvent(pager, 'momentumScrollEnd', {
      nativeEvent: { contentOffset: { x: 780, y: 0 } },
    });

    expect(screen.getByLabelText('Page 3 of 3').props.accessibilityState).toEqual({
      selected: true,
    });
    expect(screen.getByText('Get Started')).toBeTruthy();
  });
});

describe('pageIndexFromOffset', () => {
  it('rounds to the nearest in-range page', () => {
    expect(pageIndexFromOffset(0, 390, 3)).toBe(0);
    expect(pageIndexFromOffset(200, 390, 3)).toBe(1);
    expect(pageIndexFromOffset(780, 390, 3)).toBe(2);
    expect(pageIndexFromOffset(-40, 390, 3)).toBe(0);
    expect(pageIndexFromOffset(0, 0, 3)).toBe(0);
  });
});
