import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';
import EventDetailScreen from '../../../app/(app)/event/[id]';

const mockEventsSingle = jest.fn();
const mockEventsEq = jest.fn();
const mockEventsSelect = jest.fn();
const mockEventsDelete = jest.fn();

const mockUeSingle = jest.fn();
const mockUeEqEvent = jest.fn();
const mockUeEqUser = jest.fn();
const mockUeSelect = jest.fn();
const mockUeDeleteEqUser = jest.fn();
const mockUeDeleteEqId = jest.fn();
const mockUeDelete = jest.fn();

const mockSharesEq = jest.fn();
const mockSharesSelect = jest.fn();

const mockPeopleIn = jest.fn();
const mockPeopleSingle = jest.fn();
const mockPeopleEq = jest.fn();
const mockPeopleSelect = jest.fn();

const mockHiddenMaybeSingle = jest.fn();
const mockHiddenEqPerson = jest.fn();
const mockHiddenEqOwner = jest.fn();
const mockHiddenSelect = jest.fn();
const mockHiddenInsert = jest.fn();
const mockHiddenDeleteEqPerson = jest.fn();
const mockHiddenDeleteEqOwner = jest.fn();
const mockHiddenDelete = jest.fn();

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

const eventRow = {
  id: 'e1',
  created_by_user_id: 'u1',
  url: null,
  title: 'Board Game Night',
  description: null,
  image_url: null,
  event_date: '2026-05-10',
  event_time: null,
  created_at: '2026-01-01T00:00:00.000Z',
};

describe('app/(app)/event/[id]', () => {
  const useLocalSearchParamsMock = useLocalSearchParams as jest.MockedFunction<
    typeof useLocalSearchParams
  >;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    useLocalSearchParamsMock.mockReturnValue({ id: 'e1' });

    mockEventsSingle.mockResolvedValue({ data: eventRow, error: null });
    mockEventsEq.mockReturnValue({ single: mockEventsSingle });
    mockEventsSelect.mockReturnValue({ eq: mockEventsEq });

    mockUeSingle.mockResolvedValue({ data: { id: 'ue1' }, error: null });
    mockUeEqEvent.mockReturnValue({ single: mockUeSingle });
    mockUeEqUser.mockReturnValue({ eq: mockUeEqEvent });
    mockUeSelect.mockReturnValue({ eq: mockUeEqUser });
    mockUeDeleteEqUser.mockResolvedValue({ error: null });
    mockUeDeleteEqId.mockReturnValue({ eq: mockUeDeleteEqUser });
    mockUeDelete.mockReturnValue({ eq: mockUeDeleteEqId });

    mockSharesEq.mockResolvedValue({ data: [], error: null });
    mockSharesSelect.mockReturnValue({ eq: mockSharesEq });

    mockPeopleIn.mockResolvedValue({ data: [], error: null });
    mockPeopleSingle.mockResolvedValue({
      data: { contact_name: 'Alice', phone_number: '+14165550001' },
      error: null,
    });
    mockPeopleEq.mockReturnValue({ single: mockPeopleSingle });
    mockPeopleSelect.mockReturnValue({ in: mockPeopleIn, eq: mockPeopleEq });

    mockHiddenMaybeSingle.mockResolvedValue({ data: null, error: null });
    mockHiddenEqPerson.mockReturnValue({ maybeSingle: mockHiddenMaybeSingle });
    mockHiddenEqOwner.mockReturnValue({ eq: mockHiddenEqPerson });
    mockHiddenSelect.mockReturnValue({ eq: mockHiddenEqOwner });
    mockHiddenInsert.mockResolvedValue({ error: null });
    mockHiddenDeleteEqPerson.mockResolvedValue({ error: null });
    mockHiddenDeleteEqOwner.mockReturnValue({ eq: mockHiddenDeleteEqPerson });
    mockHiddenDelete.mockReturnValue({ eq: mockHiddenDeleteEqOwner });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'events') return { select: mockEventsSelect, delete: mockEventsDelete };
      if (table === 'user_events') return { select: mockUeSelect, delete: mockUeDelete };
      if (table === 'event_shares') return { select: mockSharesSelect };
      if (table === 'my_people') return { select: mockPeopleSelect };
      if (table === 'hidden_people') {
        return { select: mockHiddenSelect, insert: mockHiddenInsert, delete: mockHiddenDelete };
      }
      return {};
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('removes only the own user_events row — never the events row', async () => {
    const screen = render(<EventDetailScreen />);
    const removeButton = await screen.findByText('Remove Event');

    fireEvent.press(removeButton);
    const alertButtons = (Alert.alert as jest.Mock).mock.calls[0][2] as {
      text: string;
      onPress?: () => void;
    }[];
    const destructive = alertButtons.find((b) => b.text === 'Remove');
    destructive?.onPress?.();

    await waitFor(() => {
      expect(mockUeDeleteEqId).toHaveBeenCalledWith('id', 'ue1');
      expect(mockUeDeleteEqUser).toHaveBeenCalledWith('user_id', 'u1');
    });
    expect(mockEventsDelete).not.toHaveBeenCalled();
    expect(router.back).toHaveBeenCalled();
  });

  it('shows an error instead of navigating back when hide fails', async () => {
    const { showError } = require('../../../lib/showError');
    useLocalSearchParamsMock.mockReturnValue({ id: 'e1', sharedByPersonId: 'mp-9' });
    mockUeSingle.mockResolvedValue({ data: null, error: null });
    mockHiddenInsert.mockResolvedValue({ error: { message: 'insert failed' } });

    const screen = render(<EventDetailScreen />);
    const hideButton = await screen.findByText('Hide Alice');

    fireEvent.press(hideButton);

    await waitFor(() => {
      expect(showError).toHaveBeenCalledWith(
        'Error',
        expect.objectContaining({ message: 'insert failed' })
      );
    });
    expect(router.back).not.toHaveBeenCalled();
  });

  it('navigates back after a successful hide', async () => {
    useLocalSearchParamsMock.mockReturnValue({ id: 'e1', sharedByPersonId: 'mp-9' });
    mockUeSingle.mockResolvedValue({ data: null, error: null });

    const screen = render(<EventDetailScreen />);
    const hideButton = await screen.findByText('Hide Alice');

    fireEvent.press(hideButton);

    await waitFor(() => {
      expect(mockHiddenInsert).toHaveBeenCalledWith({
        owner_id: 'u1',
        person_id: 'mp-9',
      });
    });
    expect(router.back).toHaveBeenCalled();
  });

  it('shows access-removed state with a back button when the event is not visible', async () => {
    mockEventsSingle.mockResolvedValue({
      data: null,
      error: { code: 'PGRST116', message: 'row not found' },
    });

    const screen = render(<EventDetailScreen />);

    await screen.findByText('Access removed');
    fireEvent.press(screen.getByText('Back'));
    expect(router.back).toHaveBeenCalled();
  });
});
