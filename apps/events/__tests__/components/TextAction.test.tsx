import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { TextAction } from '../../components/TextAction';
import { Colors } from '../../constants/Colors';

describe('components/TextAction', () => {
  it('renders the label and fires onPress', () => {
    const onPress = jest.fn();
    const screen = render(<TextAction label="Archive" onPress={onPress} />);

    fireEvent.press(screen.getByRole('button', { name: 'Archive' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('carries a real 44pt target without hitSlop', () => {
    const screen = render(<TextAction label="Archive" onPress={jest.fn()} />);

    const action = screen.getByRole('button', { name: 'Archive' });
    expect(StyleSheet.flatten(action.props.style).minHeight).toBe(44);
    expect(action.props.hitSlop).toBeUndefined();
  });

  it('maps tones to their role tokens', () => {
    const screen = render(
      <>
        <TextAction label="Archive" onPress={jest.fn()} />
        <TextAction label="Retry" onPress={jest.fn()} tone="link" />
        <TextAction label="Remove Event" onPress={jest.fn()} tone="destructive" />
      </>
    );

    expect(StyleSheet.flatten(screen.getByText('Archive').props.style).color).toBe(
      Colors.paper.textSecondary
    );
    expect(StyleSheet.flatten(screen.getByText('Retry').props.style).color).toBe(
      Colors.paper.linkText
    );
    expect(StyleSheet.flatten(screen.getByText('Remove Event').props.style).color).toBe(
      Colors.paper.destructiveLink
    );
  });

  it('dims to textTertiary and blocks presses when disabled', () => {
    const onPress = jest.fn();
    const screen = render(<TextAction label="Archive" onPress={onPress} disabled />);

    const action = screen.getByRole('button', { name: 'Archive' });
    expect(action.props.accessibilityState.disabled).toBe(true);
    expect(StyleSheet.flatten(screen.getByText('Archive').props.style).color).toBe(
      Colors.paper.textTertiary
    );
    fireEvent.press(action);
    expect(onPress).not.toHaveBeenCalled();
  });
});
