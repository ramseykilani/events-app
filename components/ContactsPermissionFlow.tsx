import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking, Platform } from 'react-native';
import { ContactsExplainer } from './ContactsExplainer';
import { ContactsDeniedRecovery } from './ContactsDeniedRecovery';
import { PeoplePicker } from './PeoplePicker';
import { ManualAddPersonModal } from './ManualAddPersonModal';
import {
  getContactsPermission,
  requestContactsPermission,
} from '../lib/contacts';
import { supabase } from '../lib/supabase';
import { showAlert } from '../lib/dialogs';
import { isAbortError, withWriteTimeout } from '../lib/timeoutSignal';

type Phase = 'idle' | 'explainer' | 'picker' | 'recovery' | 'manual';

type Props = {
  userId: string;
  existingPhones: string[];
  peopleCount: number;
  autoStart: boolean;
  restartKey: number;
  onPeopleChanged: () => void;
};

export function ContactsPermissionFlow({
  userId,
  existingPhones,
  peopleCount,
  autoStart,
  restartKey,
  onPeopleChanged,
}: Props) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [continuing, setContinuing] = useState(false);
  const hasAutoStarted = useRef(false);
  const prevRestartKey = useRef(0);
  const importInFlightRef = useRef(false);

  const startFlow = useCallback(async () => {
    try {
      const perm = await getContactsPermission();
      if (perm.status === 'granted') {
        setPhase('picker');
        return;
      }
      if (perm.canAskAgain) {
        setPhase('explainer');
        return;
      }
      setPhase('recovery');
    } catch (err) {
      console.error('contacts permission check failed:', err);
    }
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (!autoStart || hasAutoStarted.current) return;
    hasAutoStarted.current = true;
    startFlow();
  }, [autoStart, startFlow]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (restartKey === prevRestartKey.current) return;
    prevRestartKey.current = restartKey;
    if (restartKey > 0) startFlow();
  }, [restartKey, startFlow]);

  useEffect(() => {
    if (phase !== 'recovery') return;
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return;
      getContactsPermission().then((perm) => {
        if (perm.status === 'granted') setPhase('picker');
      });
    });
    return () => {
      sub?.remove?.();
    };
  }, [phase]);

  const handleContinue = async () => {
    if (continuing) return;
    setContinuing(true);
    try {
      const granted = await requestContactsPermission();
      setPhase(granted ? 'picker' : 'recovery');
    } catch (err) {
      console.error('contacts permission request failed:', err);
      setPhase('recovery');
    } finally {
      setContinuing(false);
    }
  };

  const handleSelectContacts = async (
    selected: { phoneNumber: string; name: string | null }[]
  ) => {
    const count = peopleCount + selected.length;
    if (count > 50) {
      showAlert(
        'Limit reached',
        `You can add up to 50 people. You have ${peopleCount} and tried to add ${selected.length}.`
      );
      setPhase('idle');
      return;
    }

    if (importInFlightRef.current) return;
    importInFlightRef.current = true;
    try {
      const rows = selected.map((c) => ({
        owner_id: userId,
        phone_number: c.phoneNumber,
        contact_name: c.name,
      }));
      await withWriteTimeout(async (signal) => {
        const { error } = await supabase
          .from('my_people')
          .upsert(rows, {
            onConflict: 'owner_id,phone_number',
          })
          .abortSignal(signal);
        if (error) throw error;
      });
    } catch (err) {
      console.error('Failed to add people:', err);
      showAlert(
        'Could not add people',
        isAbortError(err)
          ? 'That took too long. Check your connection and try again.'
          : 'Something went wrong. Try again.'
      );
      return;
    } finally {
      importInFlightRef.current = false;
    }
    setPhase('idle');
    onPeopleChanged();
  };

  if (Platform.OS === 'web') return null;

  return (
    <>
      <ContactsExplainer
        visible={phase === 'explainer'}
        continuing={continuing}
        onContinue={handleContinue}
        onNotNow={() => setPhase('idle')}
      />
      <ContactsDeniedRecovery
        visible={phase === 'recovery'}
        onOpenSettings={() => Linking.openSettings()}
        onAddNumber={() => setPhase('manual')}
        onClose={() => setPhase('idle')}
      />
      {phase === 'picker' ? (
        <PeoplePicker
          onSelect={handleSelectContacts}
          onCancel={() => setPhase('idle')}
          existingPhones={existingPhones}
        />
      ) : null}
      <ManualAddPersonModal
        visible={phase === 'manual'}
        userId={userId}
        peopleCount={peopleCount}
        onClose={() => setPhase('recovery')}
        onSaved={() => {
          setPhase('idle');
          onPeopleChanged();
        }}
      />
    </>
  );
}
