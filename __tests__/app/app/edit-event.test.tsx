import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';
import EditEventScreen from '../../../app/(app)/edit-event';

const mockRpc = jest.fn();

const mockEventsSingle = jest.fn();
const mockEventsEq = jest.fn();
const mockEventsSelect = jest.fn();

const mockUeUpdateEqId = jest.fn();
const mockUeUpdateEqUser = jest.fn();
const mockUeUpdate = jest.fn();
const mockUeSelectSingle = jest.fn();
const mockUeSelectEqEvent = jest.fn();
const mockUeSelectEqUser = jest.fn();
const mockUeSelect = jest.fn();
const mockUeDeleteEq = jest.fn();
const mockUeDelete = jest.fn();

const mockEsSelectEq = jest.fn();
const mockEsSelect = jest.fn();
const mockEsInsert = jest.fn();

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

jest.mock('@react-native-community/datetimepicker', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { __esModule: true, default: () => React.createElement(View) };
});

describe('app/(app)/edit-event', () => {
  const useLocalSearchParamsMock = useLocalSearchParams as jest.MockedFunction<
    typeof useLocalSearchParams
  >;

  beforeEach(() => {
    jest.clearAllMocks();
    useLocalSearchParamsMock.mockReturnValue({ eventId: 'e-old', userEventId: 'ue-old' });

    mockEventsSingle.mockResolvedValue({
      data: {
        id: 'e-old',
        created_by_user_id: 'u1',
        url: null,
        title: 'Old Title',
        description: null,
        image_url: null,
        event_date: '2026-05-01',
        event_time: null,
        created_at: '2026-01-01T00:00:00.000Z',
      },
      error: null,
    });
    mockEventsEq.mockReturnValue({ single: mockEventsSingle });
    mockEventsSelect.mockReturnValue({ eq: mockEventsEq });

    mockUeUpdateEqUser.mockResolvedValue({ error: null });
    mockUeUpdateEqId.mockReturnValue({ eq: mockUeUpdateEqUser });
    mockUeUpdate.mockReturnValue({ eq: mockUeUpdateEqId });

    mockUeSelectSingle.mockResolvedValue({ data: { id: 'ue-existing' }, error: null });
    mockUeSelectEqEvent.mockReturnValue({ single: mockUeSelectSingle });
    mockUeSelectEqUser.mockReturnValue({ eq: mockUeSelectEqEvent });
    mockUeSelect.mockReturnValue({ eq: mockUeSelectEqUser });

    mockUeDeleteEq.mockResolvedValue({ error: null });
    mockUeDelete.mockReturnValue({ eq: mockUeDeleteEq });

    mockEsSelectEq.mockResolvedValue({ data: [], error: null });
    mockEsSelect.mockReturnValue({ eq: mockEsSelectEq });
    mockEsInsert.mockResolvedValue({ error: null });

    mockRpc.mockResolvedValue({ data: 'e-new', error: null });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'events') return { select: mockEventsSelect };
      if (table === 'user_events') {
        return { update: mockUeUpdate, select: mockUeSelect, delete: mockUeDelete };
      }
      if (table === 'event_shares') {
        return { select: mockEsSelect, insert: mockEsInsert };
      }
      return {};
    });
  });

  it('saves edits by forking via find_or_create_event and navigates to the event', async () => {
    const screen = render(<EditEventScreen />);
    const save = await screen.findByText('Save');

    fireEvent.press(save);

    await waitFor(() => {
      expect(mockRpc).toHaveBeenCalledWith('find_or_create_event', {
        p_url: null,
        p_title: 'Old Title',
        p_description: null,
        p_image_url: null,
        p_event_date: '2026-05-01',
        p_event_time: null,
      });
    });
    expect(mockUeUpdate).toHaveBeenCalledWith({ event_id: 'e-new' });
    expect(router.replace).toHaveBeenCalledWith('/(app)/event/e-new');
    expect(mockUeDelete).not.toHaveBeenCalled();
  });

  it('merges shares into the existing copy on a 23505 conflict, then removes the old row', async () => {
    mockUeUpdateEqUser.mockResolvedValue({
      error: { code: '23505', message: 'duplicate key value' },
    });
    // Target copy already shared with p1; source copy shared with p1 and p2.
    mockEsSelectEq
      .mockResolvedValueOnce({ data: [{ person_id: 'p1' }], error: null })
      .mockResolvedValueOnce({
        data: [{ person_id: 'p1' }, { person_id: 'p2' }],
        error: null,
      });

    const screen = render(<EditEventScreen />);
    const save = await screen.findByText('Save');

    fireEvent.press(save);

    await waitFor(() => {
      expect(mockEsInsert).toHaveBeenCalledWith([
        { user_event_id: 'ue-existing', person_id: 'p2' },
      ]);
    });
    expect(mockUeDeleteEq).toHaveBeenCalledWith('id', 'ue-old');
    expect(router.replace).toHaveBeenCalledWith('/(app)/event/e-new');
  });

  it('surfaces an error instead of navigating when the merge fails', async () => {
    const { showError } = require('../../../lib/showError');
    mockUeUpdateEqUser.mockResolvedValue({
      error: { code: '23505', message: 'duplicate key value' },
    });
    mockUeDeleteEq.mockResolvedValue({ error: { message: 'delete failed' } });

    const screen = render(<EditEventScreen />);
    const save = await screen.findByText('Save');

    fireEvent.press(save);

    await waitFor(() => {
      expect(showError).toHaveBeenCalledWith(
        'Error',
        expect.objectContaining({ message: 'delete failed' })
      );
    });
    expect(router.replace).not.toHaveBeenCalled();
  });
});
