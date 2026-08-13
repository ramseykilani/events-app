import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import AddEventScreen from '../../../app/(app)/add-event';

const mockInvoke = jest.fn();
const mockFrom = jest.fn();
const mockRpc = jest.fn();

jest.mock('../../../app/_context/SessionContext', () => ({
  useSession: () => ({
    session: {
      user: { id: 'u1' },
    },
  }),
}));

jest.mock('../../../lib/supabase', () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => mockInvoke(...args) },
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));

jest.mock('../../../lib/showError', () => ({
  showError: jest.fn(),
}));

jest.mock('@react-native-community/datetimepicker', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { __esModule: true, default: () => React.createElement(View) };
});

const ogResponse = {
  data: { title: 'OG Title', description: 'OG description', image_url: null },
  error: null,
};

describe('app/(app)/add-event', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('autofills empty fields from OG metadata', async () => {
    mockInvoke.mockResolvedValue(ogResponse);

    const screen = render(<AddEventScreen />);
    const urlInput = screen.getByPlaceholderText('https://...');
    fireEvent.changeText(urlInput, 'https://example.com/party');
    await act(async () => {
      urlInput.props.onBlur();
    });

    await waitFor(() => expect(mockInvoke).toHaveBeenCalled());
    await screen.findByDisplayValue('OG Title');
    expect(screen.getByPlaceholderText('Description').props.value).toBe(
      'OG description'
    );
  });

  it('does not overwrite a title typed while the OG fetch is in flight', async () => {
    let resolveOg!: (value: unknown) => void;
    mockInvoke.mockReturnValue(
      new Promise((resolve) => {
        resolveOg = resolve;
      })
    );

    const screen = render(<AddEventScreen />);
    const urlInput = screen.getByPlaceholderText('https://...');
    fireEvent.changeText(urlInput, 'https://example.com/party');
    await act(async () => {
      urlInput.props.onBlur();
    });

    await waitFor(() => expect(mockInvoke).toHaveBeenCalled());

    fireEvent.changeText(
      screen.getByPlaceholderText('Event title'),
      'My own title'
    );

    await act(async () => {
      resolveOg(ogResponse);
    });

    expect(screen.getByPlaceholderText('Event title').props.value).toBe(
      'My own title'
    );
    // Fields the user left empty still autofill.
    expect(screen.getByPlaceholderText('Description').props.value).toBe(
      'OG description'
    );
  });
});
