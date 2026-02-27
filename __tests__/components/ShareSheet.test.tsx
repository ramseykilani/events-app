import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { router } from 'expo-router';
import { ShareSheet } from '../../components/ShareSheet';
import type { Circle, MyPerson } from '../../lib/types';

describe('components/ShareSheet', () => {
  const people: MyPerson[] = [
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
  ];

  const circles: Circle[] = [
    {
      id: 'c1',
      owner_id: 'u1',
      name: 'Friends',
      created_at: '2026-01-01T00:00:00.000Z',
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows empty state and routes to people management', () => {
    const onSelectionChange = jest.fn();

    const screen = render(
      <ShareSheet
        people={[]}
        circles={[]}
        circleMembers={[]}
        selectedPersonIds={new Set()}
        onSelectionChange={onSelectionChange}
      />
    );

    expect(screen.getByText(/No people added yet/i)).toBeTruthy();
    fireEvent.press(screen.getByText('Add People'));
    expect(router.push).toHaveBeenCalledWith('/(app)/people');
  });

  it('toggles a single person selection', () => {
    const onSelectionChange = jest.fn();

    const screen = render(
      <ShareSheet
        people={people}
        circles={[]}
        circleMembers={[]}
        selectedPersonIds={new Set()}
        onSelectionChange={onSelectionChange}
      />
    );

    fireEvent.press(screen.getByText('Alice'));
    const selected = onSelectionChange.mock.calls[0][0] as Set<string>;
    expect(Array.from(selected)).toEqual(['p1']);
  });

  it('toggles a circle by selecting all members', () => {
    const onSelectionChange = jest.fn();

    const screen = render(
      <ShareSheet
        people={people}
        circles={circles}
        circleMembers={[
          { circle_id: 'c1', person_id: 'p1' },
          { circle_id: 'c1', person_id: 'p2' },
        ]}
        selectedPersonIds={new Set()}
        onSelectionChange={onSelectionChange}
      />
    );

    fireEvent.press(screen.getByText('Friends'));
    const selected = onSelectionChange.mock.calls[0][0] as Set<string>;
    expect(Array.from(selected).sort()).toEqual(['p1', 'p2']);
  });

  it('toggles a circle off when all members already selected', () => {
    const onSelectionChange = jest.fn();

    const screen = render(
      <ShareSheet
        people={people}
        circles={circles}
        circleMembers={[
          { circle_id: 'c1', person_id: 'p1' },
          { circle_id: 'c1', person_id: 'p2' },
        ]}
        selectedPersonIds={new Set(['p1', 'p2'])}
        onSelectionChange={onSelectionChange}
      />
    );

    fireEvent.press(screen.getByText('Friends'));
    const selected = onSelectionChange.mock.calls[0][0] as Set<string>;
    expect(Array.from(selected)).toEqual([]);
  });
});
