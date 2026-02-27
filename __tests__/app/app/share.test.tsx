import React from 'react';
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

const mockEventSharesUpsert = jest.fn();

const mockFrom = jest.fn();

jest.mock('../../../app/context/SessionContext', () => ({
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
});
