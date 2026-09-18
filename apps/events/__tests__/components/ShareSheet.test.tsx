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

  it('uses onAddPeople when provided instead of routing to People', () => {
    const onAddPeople = jest.fn();
    const screen = render(
      <ShareSheet
        people={[]}
        circles={[]}
        circleMembers={[]}
        selectedPersonIds={new Set()}
        onSelectionChange={jest.fn()}
        onAddPeople={onAddPeople}
      />
    );

    fireEvent.press(screen.getByText('Add People'));
    expect(onAddPeople).toHaveBeenCalledTimes(1);
    expect(router.push).not.toHaveBeenCalled();
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

    // All members selected → chip shows its selected state (accent fill,
    // plain name — ✓ is reserved for confirmed/done).
    fireEvent.press(screen.getByText('Friends'));
    const selected = onSelectionChange.mock.calls[0][0] as Set<string>;
    expect(Array.from(selected)).toEqual([]);
  });

  it('shows the selected state on a circle chip when all members are selected', () => {
    const screen = render(
      <ShareSheet
        people={people}
        circles={circles}
        circleMembers={[
          { circle_id: 'c1', person_id: 'p1' },
          { circle_id: 'c1', person_id: 'p2' },
        ]}
        selectedPersonIds={new Set(['p1', 'p2'])}
        onSelectionChange={jest.fn()}
      />
    );

    // Selected state is the accent fill, not a ✓ prefix (✓ = confirmed/done).
    expect(screen.getByText('Friends')).toBeTruthy();
    expect(screen.queryByText('✓ Friends')).toBeNull();
  });

  it('marks selection with a circle indicator, not a checkmark', () => {
    const screen = render(
      <ShareSheet
        people={people}
        circles={[]}
        circleMembers={[]}
        selectedPersonIds={new Set(['p1'])}
        onSelectionChange={jest.fn()}
      />
    );

    // Circle = selectable: the picked row's circle is filled, the unpicked
    // row's is an outline, and no bare ✓ is spent on selection.
    expect(screen.getByTestId('selection-circle-selected')).toBeTruthy();
    expect(screen.getByTestId('selection-circle')).toBeTruthy();
    expect(screen.queryByText('✓')).toBeNull();
  });

  it('renders already-shared people as completed and ignores taps on them', () => {
    const onSelectionChange = jest.fn();

    const screen = render(
      <ShareSheet
        people={people}
        circles={[]}
        circleMembers={[]}
        selectedPersonIds={new Set()}
        sharedPersonIds={new Set(['p1'])}
        onSelectionChange={onSelectionChange}
      />
    );

    expect(screen.getByText('✓ Shared')).toBeTruthy();

    fireEvent.press(screen.getByText('Alice'));
    expect(onSelectionChange).not.toHaveBeenCalled();

    // Unshared people are still selectable
    fireEvent.press(screen.getByText('Bob'));
    const selected = onSelectionChange.mock.calls[0][0] as Set<string>;
    expect(Array.from(selected)).toEqual(['p2']);
  });

  it('renders per-person delivery status for shared rows', () => {
    const appUser: MyPerson = {
      id: 'p3',
      owner_id: 'u1',
      phone_number: '+14165550003',
      user_id: 'u3',
      contact_name: 'Carol',
      added_at: '2026-01-03T00:00:00.000Z',
      last_shared_at: null,
    };

    const screen = render(
      <ShareSheet
        people={[...people, appUser]}
        circles={[]}
        circleMembers={[]}
        selectedPersonIds={new Set()}
        sharedPersonIds={new Set(['p1', 'p2', 'p3'])}
        sharedStatuses={
          new Map([
            // p1 (no account): the carrier confirmed delivery — still just
            // "✓ Shared" (success is assumed; there is no delivered ladder).
            ['p1', { sms_status: 'delivered' as const, sms_error_code: null }],
            // p2 (no account): they replied STOP — the text never made it.
            ['p2', { sms_status: 'failed' as const, sms_error_code: '21610' }],
            // p3 (app user): the event is on their calendar regardless of SMS.
            ['p3', { sms_status: null, sms_error_code: null }],
          ])
        }
        onSelectionChange={jest.fn()}
      />
    );

    // p1 and p3 both read "✓ Shared" — app users and SMS contacts are
    // indistinguishable on success.
    expect(screen.getAllByText('✓ Shared')).toHaveLength(2);
    expect(screen.getByText('✕ Unsubscribed')).toBeTruthy();
    expect(screen.queryByText('✓ On their calendar')).toBeNull();
    expect(screen.queryByText('✓ Delivered')).toBeNull();
    expect(screen.queryByText('Not delivered')).toBeNull();

    // Status rows stay non-interactive.
    const onSelectionChange = jest.fn();
    screen.rerender(
      <ShareSheet
        people={[...people, appUser]}
        circles={[]}
        circleMembers={[]}
        selectedPersonIds={new Set()}
        sharedPersonIds={new Set(['p1', 'p2', 'p3'])}
        sharedStatuses={
          new Map([
            ['p1', { sms_status: 'delivered' as const, sms_error_code: null }],
            ['p2', { sms_status: 'failed' as const, sms_error_code: '21610' }],
            ['p3', { sms_status: null, sms_error_code: null }],
          ])
        }
        onSelectionChange={onSelectionChange}
      />
    );
    fireEvent.press(screen.getByText('Bob'));
    expect(onSelectionChange).not.toHaveBeenCalled();
  });

  it('disables a circle chip when every member was already shared', () => {
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
        sharedPersonIds={new Set(['p1', 'p2'])}
        onSelectionChange={onSelectionChange}
      />
    );

    fireEvent.press(screen.getByText('✓ Friends'));
    expect(onSelectionChange).not.toHaveBeenCalled();
  });

  it('selects only unshared members when a circle is partially shared', () => {
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
        sharedPersonIds={new Set(['p1'])}
        onSelectionChange={onSelectionChange}
      />
    );

    fireEvent.press(screen.getByText('Friends'));
    const selected = onSelectionChange.mock.calls[0][0] as Set<string>;
    expect(Array.from(selected)).toEqual(['p2']);
  });
});
