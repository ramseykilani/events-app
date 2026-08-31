import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { ConfirmModal } from '../../components/ConfirmModal';

describe('components/ConfirmModal', () => {
  it('does not call onConfirm until the confirm button is pressed', () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    const screen = render(
      <ConfirmModal
        visible
        title="Remove Event"
        message="You can't undo this."
        confirmText="Remove"
        destructive
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );

    expect(screen.getByText('Remove Event')).toBeTruthy();
    expect(screen.getByText("You can't undo this.")).toBeTruthy();
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.press(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('runs onConfirm from the destructive button', () => {
    const onConfirm = jest.fn();
    const screen = render(
      <ConfirmModal
        visible
        title="Remove Event"
        message="You can't undo this."
        confirmText="Remove"
        destructive
        onConfirm={onConfirm}
        onCancel={jest.fn()}
      />
    );

    fireEvent.press(screen.getByText('Remove'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
