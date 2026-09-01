import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { Chip } from '../../components/Chip';
import { Colors } from '../../constants/Colors';

describe('components/Chip', () => {
  it('renders the label and fires onPress', () => {
    const onPress = jest.fn();
    const screen = render(<Chip label="Family" onPress={onPress} />);

    fireEvent.press(screen.getByRole('button', { name: 'Family' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('is a fully rounded 44pt pill (surfaceSecondary, selectedBg when selected)', () => {
    const screen = render(
      <>
        <Chip label="Family" onPress={jest.fn()} />
        <Chip label="Friends" onPress={jest.fn()} selected />
      </>
    );

    const family = StyleSheet.flatten(
      screen.getByRole('button', { name: 'Family' }).props.style
    );
    expect(family.minHeight).toBe(44);
    expect(family.borderRadius).toBe(22);
    expect(family.backgroundColor).toBe(Colors.paper.surfaceSecondary);

    const friends = StyleSheet.flatten(
      screen.getByRole('button', { name: 'Friends' }).props.style
    );
    expect(friends.backgroundColor).toBe(Colors.paper.selectedBg);
    expect(
      screen.getByRole('button', { name: 'Friends' }).props.accessibilityState.selected
    ).toBe(true);
  });

  it('dims and blocks presses when disabled', () => {
    const onPress = jest.fn();
    const screen = render(<Chip label="Family" onPress={onPress} disabled />);

    const chip = screen.getByRole('button', { name: 'Family' });
    expect(chip.props.accessibilityState.disabled).toBe(true);
    fireEvent.press(chip);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('shows a spinner while loading', () => {
    const screen = render(<Chip label="Restore" onPress={jest.fn()} loading />);

    expect(screen.queryByText('Restore')).toBeNull();
    expect(screen.getByRole('button')).toBeTruthy();
  });
});
