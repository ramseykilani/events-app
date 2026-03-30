import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';
import ShareScreen from '../../../app/(app)/share';

const mockMyPeopleOrder = jest.fn();
const mockMyPeopleEq = jest.fn();
const mockMyPeopleSelect = jest.fn();
const mockMyPeopleIn = jest.fn();
const mockMyPeopleUpdate = jest.fn();

const mockCirclesEq = jest.fn();
const mockCirclesSelect = jest.fn();

const mockEventSharesEq = jest.fn();
const mockEventSharesSelect = jest.fn();
const mockEventSharesUpsert = jest.fn();

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
  },
}));

jest.mock('../../../lib/showError', () => ({
  showError: jest.fn(),
}));

jest.mock('../../../components/ShareSheet', () => {
  const React = require('react');
  const { TouchableOpacity, Text } = require('react-native');

  return {
    ShareSheet: ({
      onSelectionChange,
    }: {
      onSelectionChange: (ids: Set<string>) => void;
    }) => (
      <TouchableOpacity
        testID="mock-share-sheet-select"
        onPress={() => onSelectionChange(new Set(['p1', 'p2']))}
      >
        <Text>Select two people</Text>
      </TouchableOpacity>
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

    mockMyPeopleIn.mockResolvedValue({ error: null });
    mockMyPeopleUpdate.mockReturnValue({ in: mockMyPeopleIn });

    mockCirclesEq.mockResolvedValue({ data: [], error: null });
    mockCirclesSelect.mockReturnValue({ eq: mockCirclesEq });

    mockEventSharesUpsert.mockResolvedValue({ error: null });
    mockEventSharesEq.mockResolvedValue({ data: [], error: null });
    mockEventSharesSelect.mockReturnValue({ eq: mockEventSharesEq });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'my_people') {
        return {
          select: mockMyPeopleSelect,
          update: mockMyPeopleUpdate,
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
          upsert: mockEventSharesUpsert,
        };
      }
      return {};
    });
  });

  it('shares an event with selected people and navigates back', async () => {
    const screen = render(<ShareScreen />);

    fireEvent.press(screen.getByTestId('mock-share-sheet-select'));
    fireEvent.press(screen.getByText('Done'));

    await waitFor(() => {
      expect(mockEventSharesUpsert).toHaveBeenCalledWith(
        [
          { user_event_id: 'ue1', person_id: 'p1' },
          { user_event_id: 'ue1', person_id: 'p2' },
        ],
        {
          onConflict: 'user_event_id,person_id',
          ignoreDuplicates: true,
        }
      );
    });

    expect(mockMyPeopleUpdate).toHaveBeenCalledWith({
      last_shared_at: expect.any(String),
    });
    expect(mockMyPeopleIn).toHaveBeenCalledWith('id', ['p1', 'p2']);
    expect(router.back).toHaveBeenCalled();
  });

  it('does not share or navigate when Done is pressed with no people selected', async () => {
    const screen = render(<ShareScreen />);

    fireEvent.press(screen.getByText('Done'));

    await waitFor(() => expect(mockEventSharesUpsert).not.toHaveBeenCalled());
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
          return { select: mockMyPeopleSelect, update: mockMyPeopleUpdate };
        }
        if (table === 'circles') {
          return { select: mockCirclesSelect };
        }
        if (table === 'event_shares') {
          return { upsert: mockEventSharesUpsert };
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
      fireEvent.press(screen.getByText('Done'));

      await waitFor(() => {
        expect(mockEventSharesUpsert).toHaveBeenCalledWith(
          [
            { user_event_id: 'ue-new', person_id: 'p1' },
            { user_event_id: 'ue-new', person_id: 'p2' },
          ],
          { onConflict: 'user_event_id,person_id', ignoreDuplicates: true }
        );
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
      fireEvent.press(screen.getByText('Done'));

      await waitFor(() => {
        expect(mockEventSharesUpsert).toHaveBeenCalledWith(
          [
            { user_event_id: 'ue-conflict', person_id: 'p1' },
            { user_event_id: 'ue-conflict', person_id: 'p2' },
          ],
          { onConflict: 'user_event_id,person_id', ignoreDuplicates: true }
        );
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
      fireEvent.press(screen.getByText('Done'));

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
