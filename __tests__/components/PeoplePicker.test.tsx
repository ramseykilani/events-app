import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { PeoplePicker } from '../../components/PeoplePicker';
import { getContactsWithPhones } from '../../lib/contacts';

jest.mock('../../lib/contacts', () => ({
  getContactsWithPhones: jest.fn(),
}));

describe('components/PeoplePicker', () => {
  const getContactsWithPhonesMock = getContactsWithPhones as jest.MockedFunction<
    typeof getContactsWithPhones
  >;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('loads contacts and excludes already-added phone numbers', async () => {
    getContactsWithPhonesMock.mockResolvedValueOnce([
      {
        id: '1',
        name: 'Alice',
        phoneNumber: '+14165550001',
        normalized: '+14165550001',
      },
      {
        id: '2',
        name: 'Bob',
        phoneNumber: '+14165550002',
        normalized: '+14165550002',
      },
    ]);

    const screen = render(
      <PeoplePicker
        onSelect={jest.fn()}
        onCancel={jest.fn()}
        existingPhones={['+14165550001']}
      />
    );

    await waitFor(() => expect(screen.queryByText('Loading contacts...')).toBeNull());
    expect(screen.queryByText('Alice')).toBeNull();
    expect(screen.getByText('Bob')).toBeTruthy();
  });

  it('filters contacts by name and phone digits', async () => {
    getContactsWithPhonesMock.mockResolvedValueOnce([
      {
        id: '1',
        name: 'Alice Johnson',
        phoneNumber: '+14165550001',
        normalized: '+14165550001',
      },
      {
        id: '2',
        name: 'Bob Lee',
        phoneNumber: '+14165550002',
        normalized: '+14165550002',
      },
    ]);

    const screen = render(
      <PeoplePicker onSelect={jest.fn()} onCancel={jest.fn()} existingPhones={[]} />
    );

    await screen.findByText('Alice Johnson');

    fireEvent.changeText(screen.getByPlaceholderText('Search contacts...'), 'alice');
    expect(screen.getByText('Alice Johnson')).toBeTruthy();
    expect(screen.queryByText('Bob Lee')).toBeNull();

    fireEvent.changeText(screen.getByPlaceholderText('Search contacts...'), '50002');
    expect(screen.getByText('Bob Lee')).toBeTruthy();
    expect(screen.queryByText('Alice Johnson')).toBeNull();
  });

  it('returns normalized selections on confirm', async () => {
    getContactsWithPhonesMock.mockResolvedValueOnce([
      {
        id: '1',
        name: 'Alice',
        phoneNumber: '+14165550001',
        normalized: '+14165550001',
      },
      {
        id: '2',
        name: 'Bob',
        phoneNumber: '+14165550002',
        normalized: '+14165550002',
      },
    ]);

    const onSelect = jest.fn();
    const screen = render(
      <PeoplePicker onSelect={onSelect} onCancel={jest.fn()} existingPhones={[]} />
    );

    await screen.findByText('Bob');
    fireEvent.press(screen.getByText('Bob'));
    fireEvent.press(screen.getByText('Add (1)'));

    expect(onSelect).toHaveBeenCalledWith([
      { phoneNumber: '+14165550002', name: 'Bob' },
    ]);
  });
});
