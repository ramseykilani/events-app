import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { abortablePromise } from '../../helpers/abortable';
import {
  clearEventPreviewCache,
  readEventPreview,
} from '../../../lib/eventPreviewCache';
import ArchivedScreen from '../../../app/(app)/archived';

const mockRpc = jest.fn();

jest.mock('../../../app/_context/SessionContext', () => ({
  useSession: () => ({
    session: { user: { id: 'u1' } },
  }),
}));

jest.mock('../../../lib/supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));

const archivedRow = {
  id: 'e-arch-1',
  title: 'Rooftop Drinks',
  description: null,
  image_url: null,
  url: null,
  event_date: '2099-10-12',
  event_time: null,
  sharer_contact_name: 'Alice',
  sharer_person_id: 'mp-1',
  sharer_user_id: 'u-alice',
  from_user_id: 'u-alice',
  archived_at: '2026-09-01T00:00:00.000Z',
};

describe('app/(app)/archived', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearEventPreviewCache();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockRpc.mockImplementation((name: string) => {
      if (name === 'get_archived_events') {
        return abortablePromise(Promise.resolve({ data: [archivedRow], error: null }));
      }
      return abortablePromise(Promise.resolve({ data: null, error: null }));
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('lists archived events with attribution and a formatted date', async () => {
    const screen = render(<ArchivedScreen />);

    await screen.findByText('Rooftop Drinks');
    expect(screen.getByText('From Alice')).toBeTruthy();
    // Dates render via lib/format.ts, never raw ISO.
    expect(screen.queryByText(/2099-10-12/)).toBeNull();
    expect(mockRpc).toHaveBeenCalledWith('get_archived_events', {
      p_today: expect.any(String),
    });
  });

  it('restores a row and removes it from the drawer', async () => {
    const screen = render(<ArchivedScreen />);

    fireEvent.press(await screen.findByLabelText('Restore Rooftop Drinks'));

    await waitFor(() => {
      expect(mockRpc).toHaveBeenCalledWith('set_event_archived', {
        p_event_id: 'e-arch-1',
        p_archived: false,
      });
    });
    await screen.findByText('Nothing archived.');
    expect(screen.queryByText('Rooftop Drinks')).toBeNull();
  });

  it('keeps the row and shows a short alert when restore fails', async () => {
    mockRpc.mockImplementation((name: string) => {
      if (name === 'get_archived_events') {
        return abortablePromise(Promise.resolve({ data: [archivedRow], error: null }));
      }
      return abortablePromise(
        Promise.resolve({ data: null, error: { message: 'write failed' } })
      );
    });

    const screen = render(<ArchivedScreen />);
    fireEvent.press(await screen.findByLabelText('Restore Rooftop Drinks'));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        'Could not restore',
        'Something went wrong. Try again.'
      );
    });
    expect(screen.getByText('Rooftop Drinks')).toBeTruthy();
  });

  it('shows the empty state when nothing is archived', async () => {
    mockRpc.mockImplementation(() =>
      abortablePromise(Promise.resolve({ data: [], error: null }))
    );

    const screen = render(<ArchivedScreen />);

    await screen.findByText('Nothing archived.');
  });

  it('shows a retry banner when the load fails and recovers on tap', async () => {
    mockRpc.mockImplementation(() =>
      abortablePromise(Promise.resolve({ data: null, error: { message: 'boom' } }))
    );

    const screen = render(<ArchivedScreen />);
    const banner = await screen.findByText('Could not refresh. Retry');

    mockRpc.mockImplementation((name: string) => {
      if (name === 'get_archived_events') {
        return abortablePromise(Promise.resolve({ data: [archivedRow], error: null }));
      }
      return abortablePromise(Promise.resolve({ data: null, error: null }));
    });
    fireEvent.press(banner);

    await screen.findByText('Rooftop Drinks');
    expect(screen.queryByText('Could not refresh. Retry')).toBeNull();
  });

  it('opens the detail with archived provenance seeded in the preview', async () => {
    const screen = render(<ArchivedScreen />);

    fireEvent.press(await screen.findByText('Rooftop Drinks'));

    expect(router.push).toHaveBeenCalledWith({
      pathname: '/(app)/event/[id]',
      params: { id: 'e-arch-1', sharedByPersonId: 'mp-1' },
    });
    // The preview must classify the row as an archived received event so the
    // detail renders Restore (never Remove) before its fetch lands.
    const preview = readEventPreview('e-arch-1');
    expect(preview?.from_user_id).toBe('u-alice');
    expect(preview?.archived_at).toBe('2026-09-01T00:00:00.000Z');
  });
});
