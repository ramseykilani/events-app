import React from 'react';
import { Text } from 'react-native';
import { act, render, waitFor } from '@testing-library/react-native';
import {
  SessionContextProvider,
  useSession,
} from '../../../app/context/SessionContext';

const mockGetSession = jest.fn();
const mockOnAuthStateChange = jest.fn();
const mockRpc = jest.fn();
const mockUnsubscribe = jest.fn();
let authStateCallback:
  | ((event: string, session: unknown) => unknown)
  | null = null;

jest.mock('../../../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
      onAuthStateChange: (...args: unknown[]) => mockOnAuthStateChange(...args),
    },
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));

function SessionProbe() {
  const { session, isLoading } = useSession();
  return (
    <>
      <Text testID="loading">{String(isLoading)}</Text>
      <Text testID="user-id">{session?.user?.id ?? 'none'}</Text>
    </>
  );
}

describe('SessionContextProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    authStateCallback = null;
    mockRpc.mockResolvedValue({ error: null });
    mockOnAuthStateChange.mockImplementation(
      (callback: (event: string, session: unknown) => void) => {
        authStateCallback = callback;
        return {
          data: {
            subscription: {
              unsubscribe: mockUnsubscribe,
            },
          },
        };
      }
    );
  });

  it('loads existing session and ensures user row', async () => {
    mockGetSession.mockResolvedValueOnce({
      data: {
        session: {
          user: {
            id: 'user-1',
            phone: '+14165550001',
            user_metadata: {},
          },
        },
      },
    });

    const screen = render(
      <SessionContextProvider>
        <SessionProbe />
      </SessionContextProvider>
    );

    await waitFor(() => expect(screen.getByTestId('loading').props.children).toBe('false'));
    expect(screen.getByTestId('user-id').props.children).toBe('user-1');
    expect(mockRpc).toHaveBeenCalledWith('ensure_user_exists', {
      p_phone: '+14165550001',
    });
  });

  it('reacts to auth state changes and unsubscribes on unmount', async () => {
    mockGetSession.mockResolvedValueOnce({
      data: {
        session: null,
      },
    });

    const screen = render(
      <SessionContextProvider>
        <SessionProbe />
      </SessionContextProvider>
    );

    await waitFor(() => expect(screen.getByTestId('loading').props.children).toBe('false'));
    expect(screen.getByTestId('user-id').props.children).toBe('none');

    await act(async () => {
      await authStateCallback?.('SIGNED_IN', {
        user: {
          id: 'user-2',
          phone: undefined,
          user_metadata: { phone: '+14165550002' },
        },
      });
    });

    await waitFor(() => expect(screen.getByTestId('user-id').props.children).toBe('user-2'));
    expect(mockRpc).toHaveBeenCalledWith('ensure_user_exists', {
      p_phone: '+14165550002',
    });

    screen.unmount();
    expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
  });
});
