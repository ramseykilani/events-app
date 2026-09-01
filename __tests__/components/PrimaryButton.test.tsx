import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { PrimaryButton } from '../../components/PrimaryButton';
import { Colors } from '../../constants/Colors';

describe('components/PrimaryButton', () => {
  it('renders the label and fires onPress', () => {
    const onPress = jest.fn();
    const screen = render(<PrimaryButton label="Share" onPress={onPress} />);

    fireEvent.press(screen.getByRole('button', { name: 'Share' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('uses the tier geometry: primary fill, radius 12, minHeight 48, 16px/600 label', () => {
    const screen = render(<PrimaryButton label="Share" onPress={jest.fn()} />);

    const button = screen.getByRole('button', { name: 'Share' });
    const style = StyleSheet.flatten(button.props.style);
    expect(style.backgroundColor).toBe(Colors.paper.primaryButtonBg);
    expect(style.borderRadius).toBe(12);
    expect(style.minHeight).toBe(48);

    const label = screen.getByText('Share');
    const labelStyle = StyleSheet.flatten(label.props.style);
    expect(labelStyle.color).toBe(Colors.paper.primaryButtonText);
    expect(labelStyle.fontSize).toBe(16);
    expect(labelStyle.fontWeight).toBe('600');
  });

  it('blocks presses and reports disabled when disabled', () => {
    const onPress = jest.fn();
    const screen = render(<PrimaryButton label="Share" onPress={onPress} disabled />);

    const button = screen.getByRole('button', { name: 'Share' });
    expect(button.props.accessibilityState.disabled).toBe(true);
    fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('shows the working phase (spinner, busy state) while loading', () => {
    const onPress = jest.fn();
    const screen = render(<PrimaryButton label="Share" onPress={onPress} loading />);

    expect(screen.queryByText('Share')).toBeNull();
    const button = screen.getByRole('button');
    expect(button.props.accessibilityState.busy).toBe(true);
    expect(button.props.accessibilityState.disabled).toBe(true);
    fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });
});
