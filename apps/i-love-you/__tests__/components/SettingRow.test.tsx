import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { SettingRow } from '../../components/SettingRows';
import { SETTINGS_BY_KEY } from '../../lib/channelSettings';

// Settings render from their registry definition: booleans as a whole-row
// switch, choices as chips. A new registry entry needs no new UI.
describe('SettingRow', () => {
  it('a boolean is one switch control that flips the value', () => {
    const onChange = jest.fn();
    const screen = render(
      <SettingRow def={SETTINGS_BY_KEY.read_receipts} value={false} busy={false} onChange={onChange} />
    );
    const sw = screen.getByRole('switch', { name: 'Read receipts' });
    expect(sw.props.accessibilityState).toMatchObject({ checked: false });
    fireEvent.press(sw);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('a choice offers each option and explains the selected one', () => {
    const onChange = jest.fn();
    const screen = render(
      <SettingRow def={SETTINGS_BY_KEY.notify_level} value="quiet" busy={false} onChange={onChange} />
    );
    expect(screen.getByText('Lands in your notifications without a sound or banner.')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Notifications: Off'));
    expect(onChange).toHaveBeenCalledWith('none');
    // Re-choosing the selected option is not a write.
    fireEvent.press(screen.getByLabelText('Notifications: Deliver quietly'));
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
