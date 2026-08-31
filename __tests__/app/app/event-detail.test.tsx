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

const mockEventsMaybeSingle = jest.fn();
const mockEventsEq = jest.fn();
const mockEventsSelect = jest.fn();
const mockEventsDeleteEqOwner = jest.fn();
const mockEventsDeleteEqId = jest.fn();
const mockEventsDelete = jest.fn();

const mockSendsEq = jest.fn();
const mockSendsSelect = jest.fn();

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
const mockRpc = jest.fn();
const mockFunctionsInvoke = jest.fn();

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
    rpc: (...args: unknown[]) => mockRpc(...args),
    functions: { invoke: (...args: unknown[]) => mockFunctionsInvoke(...args) },
  },
}));

const eventRow = {
  id: 'e1',
  owner_id: 'u1',
  url: null,
  title: 'Board Game Night',
  description: null,
  image_url: null,
  event_date: '2026-05-10',
  event_time: null,
  from_event_id: null,
  from_user_id: null,
  frozen: false,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
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

    mockEventsMaybeSingle.mockResolvedValue({ data: eventRow, error: null });
    mockEventsEq.mockReturnValue(abortable({ maybeSingle: mockEventsMaybeSingle }));
    mockEventsSelect.mockReturnValue({ eq: mockEventsEq });

    mockEventsDeleteEqOwner.mockImplementation(() =>
      abortablePromise(Promise.resolve({ error: null }))
    );
    mockEventsDeleteEqId.mockReturnValue({ eq: mockEventsDeleteEqOwner });
    mockEventsDelete.mockReturnValue({ eq: mockEventsDeleteEqId });

    mockSendsEq.mockImplementation(() =>
      abortablePromise(Promise.resolve({ data: [], error: null }))
    );
    mockSendsSelect.mockReturnValue({ eq: mockSendsEq });

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
      if (table === 'sends') return { select: mockSendsSelect };
      if (table === 'my_people') return { select: mockPeopleSelect };
      if (table === 'hidden_people') {
        return { select: mockHiddenSelect, insert: mockHiddenInsert, delete: mockHiddenDelete };
      }
      return {};
    });

    // Who's Coming: default = nothing to answer (the RPC returns zero rows),
    // so no Yes/No widget renders unless a test sets one up.
    mockRpc.mockImplementation(() =>
      abortablePromise(Promise.resolve({ data: [], error: null }))
    );
    mockFunctionsInvoke.mockResolvedValue({ data: { sent: 1 }, error: null });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('removes only the caller\'s own events row', async () => {
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
      expect(mockEventsDeleteEqId).toHaveBeenCalledWith('id', 'e1');
      expect(mockEventsDeleteEqOwner).toHaveBeenCalledWith('owner_id', 'u1');
    });
    expect(router.back).toHaveBeenCalled();
  });

  it('shows the Shared with list when sends exist', async () => {
    mockSendsEq.mockImplementation(() =>
      abortablePromise(Promise.resolve({ data: [{ person_id: 'p1' }], error: null }))
    );
    mockPeopleIn.mockImplementation(() =>
      abortablePromise(
        Promise.resolve({
          data: [{ id: 'p1', contact_name: 'Alice', phone_number: '+14165550001' }],
          error: null,
        })
      )
    );

    const screen = render(<EventDetailScreen />);

    await screen.findByText('Shared with');
    expect(screen.getByText('Alice')).toBeTruthy();
    expect(mockSendsEq).toHaveBeenCalledWith('event_id', 'e1');
  });

  it('resolves the caller\'s own copy via the from_event_id fallback (notification tap with the sender\'s row id)', async () => {
    // The param id is the SENDER's row id: the caller's own-row lookup
    // misses, and the fallback finds their copy by from_event_id.
    const copyRow = { ...eventRow, id: 'e-copy', from_event_id: 'e1', from_user_id: 'u-sender' };
    mockEventsMaybeSingle
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: copyRow, error: null });

    const screen = render(<EventDetailScreen />);

    await screen.findByText('Board Game Night');
    expect(mockEventsEq).toHaveBeenCalledWith('id', 'e1');
    expect(mockEventsEq).toHaveBeenCalledWith('from_event_id', 'e1');

    // Actions operate on the resolved copy, not the param id.
    fireEvent.press(screen.getByText('Share'));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/(app)/share',
      params: { eventId: 'e-copy' },
    });
  });

  it('shows the access-removed state when neither the row nor a followed copy resolves', async () => {
    mockEventsMaybeSingle.mockResolvedValue({ data: null, error: null });

    const screen = render(<EventDetailScreen />);

    await screen.findByText('Access removed');
    fireEvent.press(screen.getByText('Back'));
    expect(router.back).toHaveBeenCalled();
  });

  it('shows a short alert instead of navigating back when hide fails', async () => {
    useLocalSearchParamsMock.mockReturnValue({ id: 'e1', sharedByPersonId: 'mp-9' });
    mockHiddenInsert.mockImplementation(() =>
      abortablePromise(Promise.resolve({ error: { message: 'insert failed' } }))
    );

    const screen = render(<EventDetailScreen />);
    const hideButton = await screen.findByText('Hide Alice');

    fireEvent.press(hideButton);

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        'Could not update',
        'Something went wrong. Try again.'
      );
    });
    expect(router.back).not.toHaveBeenCalled();
  });

  it('navigates back after a successful hide', async () => {
    useLocalSearchParamsMock.mockReturnValue({ id: 'e1', sharedByPersonId: 'mp-9' });

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

  it('shows retry instead of spinning forever when the events fetch throws', async () => {
    mockEventsMaybeSingle.mockRejectedValue(
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
    mockEventsMaybeSingle
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
    mockEventsMaybeSingle.mockRejectedValueOnce(
      new TypeError('NetworkError when attempting to fetch resource.')
    );

    const screen = render(<EventDetailScreen />);
    await screen.findByText('Remove Event');
    expect(screen.getByText('Board Game Night')).toBeTruthy();
  });

  it('shows Share/Edit/Remove immediately from a calendar preview without waiting on fetch', async () => {
    rememberEventPreview({
      event_id: 'e1',
      title: 'Board Game Night',
      description: null,
      image_url: null,
      url: null,
      event_date: '2026-05-10',
      event_time: null,
    });
    let resolveEvents!: (value: { data: typeof eventRow; error: null }) => void;
    mockEventsMaybeSingle.mockReturnValue(
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
    await waitFor(() => expect(mockEventsMaybeSingle).toHaveBeenCalled());
  });

  it('gives up a hung fetch after a few short attempts and shows Retry', async () => {
    jest.useFakeTimers();
    mockEventsMaybeSingle.mockReturnValue(new Promise(() => {}));

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
    mockEventsMaybeSingle.mockReturnValue(
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

  // ===== Who's Coming =====

  const receivedRow = {
    ...eventRow,
    from_event_id: 'e-sender',
    from_user_id: 'u-sender',
  };

  const mockReplyState = (response: 'yes' | 'no' | null, changed = true) => {
    mockRpc.mockImplementation((name: string) => {
      if (name === 'get_my_send_response') {
        return abortablePromise(
          Promise.resolve({ data: [{ response, sharer_name: 'Alice' }], error: null })
        );
      }
      if (name === 'respond_to_send') {
        return abortablePromise(Promise.resolve({ data: changed, error: null }));
      }
      return abortablePromise(Promise.resolve({ data: null, error: null }));
    });
  };

  it('shows the Yes/No reply widget on a received event', async () => {
    mockEventsMaybeSingle.mockResolvedValue({ data: receivedRow, error: null });
    mockReplyState(null);

    const screen = render(<EventDetailScreen />);

    await screen.findByText('Alice asked — are you in?');
    expect(screen.getByLabelText("Yes, I'm in")).toBeTruthy();
    expect(screen.getByLabelText("No, I'm out")).toBeTruthy();
    // Unanswered: no confirmation line yet.
    expect(screen.queryByText('✓ Saved.')).toBeNull();
    expect(mockRpc).toHaveBeenCalledWith('get_my_send_response', { p_event_id: 'e1' });
  });

  it('shows the saved answer as selected state on load, with no prose', async () => {
    mockEventsMaybeSingle.mockResolvedValue({ data: receivedRow, error: null });
    mockReplyState('no');

    const screen = render(<EventDetailScreen />);

    // The answer survives server-side; reopening shows it as the selected
    // button. A fresh visit renders no "Saved." — nothing was just saved.
    await screen.findByText('Alice asked — are you in?');
    await waitFor(() => {
      expect(
        screen.getByLabelText("No, I'm out").props.accessibilityState?.selected
      ).toBe(true);
    });
    expect(screen.queryByText('✓ Saved.')).toBeNull();
  });

  it('shows no reply widget on a self-created event', async () => {
    const screen = render(<EventDetailScreen />);

    await screen.findByText('Board Game Night');
    expect(screen.queryByText('Are you in?')).toBeNull();
    expect(mockRpc).not.toHaveBeenCalledWith(
      'get_my_send_response',
      expect.anything()
    );
  });

  it('shows no reply widget when the send is gone (received row, nothing to answer)', async () => {
    mockEventsMaybeSingle.mockResolvedValue({ data: receivedRow, error: null });
    // Default mockRpc returns zero rows.

    const screen = render(<EventDetailScreen />);

    await screen.findByText('Board Game Night');
    expect(screen.queryByText('Alice asked — are you in?')).toBeNull();
    expect(screen.queryByLabelText("Yes, I'm in")).toBeNull();
  });

  it('answering yes records it and pings the asker when the answer changed', async () => {
    mockEventsMaybeSingle.mockResolvedValue({ data: receivedRow, error: null });
    mockReplyState(null, true);

    const screen = render(<EventDetailScreen />);
    const yesButton = await screen.findByLabelText("Yes, I'm in");

    fireEvent.press(yesButton);

    await waitFor(() => {
      expect(mockRpc).toHaveBeenCalledWith('respond_to_send', {
        p_event_id: 'e1',
        p_response: 'yes',
      });
    });
    await waitFor(() => {
      expect(mockFunctionsInvoke).toHaveBeenCalledWith('send-response-notification', {
        body: { eventId: 'e1' },
      });
    });
    // The save confirmation appears and stays.
    await screen.findByText('✓ Saved.');
  });

  it('does not ping the asker when the server reports the answer unchanged', async () => {
    mockEventsMaybeSingle.mockResolvedValue({ data: receivedRow, error: null });
    mockReplyState(null, false);

    const screen = render(<EventDetailScreen />);
    const yesButton = await screen.findByLabelText("Yes, I'm in");

    fireEvent.press(yesButton);

    await waitFor(() => {
      expect(mockRpc).toHaveBeenCalledWith('respond_to_send', {
        p_event_id: 'e1',
        p_response: 'yes',
      });
    });
    // The confirmation still appears — a saved answer is confirmed even when
    // the server reports it unchanged.
    await screen.findByText('✓ Saved.');
    expect(mockFunctionsInvoke).not.toHaveBeenCalled();
  });

  it('re-tapping the current answer re-confirms (RPC round-trip, no push)', async () => {
    mockEventsMaybeSingle.mockResolvedValue({ data: receivedRow, error: null });
    mockReplyState('yes', false); // same answer server-side → changed=false

    const screen = render(<EventDetailScreen />);
    const yesButton = await screen.findByLabelText("Yes, I'm in");

    fireEvent.press(yesButton);

    // The reassurance probe round-trips: the RPC fires, the confirmation
    // re-asserts, and the asker is never re-pinged for a same-answer write.
    await waitFor(() => {
      expect(mockRpc).toHaveBeenCalledWith('respond_to_send', {
        p_event_id: 'e1',
        p_response: 'yes',
      });
    });
    await screen.findByText('✓ Saved.');
    expect(mockFunctionsInvoke).not.toHaveBeenCalled();
  });

  it('flipping the answer calls the RPC with the new value', async () => {
    mockEventsMaybeSingle.mockResolvedValue({ data: receivedRow, error: null });
    mockReplyState('yes', true);

    const screen = render(<EventDetailScreen />);
    // The stored answer shows as selected state before the flip.
    await screen.findByText('Alice asked — are you in?');
    await waitFor(() => {
      expect(
        screen.getByLabelText("Yes, I'm in").props.accessibilityState?.selected
      ).toBe(true);
    });
    const noButton = await screen.findByLabelText("No, I'm out");

    fireEvent.press(noButton);

    await waitFor(() => {
      expect(mockRpc).toHaveBeenCalledWith('respond_to_send', {
        p_event_id: 'e1',
        p_response: 'no',
      });
    });
    expect(mockFunctionsInvoke).toHaveBeenCalledWith('send-response-notification', {
      body: { eventId: 'e1' },
    });
    // ...and the confirmation and selected state move with it.
    await screen.findByText('✓ Saved.');
    await waitFor(() => {
      expect(
        screen.getByLabelText("No, I'm out").props.accessibilityState?.selected
      ).toBe(true);
    });
  });

  it('shows a short alert when saving the answer fails', async () => {
    mockEventsMaybeSingle.mockResolvedValue({ data: receivedRow, error: null });
    mockRpc.mockImplementation((name: string) => {
      if (name === 'get_my_send_response') {
        return abortablePromise(
          Promise.resolve({ data: [{ response: null, sharer_name: 'Alice' }], error: null })
        );
      }
      if (name === 'respond_to_send') {
        return abortablePromise(
          Promise.resolve({ data: null, error: { message: 'write failed' } })
        );
      }
      return abortablePromise(Promise.resolve({ data: null, error: null }));
    });

    const screen = render(<EventDetailScreen />);
    const yesButton = await screen.findByLabelText("Yes, I'm in");

    fireEvent.press(yesButton);

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        'Could not save',
        'Something went wrong. Try again.'
      );
    });
    expect(mockFunctionsInvoke).not.toHaveBeenCalled();
  });

  it('shows per-person answers in the Shared with list', async () => {
    mockSendsEq.mockImplementation(() =>
      abortablePromise(
        Promise.resolve({
          data: [
            { person_id: 'p1', response: 'yes' },
            { person_id: 'p2', response: null },
          ],
          error: null,
        })
      )
    );
    mockPeopleIn.mockImplementation(() =>
      abortablePromise(
        Promise.resolve({
          data: [
            { id: 'p1', contact_name: 'Alice', phone_number: '+14165550001' },
            { id: 'p2', contact_name: 'Bob', phone_number: '+14165550002' },
          ],
          error: null,
        })
      )
    );

    const screen = render(<EventDetailScreen />);

    await screen.findByText('Shared with');
    expect(screen.getByText('Alice')).toBeTruthy();
    expect(screen.getByText('Bob')).toBeTruthy();
    // Alice answered yes; Bob hasn't said — exactly one status label renders.
    expect(screen.getByText('Yes')).toBeTruthy();
    expect(screen.queryByText('No')).toBeNull();
  });
});
