import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { abortable, abortablePromise } from '../../helpers/abortable';
import {
  clearEventPreviewCache,
  rememberEventPreview,
} from '../../../lib/eventPreviewCache';
import { FETCH_ATTEMPTS, FETCH_TIMEOUT_MS } from '../../../lib/timeoutSignal';
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

const mockSessionState: { session: { user: { id: string } } | null } = {
  session: { user: { id: 'u1' } },
};

jest.mock('../../../app/_context/SessionContext', () => ({
  useSession: () => ({
    session: mockSessionState.session,
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
    clearEventPreviewCache();
    mockSessionState.session = { user: { id: 'u1' } };
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    useLocalSearchParamsMock.mockReturnValue({ id: 'e1' });

    mockEventsSingle.mockResolvedValue({ data: eventRow, error: null });
    mockEventsEq.mockReturnValue(abortable({ single: mockEventsSingle }));
    mockEventsSelect.mockReturnValue({ eq: mockEventsEq });

    mockUeSingle.mockResolvedValue({ data: { id: 'ue1' }, error: null });
    mockUeEqEvent.mockReturnValue(abortable({ single: mockUeSingle }));
    mockUeEqUser.mockReturnValue({ eq: mockUeEqEvent });
    mockUeSelect.mockReturnValue({ eq: mockUeEqUser });
    mockUeDeleteEqUser.mockImplementation(() =>
      abortablePromise(Promise.resolve({ error: null }))
    );
    mockUeDeleteEqId.mockReturnValue({ eq: mockUeDeleteEqUser });
    mockUeDelete.mockReturnValue({ eq: mockUeDeleteEqId });

    mockSharesEq.mockImplementation(() =>
      abortablePromise(Promise.resolve({ data: [], error: null }))
    );
    mockSharesSelect.mockReturnValue({ eq: mockSharesEq });

    mockPeopleIn.mockImplementation(() =>
      abortablePromise(Promise.resolve({ data: [], error: null }))
    );
    mockPeopleSingle.mockResolvedValue({
      data: { contact_name: 'Alice', phone_number: '+14165550001' },
      error: null,
    });
    mockPeopleEq.mockReturnValue(abortable({ single: mockPeopleSingle }));
    mockPeopleSelect.mockReturnValue({ in: mockPeopleIn, eq: mockPeopleEq });

    mockHiddenMaybeSingle.mockResolvedValue({ data: null, error: null });
    mockHiddenEqPerson.mockReturnValue(abortable({ maybeSingle: mockHiddenMaybeSingle }));
    mockHiddenEqOwner.mockReturnValue({ eq: mockHiddenEqPerson });
    mockHiddenSelect.mockReturnValue({ eq: mockHiddenEqOwner });
    mockHiddenInsert.mockImplementation(() =>
      abortablePromise(Promise.resolve({ error: null }))
    );
    mockHiddenDeleteEqPerson.mockImplementation(() =>
      abortablePromise(Promise.resolve({ error: null }))
    );
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
    mockHiddenInsert.mockImplementation(() =>
      abortablePromise(Promise.resolve({ error: { message: 'insert failed' } }))
    );

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

  it('navigates back after a successful hide — also when the viewer owns a copy (forwarding)', async () => {
    useLocalSearchParamsMock.mockReturnValue({ id: 'e1', sharedByPersonId: 'mp-9' });
    // userEventId stays set (default mock): recipients own their copy, and
    // the hide action must still be available on shared events.

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

  it('shows retry instead of spinning forever when the events fetch throws', async () => {
    mockEventsSingle.mockRejectedValue(
      new TypeError('NetworkError when attempting to fetch resource.')
    );

    const screen = render(<EventDetailScreen />);

    await screen.findByText('Could not load this event.');
    expect(screen.getByText('Retry')).toBeTruthy();
    expect(screen.getByText('Back')).toBeTruthy();
  });

  it('shows retry instead of spinning forever when session is missing', async () => {
    mockSessionState.session = null;

    const screen = render(<EventDetailScreen />);

    await screen.findByText('Could not load this event.');
    expect(screen.getByText('Retry')).toBeTruthy();
  });

  it('retries a failed load and then shows the event', async () => {
    const err = new TypeError('NetworkError when attempting to fetch resource.');
    mockEventsSingle
      .mockRejectedValueOnce(err)
      .mockRejectedValueOnce(err)
      .mockRejectedValueOnce(err);

    const screen = render(<EventDetailScreen />);
    await screen.findByText('Could not load this event.');

    fireEvent.press(screen.getByText('Retry'));

    await screen.findByText('Remove Event');
    expect(screen.getByText('Board Game Night')).toBeTruthy();
  });

  it('auto-retries a thrown fetch and then shows the event', async () => {
    mockEventsSingle.mockRejectedValueOnce(
      new TypeError('NetworkError when attempting to fetch resource.')
    );

    const screen = render(<EventDetailScreen />);
    await screen.findByText('Remove Event');
    expect(screen.getByText('Board Game Night')).toBeTruthy();
  });

  it('shows Share/Edit/Remove immediately from a calendar preview without waiting on fetch', async () => {
    rememberEventPreview({
      event_id: 'e1',
      userEventId: 'ue1',
      title: 'Board Game Night',
      description: null,
      image_url: null,
      url: null,
      event_date: '2026-05-10',
      event_time: null,
    });
    useLocalSearchParamsMock.mockReturnValue({ id: 'e1', userEventId: 'ue1' });
    let resolveEvents!: (value: { data: typeof eventRow; error: null }) => void;
    mockEventsSingle.mockReturnValue(
      new Promise((resolve) => {
        resolveEvents = resolve;
      })
    );

    const screen = render(<EventDetailScreen />);
    expect(screen.getByText('Board Game Night')).toBeTruthy();
    expect(screen.getByText('Share')).toBeTruthy();
    expect(screen.getByText('Edit')).toBeTruthy();
    expect(screen.getByText('Remove Event')).toBeTruthy();

    resolveEvents({ data: eventRow, error: null });
    await waitFor(() => expect(mockEventsSingle).toHaveBeenCalled());
  });

  it('gives up a hung fetch after a few short attempts and shows Retry', async () => {
    jest.useFakeTimers();
    mockEventsSingle.mockReturnValue(new Promise(() => {}));

    const screen = render(<EventDetailScreen />);
    expect(screen.getByText('Back')).toBeTruthy();

    await act(async () => {
      await jest.advanceTimersByTimeAsync(FETCH_TIMEOUT_MS * FETCH_ATTEMPTS);
    });

    expect(await screen.findByText('Could not load this event.')).toBeTruthy();
    expect(screen.getByText('Retry')).toBeTruthy();
    jest.useRealTimers();
  });

  it('keeps Back available while the detail is still loading', async () => {
    let resolveEvents!: (value: { data: typeof eventRow; error: null }) => void;
    mockEventsSingle.mockReturnValue(
      new Promise((resolve) => {
        resolveEvents = resolve;
      })
    );

    const screen = render(<EventDetailScreen />);
    const back = await screen.findByText('Back');
    fireEvent.press(back);
    expect(router.back).toHaveBeenCalled();

    resolveEvents({ data: eventRow, error: null });
    await screen.findByText('Remove Event');
  });
});
