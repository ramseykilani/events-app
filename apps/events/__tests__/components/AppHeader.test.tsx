import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { AppHeader } from '../../components/AppHeader';
import { Colors } from '../../constants/Colors';

describe('components/AppHeader', () => {
  it('renders the title and fires the left action', () => {
    const onLeft = jest.fn();
    const screen = render(
      <AppHeader title="Add people" left={{ kind: 'cancel' }} onLeft={onLeft} />
    );

    expect(screen.getByText('Add people')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(onLeft).toHaveBeenCalledTimes(1);
  });

  it('back kind renders chevron + destination label with a "Back to" accessible name', () => {
    const onLeft = jest.fn();
    const screen = render(
      <AppHeader left={{ kind: 'back', label: 'Events' }} onLeft={onLeft} />
    );

    const back = screen.getByRole('button', { name: 'Back to Events' });
    expect(screen.getByText('Events')).toBeTruthy();
    fireEvent.press(back);
    expect(onLeft).toHaveBeenCalledTimes(1);
  });

  it('close and done kinds use the fixed vocabulary', () => {
    const screen = render(<AppHeader left={{ kind: 'close' }} onLeft={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy();
    screen.unmount();

    const done = render(<AppHeader left={{ kind: 'done' }} onLeft={jest.fn()} />);
    expect(done.getByRole('button', { name: 'Done' })).toBeTruthy();
  });

  it('renders the right action with disabled state', () => {
    const onPress = jest.fn();
    const screen = render(
      <AppHeader
        title="Add person"
        left={{ kind: 'cancel' }}
        onLeft={jest.fn()}
        right={{ label: 'Save', onPress, disabled: true }}
      />
    );

    const save = screen.getByRole('button', { name: 'Save' });
    expect(save.props.accessibilityState.disabled).toBe(true);
    fireEvent.press(save);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('gives the bar and every action a real 44pt visible target', () => {
    const screen = render(
      <AppHeader
        title="Share with"
        left={{ kind: 'cancel' }}
        onLeft={jest.fn()}
        right={{ label: 'Share', onPress: jest.fn() }}
      />
    );

    const cancel = screen.getByRole('button', { name: 'Cancel' });
    expect(StyleSheet.flatten(cancel.props.style).minHeight).toBe(44);
    const share = screen.getByRole('button', { name: 'Share' });
    expect(StyleSheet.flatten(share.props.style).minHeight).toBe(44);
    // No hitSlop anywhere — the visible target IS the touch target.
    expect(cancel.props.hitSlop).toBeUndefined();
    expect(share.props.hitSlop).toBeUndefined();
    const bar = cancel.parent;
    expect(StyleSheet.flatten(bar.props.style).minHeight).toBe(44);
  });

  it('dims a disabled right action to textTertiary', () => {
    const screen = render(
      <AppHeader
        left={{ kind: 'cancel' }}
        onLeft={jest.fn()}
        right={{ label: 'Add', onPress: jest.fn(), disabled: true }}
      />
    );

    const label = screen.getByText('Add');
    expect(StyleSheet.flatten(label.props.style).color).toBe(Colors.paper.textTertiary);
  });
});
