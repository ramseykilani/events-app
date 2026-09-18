import React from 'react';
import { Text } from 'react-native';
import { act, render, waitFor } from '@testing-library/react-native';
import {
  SessionContextProvider,
  useSession,
} from '../../../app/_context/SessionContext';

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

    // Flush getSession() + nested ensureUserRow() promise chain before asserting
    await act(async () => {});
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

  it('does not block the auth-state callback on a hung ensure_user_exists (KI-013)', async () => {
    mockGetSession.mockResolvedValueOnce({
      data: {
        session: null,
      },
    });
    // auth-js awaits every onAuthStateChange callback before resolving the
    // token refresh that getSession() is waiting on, so a callback that
    // awaited this never-settling RPC would hold the boot spinner forever.
    mockRpc.mockReturnValue(new Promise(() => {}));

    const screen = render(
      <SessionContextProvider>
        <SessionProbe />
      </SessionContextProvider>
    );

    await waitFor(() => expect(screen.getByTestId('loading').props.children).toBe('false'));

    let callbackResult: unknown;
    await act(async () => {
      callbackResult = authStateCallback?.('TOKEN_REFRESHED', {
        user: {
          id: 'user-3',
          phone: '+14165550003',
          user_metadata: {},
        },
      });
    });

    const raced = await Promise.race([
      Promise.resolve(callbackResult).then(() => 'settled'),
      new Promise((resolve) => setTimeout(() => resolve('blocked'), 100)),
    ]);
    expect(raced).toBe('settled');
    expect(mockRpc).toHaveBeenCalledWith('ensure_user_exists', {
      p_phone: '+14165550003',
    });
    await waitFor(() => expect(screen.getByTestId('user-id').props.children).toBe('user-3'));
  });
});
