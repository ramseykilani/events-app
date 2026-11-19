import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { api } from '../lib/api';
import { getPermission, registerPushToken, requestPermission, type PermissionState } from '../lib/notifications';

// Permission state plus the one action that asks the OS. Asking is only ever
// the person's tap (the nudge card or Settings) — never on launch. When
// permission is granted the device's push token is (re)registered.
export function useNotificationPermission() {
  const [state, setState] = useState<PermissionState>('undetermined');

  useEffect(() => {
    getPermission().then(setState).catch(() => setState('unsupported'));
  }, []);

  const ask = useCallback(async () => {
    const next = await requestPermission();
    setState(next);
    if (next === 'granted' && Platform.OS !== 'web') {
      const token = await registerPushToken();
      if (token) await api.setPushToken(token);
    }
    return next;
  }, []);

  return { state, ask };
}
