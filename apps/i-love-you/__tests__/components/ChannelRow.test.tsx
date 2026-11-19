import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { ChannelRow } from '../../components/ChannelRow';
import type { Channel } from '../../lib/types';

const base: Channel = {
  id: 'c1',
  name: 'Logistics',
  icon: 'checkbox-outline',
  position: 1,
  archived_at: null,
  settings: {},
  my_settings: { notify_level: 'notify' },
  last_message_at: '2026-11-18T10:00:00Z',
  last_message_sender: 'p',
  last_message_preview: 'Did you book the vet?',
  last_read_at: null,
  unread: true,
  updated_at: '2026-11-18T10:00:00Z',
};

describe('ChannelRow', () => {
  it('shows unread as a dot with no number (design language §9)', () => {
    const screen = render(<ChannelRow channel={base} selected={false} typing={false} onPress={jest.fn()} />);
    expect(screen.getByTestId('unread-dot-Logistics', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.queryByText(/^\d+$/)).toBeNull();
    expect(screen.getByLabelText('Logistics, unread')).toBeTruthy();
  });

  it('says quiet or muted in its accessible name, and shows typing in place of the preview', () => {
    const screen = render(
      <ChannelRow
        channel={{ ...base, unread: false, my_settings: { notify_level: 'quiet' } }}
        selected={false}
        typing
        onPress={jest.fn()}
      />
    );
    expect(screen.getByLabelText('Logistics, delivers quietly')).toBeTruthy();
    expect(screen.getByText('Typing…')).toBeTruthy();
    expect(screen.queryByTestId('unread-dot-Logistics', { includeHiddenElements: true })).toBeNull();
    const muted = render(
      <ChannelRow channel={{ ...base, unread: true, my_settings: { notify_level: 'none' } }} selected={false} typing={false} onPress={jest.fn()} />
    );
    // Muted channels still show the dot; they just never notify.
    expect(muted.getByTestId('unread-dot-Logistics', { includeHiddenElements: true })).toBeTruthy();
    expect(muted.getByLabelText('Logistics, unread, muted')).toBeTruthy();
  });

  it('opens on press', () => {
    const onPress = jest.fn();
    const screen = render(<ChannelRow channel={base} selected typing={false} onPress={onPress} />);
    fireEvent.press(screen.getByRole('button'));
    expect(onPress).toHaveBeenCalled();
  });
});
