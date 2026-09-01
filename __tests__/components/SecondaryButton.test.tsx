import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { SecondaryButton } from '../../components/SecondaryButton';
import { Colors } from '../../constants/Colors';

describe('components/SecondaryButton', () => {
  it('renders the label and fires onPress', () => {
    const onPress = jest.fn();
    const screen = render(<SecondaryButton label="Edit" onPress={onPress} />);

    fireEvent.press(screen.getByRole('button', { name: 'Edit' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('matches the primary tier geometry with a surfaceSecondary fill', () => {
    const screen = render(<SecondaryButton label="Edit" onPress={jest.fn()} />);

    const style = StyleSheet.flatten(screen.getByRole('button', { name: 'Edit' }).props.style);
    expect(style.backgroundColor).toBe(Colors.paper.surfaceSecondary);
    expect(style.borderRadius).toBe(12);
    expect(style.minHeight).toBe(48);

    const labelStyle = StyleSheet.flatten(screen.getByText('Edit').props.style);
    expect(labelStyle.color).toBe(Colors.paper.textPrimary);
    expect(labelStyle.fontSize).toBe(16);
  });

  it('blocks presses when disabled', () => {
    const onPress = jest.fn();
    const screen = render(<SecondaryButton label="Edit" onPress={onPress} disabled />);

    fireEvent.press(screen.getByRole('button', { name: 'Edit' }));
    expect(onPress).not.toHaveBeenCalled();
  });
});
