import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { IconButton } from '../../components/IconButton';
import { Colors } from '../../constants/Colors';

describe('components/IconButton', () => {
  it('renders children and fires onPress via the required accessible name', () => {
    const onPress = jest.fn();
    const screen = render(
      <IconButton onPress={onPress} accessibilityLabel="Add to Google Calendar">
        <Text>G</Text>
      </IconButton>
    );

    expect(screen.getByText('G')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Add to Google Calendar' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('is a 44×44 radius-10 surfaceSecondary tile', () => {
    const screen = render(
      <IconButton onPress={jest.fn()} accessibilityLabel="Add">
        <Text>+</Text>
      </IconButton>
    );

    const style = StyleSheet.flatten(screen.getByRole('button', { name: 'Add' }).props.style);
    expect(style.width).toBe(44);
    expect(style.height).toBe(44);
    expect(style.borderRadius).toBe(10);
    expect(style.backgroundColor).toBe(Colors.paper.surfaceSecondary);
  });
});
