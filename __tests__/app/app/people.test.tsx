import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';
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
const mockFrom = jest.fn();
const mockSignOut = jest.fn();

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
    auth: { signOut: (...args: unknown[]) => mockSignOut(...args) },
  },
}));

jest.mock('../../../lib/dialogs', () => ({
  showAlert: jest.fn(),
  showConfirm: jest.fn(),
}));

jest.mock('../../../lib/showError', () => ({
  showError: jest.fn(),
}));

jest.mock('../../../lib/contacts', () => {
  const actual = jest.requireActual('../../../lib/contacts');
  return {
    ...actual,
    getContactsPermissionStatus: jest.fn(async () => false),
    getContactsPermissionDetails: jest.fn(async () => 'denied'),
    requestContactsPermission: jest.fn(async () => false),
  };
});

jest.mock('../../../components/PeoplePicker', () => ({
  PeoplePicker: () => null,
}));

describe('app/(app)/people manual add', () => {
  const originalOS = Platform.OS;

  beforeEach(() => {
    jest.clearAllMocks();

    mockMyPeopleOrder.mockResolvedValue({ data: [], error: null });
    mockMyPeopleEq.mockReturnValue({ order: mockMyPeopleOrder });
    mockMyPeopleSelect.mockReturnValue({ eq: mockMyPeopleEq });

    mockCirclesEq.mockResolvedValue({ data: [], error: null });
    mockCirclesSelect.mockReturnValue({ eq: mockCirclesEq });

    mockHiddenEq.mockResolvedValue({ data: [], error: null });
    mockHiddenSelect.mockReturnValue({ eq: mockHiddenEq });

    mockMyPeopleUpsert.mockResolvedValue({ data: null, error: null });
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

    mockMyPeopleOrder.mockResolvedValue({ data: [], error: null });
    mockMyPeopleEq.mockReturnValue({ order: mockMyPeopleOrder });
    mockMyPeopleSelect.mockReturnValue({ eq: mockMyPeopleEq });

    mockCirclesEq.mockResolvedValue({ data: [], error: null });
    mockCirclesSelect.mockReturnValue({ eq: mockCirclesEq });

    mockHiddenEq.mockResolvedValue({ data: [], error: null });
    mockHiddenSelect.mockReturnValue({ eq: mockHiddenEq });

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

    mockMyPeopleOrder.mockResolvedValue({ data: [], error: null });
    mockMyPeopleEq.mockReturnValue({ order: mockMyPeopleOrder });
    mockMyPeopleSelect.mockReturnValue({ eq: mockMyPeopleEq });

    mockCirclesEq.mockResolvedValue({ data: [], error: null });
    mockCirclesSelect.mockReturnValue({ eq: mockCirclesEq });

    mockHiddenEq.mockResolvedValue({ data: [], error: null });
    mockHiddenSelect.mockReturnValue({ eq: mockHiddenEq });

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
      throw new Error(`Unexpected table ${table}`);
    });
  });

  afterEach(() => {
    Platform.OS = originalOS;
  });

  it('asks for confirmation with the account phone number before signing out', async () => {
    Platform.OS = 'web';
    const { getByText } = render(<PeopleScreen />);

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
    const { getByText } = render(<PeopleScreen />);

    await waitFor(() => expect(getByText('Sign out')).toBeTruthy());
    fireEvent.press(getByText('Sign out'));

    const [, , options] = (showConfirm as jest.Mock).mock.calls[0];
    await options.onConfirm();

    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });
});
