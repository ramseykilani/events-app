import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';
import ShareScreen from '../../../app/(app)/share';

const myPeopleOrderMock = jest.fn();
const myPeopleEqMock = jest.fn();
const myPeopleSelectMock = jest.fn();
const myPeopleInMock = jest.fn();
const myPeopleUpdateMock = jest.fn();

const circlesEqMock = jest.fn();
const circlesSelectMock = jest.fn();

const eventSharesUpsertMock = jest.fn();

const fromMock = jest.fn();

jest.mock('../../../app/context/SessionContext', () => ({
  useSession: () => ({
    session: {
      user: { id: 'u1' },
    },
  }),
}));

jest.mock('../../../lib/supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
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

    myPeopleOrderMock.mockResolvedValue({
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
    myPeopleEqMock.mockReturnValue({ order: myPeopleOrderMock });
    myPeopleSelectMock.mockReturnValue({ eq: myPeopleEqMock });

    myPeopleInMock.mockResolvedValue({ error: null });
    myPeopleUpdateMock.mockReturnValue({ in: myPeopleInMock });

    circlesEqMock.mockResolvedValue({ data: [], error: null });
    circlesSelectMock.mockReturnValue({ eq: circlesEqMock });

    eventSharesUpsertMock.mockResolvedValue({ error: null });

    fromMock.mockImplementation((table: string) => {
      if (table === 'my_people') {
        return {
          select: myPeopleSelectMock,
          update: myPeopleUpdateMock,
        };
      }
      if (table === 'circles') {
        return {
          select: circlesSelectMock,
        };
      }
      if (table === 'event_shares') {
        return {
          upsert: eventSharesUpsertMock,
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
      expect(eventSharesUpsertMock).toHaveBeenCalledWith(
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

    expect(myPeopleUpdateMock).toHaveBeenCalledWith({
      last_shared_at: expect.any(String),
    });
    expect(myPeopleInMock).toHaveBeenCalledWith('id', ['p1', 'p2']);
    expect(router.back).toHaveBeenCalled();
  });
});
