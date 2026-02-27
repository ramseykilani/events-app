import * as Contacts from 'expo-contacts';
import {
  getContactsPermissionStatus,
  getContactsWithPhones,
  normalizeToE164,
  requestContactsPermission,
} from '../../lib/contacts';

jest.mock('expo-contacts', () => ({
  requestPermissionsAsync: jest.fn(),
  getPermissionsAsync: jest.fn(),
  getContactsAsync: jest.fn(),
  Fields: {
    PhoneNumbers: 'phoneNumbers',
  },
}));

describe('lib/contacts', () => {
  const requestPermissionsAsyncMock =
    Contacts.requestPermissionsAsync as jest.MockedFunction<
      typeof Contacts.requestPermissionsAsync
    >;
  const getPermissionsAsyncMock = Contacts.getPermissionsAsync as jest.MockedFunction<
    typeof Contacts.getPermissionsAsync
  >;
  const getContactsAsyncMock = Contacts.getContactsAsync as jest.MockedFunction<
    typeof Contacts.getContactsAsync
  >;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('normalizes valid numbers to E.164', () => {
    expect(normalizeToE164('(416) 555-1234')).toBe('+14165551234');
  });

  it('returns null for invalid numbers', () => {
    expect(normalizeToE164('not-a-number')).toBeNull();
  });

  it('reports permission granted status', async () => {
    getPermissionsAsyncMock.mockResolvedValueOnce({
      status: 'granted',
      granted: true,
      expires: 'never',
      canAskAgain: true,
    } as Contacts.PermissionResponse);

    await expect(getContactsPermissionStatus()).resolves.toBe(true);
  });

  it('requests contacts permission and resolves granted', async () => {
    requestPermissionsAsyncMock.mockResolvedValueOnce({
      status: 'granted',
      granted: true,
      expires: 'never',
      canAskAgain: true,
    } as Contacts.PermissionResponse);

    await expect(requestContactsPermission()).resolves.toBe(true);
  });

  it('returns empty list when permission remains denied', async () => {
    getPermissionsAsyncMock.mockResolvedValueOnce({
      status: 'denied',
      granted: false,
      expires: 'never',
      canAskAgain: true,
    } as Contacts.PermissionResponse);
    requestPermissionsAsyncMock.mockResolvedValueOnce({
      status: 'denied',
      granted: false,
      expires: 'never',
      canAskAgain: false,
    } as Contacts.PermissionResponse);

    await expect(getContactsWithPhones()).resolves.toEqual([]);
    expect(getContactsAsyncMock).not.toHaveBeenCalled();
  });

  it('deduplicates contacts by normalized number and skips invalid values', async () => {
    getPermissionsAsyncMock.mockResolvedValueOnce({
      status: 'granted',
      granted: true,
      expires: 'never',
      canAskAgain: true,
    } as Contacts.PermissionResponse);
    getContactsAsyncMock.mockResolvedValueOnce({
      data: [
        {
          id: 'c1',
          name: 'Alice',
          phoneNumbers: [{ number: '(416) 555-1234' }, { number: '+1 416 555 1234' }],
        },
        {
          id: 'c2',
          name: null,
          phoneNumbers: [{ number: 'invalid' }, { number: '+1 647 555 9999' }],
        },
      ],
      hasNextPage: false,
    } as Contacts.ContactResponse);

    const results = await getContactsWithPhones();

    expect(results).toEqual([
      {
        id: 'c1-+14165551234',
        name: 'Alice',
        phoneNumber: '(416)555-1234',
        normalized: '+14165551234',
      },
      {
        id: 'c2-+16475559999',
        name: null,
        phoneNumber: '+16475559999',
        normalized: '+16475559999',
      },
    ]);
  });
});
