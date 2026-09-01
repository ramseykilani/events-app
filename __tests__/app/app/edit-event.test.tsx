import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { abortable, abortablePromise } from '../../helpers/abortable';
import {
  clearEventPreviewCache,
  rememberEventPreview,
} from '../../../lib/eventPreviewCache';
import { FETCH_TIMEOUT_MS, WRITE_TIMEOUT_MS } from '../../../lib/timeoutSignal';
import EditEventScreen from '../../../app/(app)/edit-event';

const mockRpc = jest.fn();

const mockEventsSingle = jest.fn();
const mockEventsEq = jest.fn();
const mockEventsSelect = jest.fn();
const mockEventsDeleteEqOwner = jest.fn();
const mockEventsDeleteEqId = jest.fn();
const mockEventsDelete = jest.fn();

const mockFrom = jest.fn();

jest.mock('../../../app/_context/SessionContext', () => ({
  useSession: () => ({
    session: {
      user: { id: 'u1' },
    },
  }),
}));

jest.mock('../../../lib/supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

jest.mock('../../../lib/showError', () => ({
  showError: jest.fn(),
}));

jest.mock('../../../lib/dialogs', () => ({
  showAlert: jest.fn(),
  showConfirm: jest.fn(),
}));

jest.mock('@react-native-community/datetimepicker', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { __esModule: true, default: () => React.createElement(View) };
});

const eventRow = {
  id: 'e-1',
  owner_id: 'u1',
  url: null,
  title: 'Old Title',
  description: null,
  image_url: null,
  location: null,
  event_date: '2026-05-01',
  event_time: null,
  from_event_id: null,
  from_user_id: null,
  frozen: false,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

const seedPreview = () =>
  rememberEventPreview({
    event_id: 'e-1',
    title: 'Old Title',
    description: null,
    image_url: null,
    location: null,
    url: null,
    event_date: '2026-05-01',
    event_time: null,
  });

describe('app/(app)/edit-event', () => {
  const useLocalSearchParamsMock = useLocalSearchParams as jest.MockedFunction<
    typeof useLocalSearchParams
  >;

  beforeEach(() => {
    jest.clearAllMocks();
    clearEventPreviewCache();
    useLocalSearchParamsMock.mockReturnValue({ eventId: 'e-1' });

    mockEventsSingle.mockResolvedValue({ data: eventRow, error: null });
    mockEventsEq.mockReturnValue(abortable({ single: mockEventsSingle }));
    mockEventsSelect.mockReturnValue({ eq: mockEventsEq });

    mockEventsDeleteEqOwner.mockImplementation(() =>
      abortablePromise(Promise.resolve({ error: null }))
    );
    mockEventsDeleteEqId.mockReturnValue({ eq: mockEventsDeleteEqOwner });
    mockEventsDelete.mockReturnValue({ eq: mockEventsDeleteEqId });

    mockRpc.mockImplementation(() =>
      abortablePromise(Promise.resolve({ data: 'e-1', error: null }))
    );

    mockFrom.mockImplementation((table: string) => {
      if (table === 'events') {
        return { select: mockEventsSelect, delete: mockEventsDelete };
      }
      return {};
    });
  });

  it('saves edits with a single save_event call and navigates to the same row', async () => {
    const screen = render(<EditEventScreen />);
    const save = await screen.findByText('Save');

    const titleInput = await screen.findByPlaceholderText('Event title');
    fireEvent.changeText(titleInput, 'Old Title edited');
    fireEvent.press(save);

    await waitFor(() => {
      expect(mockRpc).toHaveBeenCalledWith('save_event', {
        p_id: 'e-1',
        p_url: null,
        p_title: 'Old Title edited',
        p_description: null,
        p_image_url: null,
        p_location: null,
        p_event_date: '2026-05-01',
        p_event_time: null,
      });
    });
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledWith('/(app)/event/e-1');
  });

  it('saves a location-only edit (location is a field-changing save)', async () => {
    const screen = render(<EditEventScreen />);
    const save = await screen.findByText('Save');

    fireEvent.changeText(await screen.findByPlaceholderText('Venue or address'), 'Signal, 175 Morgan Ave');
    fireEvent.press(save);

    await waitFor(() => {
      expect(mockRpc).toHaveBeenCalledWith(
        'save_event',
        expect.objectContaining({ p_location: 'Signal, 175 Morgan Ave' })
      );
    });
    expect(router.replace).toHaveBeenCalledWith('/(app)/event/e-1');
  });

  it('never refetches a seeded form, and saves what the user typed (B-1 regression)', async () => {
    // The form seeds from the preview cache (written by the detail screen
    // moments ago) and the seed is authoritative on mount: no refresh fetch
    // may fire, and the user is the only writer to the fields. Before this,
    // an in-flight refresh landing between typing and Save clobbered the edit.
    seedPreview();

    const screen = render(<EditEventScreen />);
    const titleInput = await screen.findByPlaceholderText('Event title');
    expect(titleInput.props.value).toBe('Old Title');
    expect(mockEventsSelect).not.toHaveBeenCalled();

    fireEvent.changeText(titleInput, 'Old Title edited');
    fireEvent.press(screen.getByText('Save'));

    await waitFor(() => {
      expect(mockRpc).toHaveBeenCalledWith(
        'save_event',
        expect.objectContaining({ p_title: 'Old Title edited' })
      );
    });
    expect(mockEventsSelect).not.toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith('/(app)/event/e-1');
  });

  it('never calls save_event on a no-op save (follow is preserved client-side)', async () => {
    const screen = render(<EditEventScreen />);
    const save = await screen.findByText('Save');

    // Nothing changed — the save must not hit the server at all (the server's
    // own no-op rule is defense in depth).
    fireEvent.press(save);

    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith('/(app)/event/e-1');
    });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('completes a save that takes longer than the 2s load-fetch budget (B-1)', async () => {
    const { showAlert } = require('../../../lib/dialogs');
    const { showError } = require('../../../lib/showError');
    seedPreview();
    mockRpc.mockImplementation(() =>
      abortablePromise(
        new Promise((resolve) => {
          setTimeout(
            () => resolve({ data: 'e-1', error: null }),
            FETCH_TIMEOUT_MS + 400
          );
        })
      )
    );

    const screen = render(<EditEventScreen />);
    const titleInput = await screen.findByPlaceholderText('Event title');
    fireEvent.changeText(titleInput, 'Old Title edited');
    fireEvent.press(screen.getByText('Save'));

    await waitFor(
      () => {
        expect(router.replace).toHaveBeenCalledWith('/(app)/event/e-1');
      },
      { timeout: 8000 }
    );
    expect(showAlert).not.toHaveBeenCalled();
    expect(showError).not.toHaveBeenCalled();
  }, 10000);

  it('shows a short alert, not a stack dump, if the write itself times out', async () => {
    jest.useFakeTimers();
    try {
      const { showAlert } = require('../../../lib/dialogs');
      const { showError } = require('../../../lib/showError');
      seedPreview();
      mockRpc.mockImplementation(() => abortablePromise(new Promise(() => {})));
      // Reconcile keeps finding the old values (the save never committed).
      mockEventsSingle.mockResolvedValue({ data: eventRow, error: null });

      const screen = render(<EditEventScreen />);
      const titleInput = await screen.findByPlaceholderText('Event title');
      fireEvent.changeText(titleInput, 'Old Title edited');
      fireEvent.press(screen.getByText('Save'));

      await act(async () => {
        await jest.advanceTimersByTimeAsync(WRITE_TIMEOUT_MS);
      });

      expect(showAlert).toHaveBeenCalledWith(
        'Could not save',
        'That took too long. Check your connection and try again.'
      );
      expect(showError).not.toHaveBeenCalled();
      expect(router.replace).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('navigates as if saved when a timed-out write already committed (reconcile)', async () => {
    jest.useFakeTimers();
    try {
      const { showAlert } = require('../../../lib/dialogs');
      seedPreview();
      // The save_event RPC hangs, so the write aborts at the write budget...
      mockRpc.mockImplementation(() => abortablePromise(new Promise(() => {})));
      // ...but the server committed: the row holds every intended value.
      mockEventsSingle.mockResolvedValue({
        data: { ...eventRow, title: 'Old Title edited', frozen: true },
        error: null,
      });

      const screen = render(<EditEventScreen />);
      const titleInput = await screen.findByPlaceholderText('Event title');
      fireEvent.changeText(titleInput, 'Old Title edited');
      fireEvent.press(screen.getByText('Save'));

      await act(async () => {
        await jest.advanceTimersByTimeAsync(WRITE_TIMEOUT_MS);
      });

      expect(router.replace).toHaveBeenCalledWith('/(app)/event/e-1');
      expect(showAlert).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('alerts without navigating when the reconcile read finds a field mismatch', async () => {
    jest.useFakeTimers();
    try {
      const { showAlert } = require('../../../lib/dialogs');
      seedPreview();
      mockRpc.mockImplementation(() => abortablePromise(new Promise(() => {})));
      // The row's title matches but the description is not what was typed —
      // a subset compare would false-confirm here (KI-002's lesson).
      mockEventsSingle.mockResolvedValue({
        data: { ...eventRow, title: 'Old Title edited', description: 'stale' },
        error: null,
      });

      const screen = render(<EditEventScreen />);
      const titleInput = await screen.findByPlaceholderText('Event title');
      fireEvent.changeText(titleInput, 'Old Title edited');
      fireEvent.press(screen.getByText('Save'));

      await act(async () => {
        await jest.advanceTimersByTimeAsync(WRITE_TIMEOUT_MS);
      });

      expect(showAlert).toHaveBeenCalledWith(
        'Could not save',
        'That took too long. Check your connection and try again.'
      );
      expect(router.replace).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('alerts when the reconcile read itself fails', async () => {
    jest.useFakeTimers();
    try {
      const { showAlert } = require('../../../lib/dialogs');
      seedPreview();
      mockRpc.mockImplementation(() => abortablePromise(new Promise(() => {})));
      mockEventsSingle.mockRejectedValue(
        new TypeError('NetworkError when attempting to fetch resource.')
      );

      const screen = render(<EditEventScreen />);
      const titleInput = await screen.findByPlaceholderText('Event title');
      fireEvent.changeText(titleInput, 'Old Title edited');
      fireEvent.press(screen.getByText('Save'));

      await act(async () => {
        await jest.advanceTimersByTimeAsync(WRITE_TIMEOUT_MS);
      });

      expect(showAlert).toHaveBeenCalledWith(
        'Could not save',
        'That took too long. Check your connection and try again.'
      );
      expect(router.replace).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('shows retry instead of spinning forever when the events fetch throws', async () => {
    mockEventsSingle.mockRejectedValue(
      new TypeError('NetworkError when attempting to fetch resource.')
    );

    const screen = render(<EditEventScreen />);

    await screen.findByText('Could not load this event.');
    expect(screen.getByText('Retry')).toBeTruthy();
    expect(screen.getByText('Back')).toBeTruthy();
  });

  it('keeps Cancel available while the event is still loading', async () => {
    let resolveEvents!: (value: { data: typeof eventRow; error: null }) => void;
    mockEventsSingle.mockReturnValue(
      new Promise((resolve) => {
        resolveEvents = resolve;
      })
    );

    const screen = render(<EditEventScreen />);
    const cancel = await screen.findByText('Cancel');
    fireEvent.press(cancel);
    expect(router.back).toHaveBeenCalled();

    resolveEvents({ data: eventRow, error: null });
    await screen.findByText('Save');
  });
});
