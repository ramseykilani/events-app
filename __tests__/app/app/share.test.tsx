import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';
import ShareScreen from '../../../app/(app)/share';

const mockMyPeopleOrder = jest.fn();
const mockMyPeopleEq = jest.fn();
const mockMyPeopleSelect = jest.fn();

const mockCirclesEq = jest.fn();
const mockCirclesSelect = jest.fn();

const mockEventSharesEq = jest.fn();
const mockEventSharesSelect = jest.fn();
const mockEventSharesDelete = jest.fn();

const mockRpc = jest.fn();
const mockFunctionsInvoke = jest.fn();
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
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
    functions: {
      invoke: (...args: unknown[]) => mockFunctionsInvoke(...args),
    },
  },
}));

jest.mock('../../../lib/showError', () => ({
  showError: jest.fn(),
}));

jest.mock('../../../components/ShareSheet', () => {
  const React = require('react');
  const { TouchableOpacity, Text, View } = require('react-native');

  return {
    ShareSheet: ({
      onSelectionChange,
      sharedPersonIds,
    }: {
      onSelectionChange: (ids: Set<string>) => void;
      sharedPersonIds?: Set<string>;
    }) => (
      <View>
        <TouchableOpacity
          testID="mock-share-sheet-select"
          onPress={() => onSelectionChange(new Set(['p1', 'p2']))}
        >
          <Text>Select two people</Text>
        </TouchableOpacity>
        <TouchableOpacity
          testID="mock-share-sheet-select-one"
          onPress={() => onSelectionChange(new Set(['p2']))}
        >
          <Text>Select only p2</Text>
        </TouchableOpacity>
        <TouchableOpacity
          testID="mock-share-sheet-clear"
          onPress={() => onSelectionChange(new Set())}
        >
          <Text>Clear selection</Text>
        </TouchableOpacity>
        <Text testID="mock-shared-ids">
          {Array.from(sharedPersonIds ?? []).join(',')}
        </Text>
      </View>
    ),
  };
});

describe('app/(app)/share', () => {
  const useLocalSearchParamsMock = useLocalSearchParams as jest.MockedFunction<
    typeof useLocalSearchParams
  >;

  beforeEach(() => {
    jest.clearAllMocks();
    useLocalSearchParamsMock.mockReturnValue({ eventId: 'e1', userEventId: 'ue1' });

    mockFunctionsInvoke.mockResolvedValue({ data: null, error: null });
    mockRpc.mockResolvedValue({ data: 2, error: null });

    mockMyPeopleOrder.mockResolvedValue({
      data: [
        {
          id: 'p1',
          owner_id: 'u1',
          phone_number: '+14165550001',
          user_id: null,
          contact_name: 'Alice',
          added_at: '2026-01-01T00:00:00.000Z',
          last_shared_at: null,
        },
        {
          id: 'p2',
          owner_id: 'u1',
          phone_number: '+14165550002',
          user_id: null,
          contact_name: 'Bob',
          added_at: '2026-01-02T00:00:00.000Z',
          last_shared_at: null,
        },
      ],
      error: null,
    });
    mockMyPeopleEq.mockReturnValue({ order: mockMyPeopleOrder });
    mockMyPeopleSelect.mockReturnValue({ eq: mockMyPeopleEq });

    mockCirclesEq.mockResolvedValue({ data: [], error: null });
    mockCirclesSelect.mockReturnValue({ eq: mockCirclesEq });

    mockEventSharesEq.mockResolvedValue({ data: [], error: null });
    mockEventSharesSelect.mockReturnValue({ eq: mockEventSharesEq });
    mockEventSharesDelete.mockReturnValue({ eq: jest.fn() });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'my_people') {
        return {
          select: mockMyPeopleSelect,
        };
      }
      if (table === 'circles') {
        return {
          select: mockCirclesSelect,
        };
      }
      if (table === 'event_shares') {
        return {
          select: mockEventSharesSelect,
          delete: mockEventSharesDelete,
        };
      }
      return {};
    });
  });

  it('shares via the share_event RPC, notifies, and navigates back', async () => {
    const screen = render(<ShareScreen />);

    fireEvent.press(screen.getByTestId('mock-share-sheet-select'));
    fireEvent.press(screen.getByText('Share'));

    await waitFor(() => {
      expect(mockRpc).toHaveBeenCalledWith('share_event', {
        p_user_event_id: 'ue1',
        p_person_ids: ['p1', 'p2'],
      });
    });

    expect(mockFunctionsInvoke).toHaveBeenCalledWith('send-notification', {
      body: { userEventId: 'ue1' },
    });
    expect(router.back).toHaveBeenCalled();
  });

  it('does not share or navigate when Share is pressed with no people selected', async () => {
    const screen = render(<ShareScreen />);

    fireEvent.press(screen.getByText('Share'));

    await waitFor(() => expect(mockRpc).not.toHaveBeenCalled());
    expect(router.back).not.toHaveBeenCalled();
  });

  it('never deletes event_shares (sharing is forwarding, not revocable)', async () => {
    mockEventSharesEq.mockResolvedValue({ data: [{ person_id: 'p1' }], error: null });

    const screen = render(<ShareScreen />);
    await waitFor(() =>
      expect(mockEventSharesEq).toHaveBeenCalledWith('user_event_id', 'ue1')
    );

    // Even after clearing the selection, confirming is blocked and nothing
    // is deleted — existing shares are completed actions.
    fireEvent.press(screen.getByTestId('mock-share-sheet-clear'));
    fireEvent.press(screen.getByText('Share'));

    await waitFor(() => expect(mockRpc).not.toHaveBeenCalled());
    expect(mockEventSharesDelete).not.toHaveBeenCalled();
    expect(mockFunctionsInvoke).not.toHaveBeenCalled();
    expect(router.back).not.toHaveBeenCalled();
  });

  it('marks already-shared people as completed and excludes them from the RPC', async () => {
    mockEventSharesEq.mockResolvedValue({ data: [{ person_id: 'p1' }], error: null });

    const screen = render(<ShareScreen />);
    await waitFor(() =>
      expect(mockEventSharesEq).toHaveBeenCalledWith('user_event_id', 'ue1')
    );

    expect(screen.getByTestId('mock-shared-ids').props.children).toBe('p1');

    // The sheet would not allow selecting p1; even if it did, the screen
    // filters already-shared people out of the RPC call.
    fireEvent.press(screen.getByTestId('mock-share-sheet-select'));
    fireEvent.press(screen.getByText('Share'));

    await waitFor(() => {
      expect(mockRpc).toHaveBeenCalledWith('share_event', {
        p_user_event_id: 'ue1',
        p_person_ids: ['p2'],
      });
    });
    expect(router.back).toHaveBeenCalled();
  });

  it('calls showError when the share_event RPC fails', async () => {
    const { showError } = require('../../../lib/showError');
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: '42501', message: 'Not your event' },
    });

    const screen = render(<ShareScreen />);
    fireEvent.press(screen.getByTestId('mock-share-sheet-select'));
    fireEvent.press(screen.getByText('Share'));

    await waitFor(() => {
      expect(showError).toHaveBeenCalledWith(
        'Error',
        expect.objectContaining({ code: '42501' })
      );
    });
    expect(router.back).not.toHaveBeenCalled();
  });

  describe('when userEventId is not in params', () => {
    const mockUserEventsSingle = jest.fn();
    const mockUserEventsEqEventId = jest.fn();
    const mockUserEventsEqUserId = jest.fn();
    const mockUserEventsSelect = jest.fn();
    const mockUserEventsInsertSingle = jest.fn();
    const mockUserEventsInsertSelect = jest.fn();
    const mockUserEventsInsert = jest.fn();

    beforeEach(() => {
      useLocalSearchParamsMock.mockReturnValue({ eventId: 'e1' });

      mockUserEventsSelect.mockReturnValue({ eq: mockUserEventsEqUserId });
      mockUserEventsEqUserId.mockReturnValue({ eq: mockUserEventsEqEventId });
      mockUserEventsEqEventId.mockReturnValue({ single: mockUserEventsSingle });
      mockUserEventsInsert.mockReturnValue({ select: mockUserEventsInsertSelect });
      mockUserEventsInsertSelect.mockReturnValue({ single: mockUserEventsInsertSingle });

      mockFrom.mockImplementation((table: string) => {
        if (table === 'my_people') {
          return { select: mockMyPeopleSelect };
        }
        if (table === 'circles') {
          return { select: mockCirclesSelect };
        }
        if (table === 'event_shares') {
          return { select: mockEventSharesSelect, delete: mockEventSharesDelete };
        }
        if (table === 'user_events') {
          return { select: mockUserEventsSelect, insert: mockUserEventsInsert };
        }
        return {};
      });
    });

    it('inserts a new user_events row when none exists then shares', async () => {
      mockUserEventsSingle.mockResolvedValueOnce({ data: null, error: null });
      mockUserEventsInsertSingle.mockResolvedValueOnce({ data: { id: 'ue-new' }, error: null });

      const screen = render(<ShareScreen />);
      fireEvent.press(screen.getByTestId('mock-share-sheet-select'));
      fireEvent.press(screen.getByText('Share'));

      await waitFor(() => {
        expect(mockRpc).toHaveBeenCalledWith('share_event', {
          p_user_event_id: 'ue-new',
          p_person_ids: ['p1', 'p2'],
        });
      });
      expect(router.back).toHaveBeenCalled();
    });

    it('falls back to select after a 23505 insert conflict', async () => {
      mockUserEventsSingle
        .mockResolvedValueOnce({ data: null, error: null })
        .mockResolvedValueOnce({ data: { id: 'ue-conflict' }, error: null });
      mockUserEventsInsertSingle.mockResolvedValueOnce({
        data: null,
        error: { code: '23505', message: 'duplicate key value' },
      });

      const screen = render(<ShareScreen />);
      fireEvent.press(screen.getByTestId('mock-share-sheet-select'));
      fireEvent.press(screen.getByText('Share'));

      await waitFor(() => {
        expect(mockRpc).toHaveBeenCalledWith('share_event', {
          p_user_event_id: 'ue-conflict',
          p_person_ids: ['p1', 'p2'],
        });
      });
      expect(router.back).toHaveBeenCalled();
    });

    it('calls showError when insert fails with a non-conflict error', async () => {
      const { showError } = require('../../../lib/showError');
      mockUserEventsSingle.mockResolvedValueOnce({ data: null, error: null });
      mockUserEventsInsertSingle.mockResolvedValueOnce({
        data: null,
        error: { code: '42501', message: 'permission denied' },
      });

      const screen = render(<ShareScreen />);
      fireEvent.press(screen.getByTestId('mock-share-sheet-select'));
      fireEvent.press(screen.getByText('Share'));

      await waitFor(() => {
        expect(showError).toHaveBeenCalledWith(
          'Error',
          expect.objectContaining({ code: '42501' })
        );
      });
      expect(router.back).not.toHaveBeenCalled();
    });
  });
});
