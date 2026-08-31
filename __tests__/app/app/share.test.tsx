import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { abortable, abortablePromise } from '../../helpers/abortable';
import ShareScreen from '../../../app/(app)/share';

const mockMyPeopleOrder = jest.fn();
const mockMyPeopleEq = jest.fn();
const mockMyPeopleSelect = jest.fn();

const mockCirclesEq = jest.fn();
const mockCirclesSelect = jest.fn();

const mockSendsEq = jest.fn();
const mockSendsSelect = jest.fn();

const mockUsersSingle = jest.fn();
const mockUsersEq = jest.fn();
const mockUsersSelect = jest.fn();
const mockUsersUpdateEq = jest.fn();
const mockUsersUpdate = jest.fn();

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

jest.mock('../../../lib/dialogs', () => ({
  showAlert: jest.fn(),
  showConfirm: jest.fn(),
}));

type FlowProps = { autoStart: boolean; peopleCount: number };
const mockContactsFlow = jest.fn((_props: FlowProps) => null);
jest.mock('../../../components/ContactsPermissionFlow', () => ({
  ContactsPermissionFlow: (props: FlowProps) => mockContactsFlow(props),
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
          testID="mock-share-sheet-select-p3"
          onPress={() => onSelectionChange(new Set(['p3']))}
        >
          <Text>Select only p3</Text>
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
    useLocalSearchParamsMock.mockReturnValue({ eventId: 'e1' });

    mockFunctionsInvoke.mockResolvedValue({ data: null, error: null });
    mockRpc.mockImplementation(() =>
      abortablePromise(Promise.resolve({ data: 2, error: null }))
    );

    mockMyPeopleOrder.mockImplementation(() =>
      abortablePromise(
        Promise.resolve({
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
        })
      )
    );
    mockMyPeopleEq.mockReturnValue({ order: mockMyPeopleOrder });
    mockMyPeopleSelect.mockReturnValue({ eq: mockMyPeopleEq });

    mockCirclesEq.mockImplementation(() =>
      abortablePromise(Promise.resolve({ data: [], error: null }))
    );
    mockCirclesSelect.mockReturnValue({ eq: mockCirclesEq });

    mockSendsEq.mockImplementation(() =>
      abortablePromise(Promise.resolve({ data: [], error: null }))
    );
    mockSendsSelect.mockReturnValue({ eq: mockSendsEq });

    mockUsersSelect.mockReturnValue({ eq: mockUsersEq });
    mockUsersEq.mockReturnValue(abortable({ single: mockUsersSingle }));
    mockUsersSingle.mockResolvedValue({ data: { display_name: 'Test User' }, error: null });
    mockUsersUpdate.mockReturnValue({ eq: mockUsersUpdateEq });
    mockUsersUpdateEq.mockImplementation(() =>
      abortablePromise(Promise.resolve({ error: null }))
    );

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
      if (table === 'sends') {
        return {
          select: mockSendsSelect,
        };
      }
      if (table === 'users') {
        return {
          select: mockUsersSelect,
          update: mockUsersUpdate,
        };
      }
      return {};
    });
  });

  it('auto-starts the contacts flow on native when the people list is empty', async () => {
    mockMyPeopleOrder.mockImplementation(() =>
      abortablePromise(Promise.resolve({ data: [], error: null }))
    );

    render(<ShareScreen />);

    await waitFor(() => expect(mockContactsFlow).toHaveBeenCalled());
    const emptyProps = mockContactsFlow.mock.calls[mockContactsFlow.mock.calls.length - 1][0];
    expect(emptyProps.autoStart).toBe(true);
    expect(emptyProps.peopleCount).toBe(0);
  });

  it('does not auto-start the contacts flow when people already exist', async () => {
    render(<ShareScreen />);

    await waitFor(() => expect(mockContactsFlow).toHaveBeenCalled());
    const populatedProps = mockContactsFlow.mock.calls[mockContactsFlow.mock.calls.length - 1][0];
    expect(populatedProps.autoStart).toBe(false);
    expect(populatedProps.peopleCount).toBe(2);
  });

  it('shares via the share_event RPC, notifies, and confirms without navigating', async () => {
    const screen = render(<ShareScreen />);

    fireEvent.press(screen.getByTestId('mock-share-sheet-select'));
    fireEvent.press(screen.getByText('Share'));

    await waitFor(() => {
      expect(mockRpc).toHaveBeenCalledWith('share_event', {
        p_event_id: 'e1',
        p_person_ids: ['p1', 'p2'],
      });
    });

    expect(mockFunctionsInvoke).toHaveBeenCalledWith('send-notification', {
      body: { eventId: 'e1', personIds: ['p1', 'p2'] },
    });

    // Share Sent Confirmation: the screen stays put, a persistent line
    // echoes the send, the recipients flip to shared, and Cancel becomes
    // Done — leaving is the sender's choice.
    expect(router.back).not.toHaveBeenCalled();
    expect(await screen.findByText('✓ Sent to 2 people')).toBeTruthy();
    await waitFor(() =>
      expect(screen.getByTestId('mock-shared-ids').props.children).toBe('p1,p2')
    );
    expect(screen.queryByText('Cancel')).toBeNull();

    fireEvent.press(screen.getByText('Done'));
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it('does not share or navigate when Share is pressed with no people selected', async () => {
    const screen = render(<ShareScreen />);

    fireEvent.press(screen.getByText('Share'));

    await waitFor(() => expect(mockRpc).not.toHaveBeenCalled());
    expect(router.back).not.toHaveBeenCalled();
  });

  it('never deletes sends (sharing is forwarding, not revocable)', async () => {
    mockSendsEq.mockImplementation(() =>
      abortablePromise(Promise.resolve({ data: [{ person_id: 'p1' }], error: null }))
    );

    const screen = render(<ShareScreen />);
    await waitFor(() =>
      expect(mockSendsEq).toHaveBeenCalledWith('event_id', 'e1')
    );

    // Even after clearing the selection, confirming is blocked and nothing
    // is deleted — existing sends are completed actions.
    fireEvent.press(screen.getByTestId('mock-share-sheet-clear'));
    fireEvent.press(screen.getByText('Share'));

    await waitFor(() => expect(mockRpc).not.toHaveBeenCalled());
    expect(mockFunctionsInvoke).not.toHaveBeenCalled();
    expect(router.back).not.toHaveBeenCalled();
  });

  it('marks already-shared people as completed and excludes them from the RPC', async () => {
    mockSendsEq.mockImplementation(() =>
      abortablePromise(Promise.resolve({ data: [{ person_id: 'p1' }], error: null }))
    );

    const screen = render(<ShareScreen />);
    await waitFor(() =>
      expect(mockSendsEq).toHaveBeenCalledWith('event_id', 'e1')
    );

    expect(screen.getByTestId('mock-shared-ids').props.children).toBe('p1');

    // The sheet would not allow selecting p1; even if it did, the screen
    // filters already-shared people out of the RPC call.
    fireEvent.press(screen.getByTestId('mock-share-sheet-select'));
    fireEvent.press(screen.getByText('Share'));

    await waitFor(() => {
      expect(mockRpc).toHaveBeenCalledWith('share_event', {
        p_event_id: 'e1',
        p_person_ids: ['p2'],
      });
    });
    // KI-003: only the newly shared person is notified — people already on
    // the event must not be re-pinged by an additive share.
    expect(mockFunctionsInvoke).toHaveBeenCalledWith('send-notification', {
      body: { eventId: 'e1', personIds: ['p2'] },
    });
    // No navigation: the confirmation line echoes just this send, and the
    // shared set now covers both people.
    expect(router.back).not.toHaveBeenCalled();
    expect(await screen.findByText('✓ Sent to 1 person')).toBeTruthy();
    await waitFor(() =>
      expect(screen.getByTestId('mock-shared-ids').props.children).toBe('p1,p2')
    );
  });

  it('updates the confirmation count on an additive re-send', async () => {
    mockMyPeopleOrder.mockImplementation(() =>
      abortablePromise(
        Promise.resolve({
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
            {
              id: 'p3',
              owner_id: 'u1',
              phone_number: '+14165550003',
              user_id: null,
              contact_name: 'Carol',
              added_at: '2026-01-03T00:00:00.000Z',
              last_shared_at: null,
            },
          ],
          error: null,
        })
      )
    );

    const screen = render(<ShareScreen />);

    fireEvent.press(screen.getByTestId('mock-share-sheet-select'));
    fireEvent.press(screen.getByText('Share'));
    expect(await screen.findByText('✓ Sent to 2 people')).toBeTruthy();

    fireEvent.press(screen.getByTestId('mock-share-sheet-select-p3'));
    fireEvent.press(screen.getByText('Share'));

    await waitFor(() => {
      expect(mockRpc).toHaveBeenCalledWith('share_event', {
        p_event_id: 'e1',
        p_person_ids: ['p3'],
      });
    });
    // The line echoes the send that just completed; the rows carry the
    // cumulative record.
    expect(await screen.findByText('✓ Sent to 1 person')).toBeTruthy();
    expect(screen.queryByText('✓ Sent to 2 people')).toBeNull();
    expect(router.back).not.toHaveBeenCalled();
  });

  it('shows a short alert, not a stack dump, when the share_event RPC fails', async () => {
    const { showAlert } = require('../../../lib/dialogs');
    mockRpc.mockImplementation(() =>
      abortablePromise(
        Promise.resolve({
          data: null,
          error: { code: '42501', message: 'Not your event' },
        })
      )
    );

    const screen = render(<ShareScreen />);
    fireEvent.press(screen.getByTestId('mock-share-sheet-select'));
    fireEvent.press(screen.getByText('Share'));

    await waitFor(() => {
      expect(showAlert).toHaveBeenCalledWith(
        'Could not share',
        'Something went wrong. Try again.'
      );
    });
    expect(router.back).not.toHaveBeenCalled();
    // A failed send shows no confirmation and keeps the honest Cancel.
    expect(screen.queryByText(/✓ Sent to/)).toBeNull();
    expect(screen.getByText('Cancel')).toBeTruthy();
  });

  describe('no-unshare note', () => {
    it('shows the note before any share when people exist', async () => {
      const screen = render(<ShareScreen />);

      // Default mocks: people exist, nobody shared yet — the explanation
      // must already be on screen before the first send.
      expect(
        await screen.findByText(/Sharing is like sending a text/)
      ).toBeTruthy();
    });

    it('keeps the note when people are already shared', async () => {
      mockSendsEq.mockImplementation(() =>
        abortablePromise(
          Promise.resolve({ data: [{ person_id: 'p1' }], error: null })
        )
      );

      const screen = render(<ShareScreen />);
      await waitFor(() =>
        expect(mockSendsEq).toHaveBeenCalledWith('event_id', 'e1')
      );

      expect(
        screen.getByText(/Sharing is like sending a text/)
      ).toBeTruthy();
    });

    it('omits the note when the people list is empty', async () => {
      mockMyPeopleOrder.mockImplementation(() =>
        abortablePromise(Promise.resolve({ data: [], error: null }))
      );

      const screen = render(<ShareScreen />);
      // The contacts flow auto-starting proves the empty load completed.
      await waitFor(() => expect(mockContactsFlow).toHaveBeenCalled());

      expect(screen.queryByText(/Sharing is like sending a text/)).toBeNull();
    });
  });

  describe('display name gate', () => {
    it('blocks Share until a name is saved, then shares', async () => {
      mockUsersSingle.mockResolvedValue({ data: { display_name: null }, error: null });

      const screen = render(<ShareScreen />);

      await waitFor(() =>
        expect(
          screen.getByText(/Your friends get a text when you share/)
        ).toBeTruthy()
      );

      fireEvent.press(screen.getByTestId('mock-share-sheet-select'));
      fireEvent.press(screen.getByText('Share'));
      expect(mockRpc).not.toHaveBeenCalled();

      fireEvent.changeText(screen.getByLabelText('Your name'), '  Ramsey  ');
      fireEvent.press(screen.getByText('Save'));

      await waitFor(() => {
        expect(mockUsersUpdate).toHaveBeenCalledWith({ display_name: 'Ramsey' });
      });
      expect(mockUsersUpdateEq).toHaveBeenCalledWith('id', 'u1');

      // The gate disappears once the name is saved.
      await waitFor(() =>
        expect(screen.queryByText(/Your friends get a text when you share/)).toBeNull()
      );

      fireEvent.press(screen.getByText('Share'));
      await waitFor(() => {
        expect(mockRpc).toHaveBeenCalledWith('share_event', {
          p_event_id: 'e1',
          p_person_ids: ['p1', 'p2'],
        });
      });
      expect(router.back).not.toHaveBeenCalled();
      expect(await screen.findByText('✓ Sent to 2 people')).toBeTruthy();
    });

    it('keeps Save disabled while the name input is empty', async () => {
      mockUsersSingle.mockResolvedValue({ data: { display_name: null }, error: null });

      const screen = render(<ShareScreen />);
      await waitFor(() => expect(screen.getByLabelText('Your name')).toBeTruthy());

      fireEvent.press(screen.getByText('Save'));
      expect(mockUsersUpdate).not.toHaveBeenCalled();
    });

    it('strips newlines from the name input', async () => {
      mockUsersSingle.mockResolvedValue({ data: { display_name: null }, error: null });

      const screen = render(<ShareScreen />);
      const input = await screen.findByLabelText('Your name');

      fireEvent.changeText(input, 'Bad\nName');
      expect(input.props.value).toBe('BadName');
    });

    it('shows a short alert and keeps the gate when saving the name fails', async () => {
      const { showAlert } = require('../../../lib/dialogs');
      mockUsersSingle.mockResolvedValue({ data: { display_name: null }, error: null });
      mockUsersUpdateEq.mockImplementation(() =>
        abortablePromise(
          Promise.resolve({ error: { code: '23514', message: 'check violation' } })
        )
      );

      const screen = render(<ShareScreen />);
      await waitFor(() => expect(screen.getByLabelText('Your name')).toBeTruthy());

      fireEvent.changeText(screen.getByLabelText('Your name'), 'Ramsey');
      fireEvent.press(screen.getByText('Save'));

      await waitFor(() => {
        expect(showAlert).toHaveBeenCalledWith(
          'Could not save name',
          'Something went wrong. Try again.'
        );
      });
      // Gate still up, Share still blocked.
      expect(screen.getByText(/Your friends get a text when you share/)).toBeTruthy();
      fireEvent.press(screen.getByTestId('mock-share-sheet-select'));
      fireEvent.press(screen.getByText('Share'));
      expect(mockRpc).not.toHaveBeenCalled();
    });

    it('does not gate sharing when the display name fetch fails', async () => {
      mockUsersSingle.mockResolvedValue({ data: null, error: { message: 'boom' } });

      const screen = render(<ShareScreen />);
      await waitFor(() =>
        expect(mockMyPeopleOrder).toHaveBeenCalled()
      );

      expect(screen.queryByText(/Your friends get a text when you share/)).toBeNull();

      fireEvent.press(screen.getByTestId('mock-share-sheet-select'));
      fireEvent.press(screen.getByText('Share'));
      await waitFor(() => expect(mockRpc).toHaveBeenCalled());
    });
  });
});
