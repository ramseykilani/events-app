import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { AppState, Linking, Platform } from 'react-native';
import { ContactsPermissionFlow } from '../../components/ContactsPermissionFlow';
import {
  getContactsPermission,
  requestContactsPermission,
} from '../../lib/contacts';
import { showAlert } from '../../lib/dialogs';
import { abortablePromise } from '../helpers/abortable';

jest.mock('../../lib/contacts', () => ({
  getContactsPermission: jest.fn(),
  requestContactsPermission: jest.fn(),
  normalizeToE164: jest.requireActual('../../lib/contacts').normalizeToE164,
}));

const mockUpsert = jest.fn();

jest.mock('../../lib/supabase', () => ({
  supabase: {
    from: () => ({ upsert: (...args: unknown[]) => mockUpsert(...args) }),
  },
}));

jest.mock('../../lib/dialogs', () => ({
  showAlert: jest.fn(),
  showConfirm: jest.fn(),
}));

jest.mock('../../components/PeoplePicker', () => {
  const { TouchableOpacity, Text } = require('react-native');
  return {
    PeoplePicker: ({
      onSelect,
      onCancel,
    }: {
      onSelect: (contacts: { phoneNumber: string; name: string | null }[]) => void;
      onCancel: () => void;
    }) => (
      <>
        <TouchableOpacity
          onPress={() => onSelect([{ phoneNumber: '+14165551234', name: 'Alice' }])}
        >
          <Text>Pick Alice</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onCancel}>
          <Text>Cancel picker</Text>
        </TouchableOpacity>
      </>
    ),
  };
});

const getContactsPermissionMock = getContactsPermission as jest.MockedFunction<
  typeof getContactsPermission
>;
const requestContactsPermissionMock = requestContactsPermission as jest.MockedFunction<
  typeof requestContactsPermission
>;

function renderFlow(
  overrides: Partial<React.ComponentProps<typeof ContactsPermissionFlow>> = {}
) {
  const onPeopleChanged = jest.fn();
  const result = render(
    <ContactsPermissionFlow
      userId="u1"
      existingPhones={[]}
      peopleCount={0}
      autoStart
      restartKey={0}
      onPeopleChanged={onPeopleChanged}
      {...overrides}
    />
  );
  return { ...result, onPeopleChanged };
}

describe('ContactsPermissionFlow', () => {
  const originalOS = Platform.OS;

  beforeEach(() => {
    jest.clearAllMocks();
    Platform.OS = 'ios';
    mockUpsert.mockImplementation(() =>
      abortablePromise(Promise.resolve({ error: null }))
    );
  });

  afterEach(() => {
    Platform.OS = originalOS;
  });

  it('shows the explainer before requesting permission when undetermined', async () => {
    getContactsPermissionMock.mockResolvedValue({
      status: 'undetermined',
      canAskAgain: true,
    });

    const { getByText } = renderFlow();

    await waitFor(() =>
      expect(
        getByText('Events uses your contacts so you can pick who to text when you share.')
      ).toBeTruthy()
    );
    expect(requestContactsPermissionMock).not.toHaveBeenCalled();
  });

  it('Allow contacts access requests permission and opens the picker when granted', async () => {
    getContactsPermissionMock.mockResolvedValue({
      status: 'undetermined',
      canAskAgain: true,
    });
    requestContactsPermissionMock.mockResolvedValue(true);

    const { getByText } = renderFlow();
    await waitFor(() => expect(getByText('Allow contacts access')).toBeTruthy());
    fireEvent.press(getByText('Allow contacts access'));

    await waitFor(() => expect(requestContactsPermissionMock).toHaveBeenCalledTimes(1));
    expect(getByText('Pick Alice')).toBeTruthy();
  });

  it('Allow contacts access requests permission and shows recovery when denied', async () => {
    getContactsPermissionMock.mockResolvedValue({
      status: 'undetermined',
      canAskAgain: true,
    });
    requestContactsPermissionMock.mockResolvedValue(false);

    const { getByText } = renderFlow();
    await waitFor(() => expect(getByText('Allow contacts access')).toBeTruthy());
    fireEvent.press(getByText('Allow contacts access'));

    await waitFor(() => expect(getByText('Contacts are off')).toBeTruthy());
    expect(getByText('Open Settings')).toBeTruthy();
    expect(getByText('Add a number instead')).toBeTruthy();
  });

  it('Not now dismisses without requesting permission', async () => {
    getContactsPermissionMock.mockResolvedValue({
      status: 'undetermined',
      canAskAgain: true,
    });

    const { getByText, queryByText } = renderFlow();
    await waitFor(() => expect(getByText('Not now')).toBeTruthy());
    fireEvent.press(getByText('Not now'));

    await waitFor(() => expect(queryByText('Allow contacts access')).toBeNull());
    expect(requestContactsPermissionMock).not.toHaveBeenCalled();
  });

  it('skips the explainer and opens the picker when already granted', async () => {
    getContactsPermissionMock.mockResolvedValue({
      status: 'granted',
      canAskAgain: true,
    });

    const { getByText, queryByText } = renderFlow();
    await waitFor(() => expect(getByText('Pick Alice')).toBeTruthy());
    expect(queryByText('Allow contacts access')).toBeNull();
    expect(requestContactsPermissionMock).not.toHaveBeenCalled();
  });

  it('shows the explainer when denied but the OS can still ask', async () => {
    getContactsPermissionMock.mockResolvedValue({
      status: 'denied',
      canAskAgain: true,
    });

    const { getByText } = renderFlow();
    await waitFor(() => expect(getByText('Allow contacts access')).toBeTruthy());
  });

  it('shows recovery when denied and the OS will not ask again', async () => {
    getContactsPermissionMock.mockResolvedValue({
      status: 'denied',
      canAskAgain: false,
    });

    const { getByText, queryByText } = renderFlow();
    await waitFor(() => expect(getByText('Contacts are off')).toBeTruthy());
    expect(queryByText('Allow contacts access')).toBeNull();
    expect(requestContactsPermissionMock).not.toHaveBeenCalled();
  });

  it('Open Settings deep-links to app settings', async () => {
    getContactsPermissionMock.mockResolvedValue({
      status: 'denied',
      canAskAgain: false,
    });
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue();

    const { getByText } = renderFlow();
    await waitFor(() => expect(getByText('Open Settings')).toBeTruthy());
    fireEvent.press(getByText('Open Settings'));

    expect(openSettings).toHaveBeenCalledTimes(1);
    openSettings.mockRestore();
  });

  it('opens the picker after returning from Settings with permission granted', async () => {
    getContactsPermissionMock
      .mockResolvedValueOnce({ status: 'denied', canAskAgain: false })
      .mockResolvedValue({ status: 'granted', canAskAgain: true });

    let onChange: ((state: string) => void) | undefined;
    const addSpy = jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, handler) => {
      onChange = handler as (state: string) => void;
      return { remove: jest.fn() } as never;
    });

    const { getByText } = renderFlow();
    await waitFor(() => expect(getByText('Contacts are off')).toBeTruthy());
    expect(onChange).toBeDefined();
    onChange?.('active');

    await waitFor(() => expect(getByText('Pick Alice')).toBeTruthy());
    addSpy.mockRestore();
  });

  it('Add a number instead opens the manual add form', async () => {
    getContactsPermissionMock.mockResolvedValue({
      status: 'denied',
      canAskAgain: false,
    });

    const { getByText, getByPlaceholderText } = renderFlow();
    await waitFor(() => expect(getByText('Add a number instead')).toBeTruthy());
    fireEvent.press(getByText('Add a number instead'));

    await waitFor(() => expect(getByPlaceholderText('Name')).toBeTruthy());
    expect(getByText('Add person')).toBeTruthy();
  });

  it('restartKey starts the flow when autoStart is off', async () => {
    getContactsPermissionMock.mockResolvedValue({
      status: 'undetermined',
      canAskAgain: true,
    });

    const { getByText, rerender, queryByText } = renderFlow({
      autoStart: false,
      restartKey: 0,
    });

    expect(queryByText('Allow contacts access')).toBeNull();

    rerender(
      <ContactsPermissionFlow
        userId="u1"
        existingPhones={[]}
        peopleCount={0}
        autoStart={false}
        restartKey={1}
        onPeopleChanged={jest.fn()}
      />
    );

    await waitFor(() => expect(getByText('Allow contacts access')).toBeTruthy());
  });

  it('does not auto-start on web', async () => {
    Platform.OS = 'web';
    getContactsPermissionMock.mockResolvedValue({
      status: 'undetermined',
      canAskAgain: true,
    });

    const { queryByText } = renderFlow();
    await waitFor(() => expect(getContactsPermissionMock).not.toHaveBeenCalled());
    expect(queryByText('Allow contacts access')).toBeNull();
  });

  it('upserts selected contacts and notifies the parent', async () => {
    getContactsPermissionMock.mockResolvedValue({
      status: 'granted',
      canAskAgain: true,
    });

    const { getByText, onPeopleChanged } = renderFlow();
    await waitFor(() => expect(getByText('Pick Alice')).toBeTruthy());
    fireEvent.press(getByText('Pick Alice'));

    await waitFor(() => expect(mockUpsert).toHaveBeenCalledTimes(1));
    expect(mockUpsert).toHaveBeenCalledWith(
      [{ owner_id: 'u1', phone_number: '+14165551234', contact_name: 'Alice' }],
      { onConflict: 'owner_id,phone_number' }
    );
    expect(onPeopleChanged).toHaveBeenCalledTimes(1);
  });

  it('blocks picking past the 50-person cap', async () => {
    getContactsPermissionMock.mockResolvedValue({
      status: 'granted',
      canAskAgain: true,
    });

    const { getByText } = renderFlow({ peopleCount: 50 });
    await waitFor(() => expect(getByText('Pick Alice')).toBeTruthy());
    fireEvent.press(getByText('Pick Alice'));

    await waitFor(() => expect(showAlert).toHaveBeenCalledTimes(1));
    expect((showAlert as jest.Mock).mock.calls[0][0]).toBe('Limit reached');
    expect(mockUpsert).not.toHaveBeenCalled();
  });
});
