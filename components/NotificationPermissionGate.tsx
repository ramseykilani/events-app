import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NotificationExplainer } from './NotificationExplainer';
import {
  getNotificationPermission,
  requestNotificationPermission,
  getExpoPushToken,
} from '../lib/pushNotifications';
import { supabase } from '../lib/supabase';

// Stable storage key — once answered (Turn on notifications or Not now) the
// ask never reappears; a rename would re-ask every user who already dismissed it.
const EXPLAINER_ANSWERED_KEY = 'notification_explainer_answered';

type Props = {
  userId: string;
  // The calendar bumps this after a successful fetch when the walkthrough is
  // not taking over the screen — the explainer must never stack on it.
  checkKey: number;
};

export function NotificationPermissionGate({ userId, checkKey }: Props) {
  const [visible, setVisible] = useState(false);
  const [continuing, setContinuing] = useState(false);
  const answeredRef = useRef(false);
  const prevCheckKeyRef = useRef(0);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (checkKey === prevCheckKeyRef.current) return;
    prevCheckKeyRef.current = checkKey;
    if (answeredRef.current) return;

    (async () => {
      const flag = await AsyncStorage.getItem(EXPLAINER_ANSWERED_KEY);
      if (flag === 'true') {
        answeredRef.current = true;
        return;
      }
      const perm = await getNotificationPermission();
      if (perm.status === 'granted' || !perm.canAskAgain) {
        // Granted: the root layout registers the token with no UI. Denied
        // with no re-ask: no recovery screen — SMS still reaches them.
        answeredRef.current = true;
        return;
      }
      setVisible(true);
    })().catch((err) =>
      console.error('notification permission check failed:', err)
    );
  }, [checkKey]);

  const saveToken = async () => {
    const token = await getExpoPushToken();
    if (!token) return;
    const { error } = await supabase
      .from('users')
      .update({ expo_push_token: token })
      .eq('id', userId);
    if (error) console.error('Failed to save push token:', error);
  };

  const markAnswered = () => {
    // The ref flips synchronously so a checkKey bump landing between the tap
    // and the storage write cannot reopen the modal.
    answeredRef.current = true;
    setVisible(false);
    AsyncStorage.setItem(EXPLAINER_ANSWERED_KEY, 'true').catch((err) =>
      console.error('Failed to persist notification explainer answer:', err)
    );
  };

  const handleContinue = async () => {
    if (continuing) return;
    setContinuing(true);
    try {
      const granted = await requestNotificationPermission();
      if (granted) {
        try {
          await saveToken();
        } catch (err) {
          // The root layout retries token registration on the next launch.
          console.error('push token registration failed:', err);
        }
      }
      markAnswered();
    } catch (err) {
      // The OS prompt likely never fired — dismiss without persisting so a
      // later launch can ask again.
      console.error('notification permission request failed:', err);
      setVisible(false);
    } finally {
      setContinuing(false);
    }
  };

  if (Platform.OS === 'web') return null;

  return (
    <NotificationExplainer
      visible={visible}
      continuing={continuing}
      onContinue={handleContinue}
      onNotNow={markAnswered}
    />
  );
}
