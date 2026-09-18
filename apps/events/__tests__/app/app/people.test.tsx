import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Modal, Platform } from 'react-native';
import { abortable, abortablePromise } from '../../helpers/abortable';
import PeopleScreen from '../../../app/(app)/people';
import { showAlert, showConfirm } from '../../../lib/dialogs';

const mockMyPeopleOrder = jest.fn();
const mockMyPeopleEq = jest.fn();
const mockMyPeopleSelect = jest.fn();
const mockMyPeopleUpsert = jest.fn();
const mockCirclesEq = jest.fn();
const mockCirclesSelect = jest.fn();
const mockHiddenEq = jest.fn();
const mockHiddenSelect = jest.fn();
const mockUsersSingle = jest.fn();
const mockUsersEq = jest.fn();
const mockUsersSelect = jest.fn();
const mockUsersUpdateEq = jest.fn();
const mockUsersUpdate = jest.fn();
const mockFrom = jest.fn();
const mockSignOut = jest.fn();
const mockRpc = jest.fn();

jest.mock('../../../app/_context/SessionContext', () => ({
  useSession: () => ({
    session: {
      user: { id: 'u1', phone: '+14165551234' },
    },
  }),
}));

jest.mock('../../../lib/supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
    auth: { signOut: (...args: unknown[]) => mockSignOut(...args) },
  },
}));

jest.mock('../../../lib/dialogs', () => ({
  showAlert: jest.fn(),
  showConfirm: jest.fn(),
}));

jest.mock('../../../lib/contacts', () => {
  const actual = jest.requireActual('../../../lib/contacts');
  return {
    ...actual,
    getContactsPermissionStatus: jest.fn(async () => false),
    getContactsPermission: jest.fn(async () => ({
      status: 'denied',
      canAskAgain: false,
    })),
    requestContactsPermission: jest.fn(async () => false),
  };
});

jest.mock('../../../components/PeoplePicker', () => ({
  PeoplePicker: () => null,
}));

jest.mock('../../../components/ContactsPermissionFlow', () => ({
  ContactsPermissionFlow: () => null,
}));

describe('app/(app)/people manual add', () => {
  const originalOS = Platform.OS;

  beforeEach(() => {
    jest.clearAllMocks();

    mockMyPeopleOrder.mockImplementation(() =>
      abortablePromise(Promise.resolve({ data: [], error: null }))
    );
    mockMyPeopleEq.mockReturnValue({ order: mockMyPeopleOrder });
    mockMyPeopleSelect.mockReturnValue({ eq: mockMyPeopleEq });

    mockCirclesEq.mockImplementation(() =>
      abortablePromise(Promise.resolve({ data: [], error: null }))
    );
    mockCirclesSelect.mockReturnValue({ eq: mockCirclesEq });

    mockHiddenEq.mockImplementation(() =>
      abortablePromise(Promise.resolve({ data: [], error: null }))
    );
    mockHiddenSelect.mockReturnValue({ eq: mockHiddenEq });

    mockUsersSelect.mockReturnValue({ eq: mockUsersEq });
    mockUsersEq.mockReturnValue(abortable({ single: mockUsersSingle }));
    mockUsersSingle.mockResolvedValue({ data: { display_name: 'Test User' }, error: null });
    mockUsersUpdate.mockReturnValue({ eq: mockUsersUpdateEq });
    mockUsersUpdateEq.mockImplementation(() =>
      abortablePromise(Promise.resolve({ error: null }))
    );

    mockMyPeopleUpsert.mockImplementation(() =>
      abortablePromise(Promise.resolve({ data: null, error: null }))
    );
    mockSignOut.mockResolvedValue({ error: null });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'my_people') {
        return { select: mockMyPeopleSelect, upsert: mockMyPeopleUpsert };
      }
      if (table === 'circles') {
        return { select: mockCirclesSelect };
      }
      if (table === 'hidden_people') {
        return { select: mockHiddenSelect };
      }
      if (table === 'users') {
        return { select: mockUsersSelect, update: mockUsersUpdate };
      }
      throw new Error(`Unexpected table ${table}`);
    });
  });

  afterEach(() => {
    Platform.OS = originalOS;
  });

  it('opens the manual add form directly on web and normalizes the number to E.164', async () => {
    Platform.OS = 'web';
    const { getByText, getByPlaceholderText } = render(<PeopleScreen />);

    await waitFor(() => expect(getByText('Add Manually')).toBeTruthy());
    fireEvent.press(getByText('Add Manually'));

    fireEvent.changeText(getByPlaceholderText('Name'), 'Alice');
    fireEvent.changeText(getByPlaceholderText('+1 416 555 1234'), '(416) 555-1234');
    fireEvent.press(getByText('Save'));

    await waitFor(() => expect(mockMyPeopleUpsert).toHaveBeenCalledTimes(1));
    expect(mockMyPeopleUpsert).toHaveBeenCalledWith(
      [{ owner_id: 'u1', phone_number: '+14165551234', contact_name: 'Alice' }],
      { onConflict: 'owner_id,phone_number' }
    );
  });

  it('rejects an invalid phone number with an alert and does not upsert', async () => {
    Platform.OS = 'web';
    const { getByText, getByPlaceholderText } = render(<PeopleScreen />);

    await waitFor(() => expect(getByText('Add Manually')).toBeTruthy());
    fireEvent.press(getByText('Add Manually'));

    fireEvent.changeText(getByPlaceholderText('+1 416 555 1234'), 'not-a-number');
    fireEvent.press(getByText('Save'));

    await waitFor(() => expect(showAlert).toHaveBeenCalledTimes(1));
    expect((showAlert as jest.Mock).mock.calls[0][0]).toBe('Invalid phone number');
    expect(mockMyPeopleUpsert).not.toHaveBeenCalled();
  });

  it('stores a null contact_name when the name is left blank', async () => {
    Platform.OS = 'web';
    const { getByText, getByPlaceholderText } = render(<PeopleScreen />);

    await waitFor(() => expect(getByText('Add Manually')).toBeTruthy());
    fireEvent.press(getByText('Add Manually'));

    fireEvent.changeText(getByPlaceholderText('+1 416 555 1234'), '+1 647 555 9999');
    fireEvent.press(getByText('Save'));

    await waitFor(() => expect(mockMyPeopleUpsert).toHaveBeenCalledTimes(1));
    expect(mockMyPeopleUpsert).toHaveBeenCalledWith(
      [{ owner_id: 'u1', phone_number: '+16475559999', contact_name: null }],
      { onConflict: 'owner_id,phone_number' }
    );
  });
});

describe('app/(app)/people empty state', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockMyPeopleOrder.mockImplementation(() =>
      abortablePromise(Promise.resolve({ data: [], error: null }))
    );
    mockMyPeopleEq.mockReturnValue({ order: mockMyPeopleOrder });
    mockMyPeopleSelect.mockReturnValue({ eq: mockMyPeopleEq });

    mockCirclesEq.mockImplementation(() =>
      abortablePromise(Promise.resolve({ data: [], error: null }))
    );
    mockCirclesSelect.mockReturnValue({ eq: mockCirclesEq });

    mockHiddenEq.mockImplementation(() =>
      abortablePromise(Promise.resolve({ data: [], error: null }))
    );
    mockHiddenSelect.mockReturnValue({ eq: mockHiddenEq });

    mockUsersSelect.mockReturnValue({ eq: mockUsersEq });
    mockUsersEq.mockReturnValue(abortable({ single: mockUsersSingle }));
    mockUsersSingle.mockResolvedValue({ data: { display_name: 'Test User' }, error: null });
    mockUsersUpdate.mockReturnValue({ eq: mockUsersUpdateEq });
    mockUsersUpdateEq.mockImplementation(() =>
      abortablePromise(Promise.resolve({ error: null }))
    );

    mockFrom.mockImplementation((table: string) => {
      if (table === 'my_people') {
        return { select: mockMyPeopleSelect, upsert: mockMyPeopleUpsert };
      }
      if (table === 'circles') {
        return { select: mockCirclesSelect };
      }
      if (table === 'hidden_people') {
        return { select: mockHiddenSelect };
      }
      if (table === 'users') {
        return { select: mockUsersSelect, update: mockUsersUpdate };
      }
      throw new Error(`Unexpected table ${table}`);
    });
  });

  it('renders a themeable vector icon instead of an emoji', async () => {
    const { getByTestId, getByText, queryByText } = render(<PeopleScreen />);

    await waitFor(() => expect(getByText('No people yet')).toBeTruthy());
    // The icon is decorative, so the wrapper is hidden from accessibility —
    // includeHiddenElements is required to find it (and proves the hiding).
    expect(getByTestId('people-empty-icon', { includeHiddenElements: true })).toBeTruthy();
    expect(queryByText('👥')).toBeNull();
  });
});

describe('app/(app)/people sign out', () => {
  const originalOS = Platform.OS;

  beforeEach(() => {
    jest.clearAllMocks();

    mockMyPeopleOrder.mockImplementation(() =>
      abortablePromise(Promise.resolve({ data: [], error: null }))
    );
    mockMyPeopleEq.mockReturnValue({ order: mockMyPeopleOrder });
    mockMyPeopleSelect.mockReturnValue({ eq: mockMyPeopleEq });

    mockCirclesEq.mockImplementation(() =>
      abortablePromise(Promise.resolve({ data: [], error: null }))
    );
    mockCirclesSelect.mockReturnValue({ eq: mockCirclesEq });

    mockHiddenEq.mockImplementation(() =>
      abortablePromise(Promise.resolve({ data: [], error: null }))
    );
    mockHiddenSelect.mockReturnValue({ eq: mockHiddenEq });

    mockUsersSelect.mockReturnValue({ eq: mockUsersEq });
    mockUsersEq.mockReturnValue(abortable({ single: mockUsersSingle }));
    mockUsersSingle.mockResolvedValue({ data: { display_name: 'Test User' }, error: null });
    mockUsersUpdate.mockReturnValue({ eq: mockUsersUpdateEq });
    mockUsersUpdateEq.mockImplementation(() =>
      abortablePromise(Promise.resolve({ error: null }))
    );

    mockSignOut.mockResolvedValue({ error: null });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'my_people') {
        return { select: mockMyPeopleSelect, upsert: mockMyPeopleUpsert };
      }
      if (table === 'circles') {
        return { select: mockCirclesSelect };
      }
      if (table === 'hidden_people') {
        return { select: mockHiddenSelect };
      }
      if (table === 'users') {
        return { select: mockUsersSelect, update: mockUsersUpdate };
      }
      throw new Error(`Unexpected table ${table}`);
    });
  });

  afterEach(() => {
    Platform.OS = originalOS;
  });

  it('asks for confirmation with the account phone number before signing out', async () => {
    Platform.OS = 'web';
    const { getByText, getByLabelText, queryByText } = render(<PeopleScreen />);

    // The footer is gone — account actions live in the Settings sheet.
    await waitFor(() => expect(getByLabelText('Settings')).toBeTruthy());
    expect(queryByText('Sign out')).toBeNull();
    fireEvent.press(getByLabelText('Settings'));

    await waitFor(() => expect(getByText('Sign out')).toBeTruthy());
    fireEvent.press(getByText('Sign out'));

    expect(showConfirm).toHaveBeenCalledTimes(1);
    const [title, message] = (showConfirm as jest.Mock).mock.calls[0];
    expect(title).toBe('Sign out');
    expect(message).toContain('(416) 555-1234');
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it('calls supabase signOut when the confirmation is accepted', async () => {
    Platform.OS = 'web';
    const { getByText, getByLabelText } = render(<PeopleScreen />);

    await waitFor(() => expect(getByLabelText('Settings')).toBeTruthy());
    fireEvent.press(getByLabelText('Settings'));

    await waitFor(() => expect(getByText('Sign out')).toBeTruthy());
    fireEvent.press(getByText('Sign out'));

    const [, , options] = (showConfirm as jest.Mock).mock.calls[0];
    await options.onConfirm();

    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });
});

describe('app/(app)/people delete account', () => {
  const originalOS = Platform.OS;

  beforeEach(() => {
    jest.clearAllMocks();

    mockMyPeopleOrder.mockImplementation(() =>
      abortablePromise(Promise.resolve({ data: [], error: null }))
    );
    mockMyPeopleEq.mockReturnValue({ order: mockMyPeopleOrder });
    mockMyPeopleSelect.mockReturnValue({ eq: mockMyPeopleEq });

    mockCirclesEq.mockImplementation(() =>
      abortablePromise(Promise.resolve({ data: [], error: null }))
    );
    mockCirclesSelect.mockReturnValue({ eq: mockCirclesEq });

    mockHiddenEq.mockImplementation(() =>
      abortablePromise(Promise.resolve({ data: [], error: null }))
    );
    mockHiddenSelect.mockReturnValue({ eq: mockHiddenEq });

    mockUsersSelect.mockReturnValue({ eq: mockUsersEq });
    mockUsersEq.mockReturnValue(abortable({ single: mockUsersSingle }));
    mockUsersSingle.mockResolvedValue({ data: { display_name: 'Test User' }, error: null });
    mockUsersUpdate.mockReturnValue({ eq: mockUsersUpdateEq });
    mockUsersUpdateEq.mockImplementation(() =>
      abortablePromise(Promise.resolve({ error: null }))
    );

    mockRpc.mockImplementation(() =>
      abortablePromise(Promise.resolve({ data: null, error: null }))
    );
    mockSignOut.mockResolvedValue({ error: null });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'my_people') {
        return { select: mockMyPeopleSelect, upsert: mockMyPeopleUpsert };
      }
      if (table === 'circles') {
        return { select: mockCirclesSelect };
      }
      if (table === 'hidden_people') {
        return { select: mockHiddenSelect };
      }
      if (table === 'users') {
        return { select: mockUsersSelect, update: mockUsersUpdate };
      }
      throw new Error(`Unexpected table ${table}`);
    });
  });

  afterEach(() => {
    Platform.OS = originalOS;
  });

  it('asks for confirmation with honest copy before deleting', async () => {
    Platform.OS = 'web';
    const { getByText, getByLabelText } = render(<PeopleScreen />);

    await waitFor(() => expect(getByLabelText('Settings')).toBeTruthy());
    fireEvent.press(getByLabelText('Settings'));

    await waitFor(() => expect(getByText('Delete account')).toBeTruthy());
    fireEvent.press(getByText('Delete account'));

    expect(showConfirm).toHaveBeenCalledTimes(1);
    const [title, message, options] = (showConfirm as jest.Mock).mock.calls[0];
    expect(title).toBe('Delete account');
    expect(message).toContain('deletes your calendar, your people, and your sign-in');
    expect(message).toContain('stay on the calendars of the people you sent them to');
    expect(options.destructive).toBe(true);
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it('calls delete_my_account then signs out when the confirmation is accepted', async () => {
    Platform.OS = 'web';
    const { getByText, getByLabelText } = render(<PeopleScreen />);

    await waitFor(() => expect(getByLabelText('Settings')).toBeTruthy());
    fireEvent.press(getByLabelText('Settings'));

    await waitFor(() => expect(getByText('Delete account')).toBeTruthy());
    fireEvent.press(getByText('Delete account'));

    const [, , options] = (showConfirm as jest.Mock).mock.calls[0];
    await options.onConfirm();

    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith('delete_my_account');
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });

  it('surfaces an RPC failure as a short alert and keeps the session', async () => {
    Platform.OS = 'web';
    mockRpc.mockImplementation(() =>
      abortablePromise(Promise.resolve({ data: null, error: { message: 'boom' } }))
    );
    const { getByText, getByLabelText } = render(<PeopleScreen />);

    await waitFor(() => expect(getByLabelText('Settings')).toBeTruthy());
    fireEvent.press(getByLabelText('Settings'));

    await waitFor(() => expect(getByText('Delete account')).toBeTruthy());
    fireEvent.press(getByText('Delete account'));

    const [, , options] = (showConfirm as jest.Mock).mock.calls[0];
    await options.onConfirm();

    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(showAlert).toHaveBeenCalledWith(
      'Could not delete account',
      'Something went wrong. Try again.'
    );
    expect(mockSignOut).not.toHaveBeenCalled();
  });
});

describe('app/(app)/people display name', () => {
  const originalOS = Platform.OS;

  beforeEach(() => {
    jest.clearAllMocks();

    mockMyPeopleOrder.mockImplementation(() =>
      abortablePromise(Promise.resolve({ data: [], error: null }))
    );
    mockMyPeopleEq.mockReturnValue({ order: mockMyPeopleOrder });
    mockMyPeopleSelect.mockReturnValue({ eq: mockMyPeopleEq });

    mockCirclesEq.mockImplementation(() =>
      abortablePromise(Promise.resolve({ data: [], error: null }))
    );
    mockCirclesSelect.mockReturnValue({ eq: mockCirclesEq });

    mockHiddenEq.mockImplementation(() =>
      abortablePromise(Promise.resolve({ data: [], error: null }))
    );
    mockHiddenSelect.mockReturnValue({ eq: mockHiddenEq });

    mockUsersSelect.mockReturnValue({ eq: mockUsersEq });
    mockUsersEq.mockReturnValue(abortable({ single: mockUsersSingle }));
    mockUsersSingle.mockResolvedValue({ data: { display_name: 'Test User' }, error: null });
    mockUsersUpdate.mockReturnValue({ eq: mockUsersUpdateEq });
    mockUsersUpdateEq.mockImplementation(() =>
      abortablePromise(Promise.resolve({ error: null }))
    );

    mockFrom.mockImplementation((table: string) => {
      if (table === 'my_people') {
        return { select: mockMyPeopleSelect, upsert: mockMyPeopleUpsert };
      }
      if (table === 'circles') {
        return { select: mockCirclesSelect };
      }
      if (table === 'hidden_people') {
        return { select: mockHiddenSelect };
      }
      if (table === 'users') {
        return { select: mockUsersSelect, update: mockUsersUpdate };
      }
      throw new Error(`Unexpected table ${table}`);
    });
  });

  afterEach(() => {
    Platform.OS = originalOS;
  });

  it('shows the current name in the Settings sheet and edits it via the modal', async () => {
    const { getByText, getByLabelText, findByLabelText, queryByLabelText } = render(<PeopleScreen />);

    fireEvent.press(getByLabelText('Settings'));
    await waitFor(() => expect(getByText('Your name: Test User')).toBeTruthy());
    fireEvent.press(getByText('Your name: Test User'));

    // The editor opens after the sheet closes (no stacked modals).
    const input = await findByLabelText('Your name');
    expect(input.props.value).toBe('Test User');

    fireEvent.changeText(input, 'Ramsey');
    fireEvent.press(getByText('Save'));

    await waitFor(() => {
      expect(mockUsersUpdate).toHaveBeenCalledWith({ display_name: 'Ramsey' });
    });
    expect(mockUsersUpdateEq).toHaveBeenCalledWith('id', 'u1');

    // Modal closed; the sheet row reflects the new name on the next open.
    await waitFor(() => expect(queryByLabelText('Your name')).toBeNull());
    fireEvent.press(getByLabelText('Settings'));
    await waitFor(() => expect(getByText('Your name: Ramsey')).toBeTruthy());
  });

  it('shows Not set and keeps Save disabled while the field is empty', async () => {
    mockUsersSingle.mockResolvedValue({ data: { display_name: null }, error: null });
    const { getByText, getByLabelText, findByLabelText } = render(<PeopleScreen />);

    fireEvent.press(getByLabelText('Settings'));
    await waitFor(() => expect(getByText('Your name: Not set')).toBeTruthy());
    fireEvent.press(getByText('Your name: Not set'));

    const input = await findByLabelText('Your name');
    expect(input.props.value).toBe('');

    // Names are never removable: an empty (or whitespace-only) field cannot save.
    fireEvent.press(getByText('Save'));
    fireEvent.changeText(input, '   ');
    fireEvent.press(getByText('Save'));
    expect(mockUsersUpdate).not.toHaveBeenCalled();
  });

  it('surfaces a save failure as a short alert and keeps the modal open', async () => {
    mockUsersUpdateEq.mockImplementation(() =>
      abortablePromise(
        Promise.resolve({ error: { code: '23514', message: 'check violation' } })
      )
    );
    const { getByText, getByLabelText, findByLabelText } = render(<PeopleScreen />);

    fireEvent.press(getByLabelText('Settings'));
    await waitFor(() => expect(getByText('Your name: Test User')).toBeTruthy());
    fireEvent.press(getByText('Your name: Test User'));

    const input = await findByLabelText('Your name');
    fireEvent.changeText(input, 'Ramsey');
    fireEvent.press(getByText('Save'));

    await waitFor(() => {
      expect(showAlert).toHaveBeenCalledWith(
        'Could not save name',
        'Something went wrong. Try again.'
      );
    });
    expect(getByLabelText('Your name')).toBeTruthy();
  });
});

describe('app/(app)/people notification toggles', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockMyPeopleOrder.mockImplementation(() =>
      abortablePromise(Promise.resolve({ data: [], error: null }))
    );
    mockMyPeopleEq.mockReturnValue({ order: mockMyPeopleOrder });
    mockMyPeopleSelect.mockReturnValue({ eq: mockMyPeopleEq });

    mockCirclesEq.mockImplementation(() =>
      abortablePromise(Promise.resolve({ data: [], error: null }))
    );
    mockCirclesSelect.mockReturnValue({ eq: mockCirclesEq });

    mockHiddenEq.mockImplementation(() =>
      abortablePromise(Promise.resolve({ data: [], error: null }))
    );
    mockHiddenSelect.mockReturnValue({ eq: mockHiddenEq });

    mockUsersSelect.mockReturnValue({ eq: mockUsersEq });
    mockUsersEq.mockReturnValue(abortable({ single: mockUsersSingle }));
    mockUsersSingle.mockResolvedValue({
      data: { display_name: 'Test User', notify_push: true, notify_sms: false },
      error: null,
    });
    mockUsersUpdate.mockReturnValue({ eq: mockUsersUpdateEq });
    mockUsersUpdateEq.mockImplementation(() =>
      abortablePromise(Promise.resolve({ error: null }))
    );

    mockFrom.mockImplementation((table: string) => {
      if (table === 'my_people') {
        return { select: mockMyPeopleSelect, upsert: mockMyPeopleUpsert };
      }
      if (table === 'circles') {
        return { select: mockCirclesSelect };
      }
      if (table === 'hidden_people') {
        return { select: mockHiddenSelect };
      }
      if (table === 'users') {
        return { select: mockUsersSelect, update: mockUsersUpdate };
      }
      throw new Error(`Unexpected table ${table}`);
    });
  });

  // KI-008: each notifications row is one switch control (role=switch, the
  // whole row is the target); the visual switch inside is inert. State reads
  // as accessibilityState.checked; a press toggles.
  it('renders both toggles with the loaded values', async () => {
    const { getByLabelText } = render(<PeopleScreen />);

    fireEvent.press(getByLabelText('Settings'));
    await waitFor(() =>
      expect(getByLabelText('Text messages (SMS)').props.accessibilityState.checked).toBe(false)
    );
    expect(getByLabelText('Push notifications').props.accessibilityState.checked).toBe(true);
  });

  it('flipping a toggle writes the pref scoped to the caller', async () => {
    const { getByLabelText } = render(<PeopleScreen />);

    fireEvent.press(getByLabelText('Settings'));
    await waitFor(() =>
      expect(getByLabelText('Text messages (SMS)').props.accessibilityState.checked).toBe(false)
    );
    fireEvent.press(getByLabelText('Text messages (SMS)'));

    await waitFor(() => {
      expect(mockUsersUpdate).toHaveBeenCalledWith({ notify_sms: true });
    });
    expect(mockUsersUpdateEq).toHaveBeenCalledWith('id', 'u1');
    expect(getByLabelText('Text messages (SMS)').props.accessibilityState.checked).toBe(true);
  });

  it('a failed write reverts the switch and shows a short alert', async () => {
    mockUsersUpdateEq.mockImplementation(() =>
      abortablePromise(Promise.resolve({ error: { message: 'boom' } }))
    );
    const { getByLabelText } = render(<PeopleScreen />);

    fireEvent.press(getByLabelText('Settings'));
    await waitFor(() =>
      expect(getByLabelText('Push notifications').props.accessibilityState.checked).toBe(true)
    );
    fireEvent.press(getByLabelText('Push notifications'));

    await waitFor(() => {
      expect(showAlert).toHaveBeenCalledWith(
        'Could not update notification setting',
        'Something went wrong. Try again.'
      );
    });
    expect(getByLabelText('Push notifications').props.accessibilityState.checked).toBe(true);
  });

  it('a failed prefs read keeps the defaults instead of failing the load', async () => {
    mockUsersSingle.mockResolvedValue({ data: null, error: { message: 'boom' } });
    const { getByText, getByLabelText } = render(<PeopleScreen />);

    await waitFor(() => expect(getByText('No people yet')).toBeTruthy());
    fireEvent.press(getByLabelText('Settings'));
    expect(getByLabelText('Push notifications').props.accessibilityState.checked).toBe(true);
    expect(getByLabelText('Text messages (SMS)').props.accessibilityState.checked).toBe(true);
  });
});

describe('app/(app)/people sheets dismiss via onRequestClose', () => {
  // Android hardware Back and iOS pageSheet swipe-down attempts reach a sheet
  // only through Modal's onRequestClose (KI-009/KI-012).
  const originalOS = Platform.OS;

  const mockCircleMembersIn = jest.fn();
  const mockCircleMembersSelect = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();

    mockMyPeopleOrder.mockImplementation(() =>
      abortablePromise(Promise.resolve({ data: [], error: null }))
    );
    mockMyPeopleEq.mockReturnValue({ order: mockMyPeopleOrder });
    mockMyPeopleSelect.mockReturnValue({ eq: mockMyPeopleEq });

    mockCirclesEq.mockImplementation(() =>
      abortablePromise(Promise.resolve({ data: [], error: null }))
    );
    mockCirclesSelect.mockReturnValue({ eq: mockCirclesEq });

    mockHiddenEq.mockImplementation(() =>
      abortablePromise(Promise.resolve({ data: [], error: null }))
    );
    mockHiddenSelect.mockReturnValue({ eq: mockHiddenEq });

    mockCircleMembersSelect.mockReturnValue({ in: mockCircleMembersIn });
    mockCircleMembersIn.mockImplementation(() =>
      abortablePromise(Promise.resolve({ data: [], error: null }))
    );

    mockUsersSelect.mockReturnValue({ eq: mockUsersEq });
    mockUsersEq.mockReturnValue(abortable({ single: mockUsersSingle }));
    mockUsersSingle.mockResolvedValue({ data: { display_name: 'Test User' }, error: null });
    mockUsersUpdate.mockReturnValue({ eq: mockUsersUpdateEq });
    mockUsersUpdateEq.mockImplementation(() =>
      abortablePromise(Promise.resolve({ error: null }))
    );

    mockFrom.mockImplementation((table: string) => {
      if (table === 'my_people') {
        return { select: mockMyPeopleSelect, upsert: mockMyPeopleUpsert };
      }
      if (table === 'circles') {
        return { select: mockCirclesSelect };
      }
      if (table === 'circle_members') {
        return { select: mockCircleMembersSelect };
      }
      if (table === 'hidden_people') {
        return { select: mockHiddenSelect };
      }
      if (table === 'users') {
        return { select: mockUsersSelect, update: mockUsersUpdate };
      }
      throw new Error(`Unexpected table ${table}`);
    });
  });

  afterEach(() => {
    Platform.OS = originalOS;
  });

  const requestClose = (screen: ReturnType<typeof render>) => {
    const open = screen
      .UNSAFE_getAllByType(Modal)
      .filter((modal) => modal.props.visible);
    expect(open).toHaveLength(1);
    expect(typeof open[0].props.onRequestClose).toBe('function');
    act(() => open[0].props.onRequestClose());
  };

  it('Settings sheet: Back closes it like Close', async () => {
    const screen = render(<PeopleScreen />);

    await waitFor(() => expect(screen.getByLabelText('Settings')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('Settings'));
    expect(screen.getByLabelText('Push notifications')).toBeTruthy();

    requestClose(screen);

    expect(screen.queryByLabelText('Push notifications')).toBeNull();
  });

  it('Your name sheet: Back closes it like Cancel', async () => {
    const screen = render(<PeopleScreen />);

    await waitFor(() => expect(screen.getByLabelText('Settings')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('Settings'));
    await waitFor(() => expect(screen.getByText('Your name: Test User')).toBeTruthy());
    fireEvent.press(screen.getByText('Your name: Test User'));

    // The editor opens after the Settings sheet closes (no stacked modals).
    await screen.findByLabelText('Your name');

    requestClose(screen);

    expect(screen.queryByLabelText('Your name')).toBeNull();
  });

  it('circle editor: Back closes it like Cancel', async () => {
    mockMyPeopleOrder.mockImplementation(() =>
      abortablePromise(
        Promise.resolve({
          data: [
            { id: 'p1', owner_id: 'u1', phone_number: '+14165550001', contact_name: 'Alice' },
          ],
          error: null,
        })
      )
    );
    mockCirclesEq.mockImplementation(() =>
      abortablePromise(
        Promise.resolve({
          data: [{ id: 'c1', owner_id: 'u1', name: 'Family' }],
          error: null,
        })
      )
    );
    const screen = render(<PeopleScreen />);

    await waitFor(() => expect(screen.getByText('Edit')).toBeTruthy());
    fireEvent.press(screen.getByText('Edit'));
    expect(screen.getByText('Cancel')).toBeTruthy();

    requestClose(screen);

    expect(screen.queryByText('Cancel')).toBeNull();
  });
});

describe('app/(app)/people settings sheet hidden people', () => {
  const mockHiddenDeleteEq = jest.fn();
  const mockHiddenDelete = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();

    mockMyPeopleOrder.mockImplementation(() =>
      abortablePromise(Promise.resolve({ data: [], error: null }))
    );
    mockMyPeopleEq.mockReturnValue({ order: mockMyPeopleOrder });
    mockMyPeopleSelect.mockReturnValue({ eq: mockMyPeopleEq });

    mockCirclesEq.mockImplementation(() =>
      abortablePromise(Promise.resolve({ data: [], error: null }))
    );
    mockCirclesSelect.mockReturnValue({ eq: mockCirclesEq });

    mockHiddenEq.mockImplementation(() =>
      abortablePromise(Promise.resolve({ data: [], error: null }))
    );
    mockHiddenSelect.mockReturnValue({ eq: mockHiddenEq });
    mockHiddenDeleteEq.mockImplementation(() =>
      abortablePromise(Promise.resolve({ error: null }))
    );
    mockHiddenDelete.mockReturnValue({ eq: mockHiddenDeleteEq });

    mockUsersSelect.mockReturnValue({ eq: mockUsersEq });
    mockUsersEq.mockReturnValue(abortable({ single: mockUsersSingle }));
    mockUsersSingle.mockResolvedValue({ data: { display_name: 'Test User' }, error: null });
    mockUsersUpdate.mockReturnValue({ eq: mockUsersUpdateEq });
    mockUsersUpdateEq.mockImplementation(() =>
      abortablePromise(Promise.resolve({ error: null }))
    );

    mockFrom.mockImplementation((table: string) => {
      if (table === 'my_people') {
        return { select: mockMyPeopleSelect, upsert: mockMyPeopleUpsert };
      }
      if (table === 'circles') {
        return { select: mockCirclesSelect };
      }
      if (table === 'hidden_people') {
        return { select: mockHiddenSelect, delete: mockHiddenDelete };
      }
      if (table === 'users') {
        return { select: mockUsersSelect, update: mockUsersUpdate };
      }
      throw new Error(`Unexpected table ${table}`);
    });
  });

  it('always shows the Hidden section, with a quiet empty state when none', async () => {
    const screen = render(<PeopleScreen />);

    fireEvent.press(screen.getByLabelText('Settings'));

    await screen.findByText('Hidden');
    expect(screen.getByText('No hidden people')).toBeTruthy();
  });

  it('lists hidden people with a count and unhides from the sheet', async () => {
    mockHiddenEq.mockImplementation(() =>
      abortablePromise(
        Promise.resolve({
          data: [
            {
              id: 'h1',
              owner_id: 'u1',
              person_id: 'p1',
              hidden_at: '2026-01-01T00:00:00.000Z',
              my_people: { contact_name: 'Alice', phone_number: '+14165550001' },
            },
            {
              id: 'h2',
              owner_id: 'u1',
              person_id: 'p2',
              hidden_at: '2026-01-01T00:00:00.000Z',
              my_people: { contact_name: null, phone_number: '+14165550002' },
            },
          ],
          error: null,
        })
      )
    );
    const screen = render(<PeopleScreen />);

    fireEvent.press(screen.getByLabelText('Settings'));

    await screen.findByText('Hidden (2)');
    expect(screen.getByText('Alice')).toBeTruthy();
    // No contact name falls back to the formatted phone number.
    expect(screen.getByText('(416) 555-0002')).toBeTruthy();

    fireEvent.press(screen.getAllByText('Unhide')[0]);
    await waitFor(() => expect(mockHiddenDeleteEq).toHaveBeenCalledWith('id', 'h1'));
  });
});
