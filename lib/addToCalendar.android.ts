import { Linking } from 'react-native';
import * as IntentLauncher from 'expo-intent-launcher';
import { buildGoogleUrl, buildNativeDetails } from './calendarLinks';
import type { CalendarExportEvent } from './addToCalendar';

// Add to Other Calendars (FEATURES.md) — Android hand-off. The
// Apple/Outlook/Other button fires ACTION_INSERT with the event extras:
// Google Calendar's (or any calendar app's) pre-filled new-event screen,
// permission-free.

export async function addToGoogle(event: CalendarExportEvent): Promise<void> {
  await Linking.openURL(buildGoogleUrl(event));
}

export async function addToOtherCalendar(event: CalendarExportEvent): Promise<void> {
  const details = buildNativeDetails(event);
  await IntentLauncher.startActivityAsync('android.intent.action.INSERT', {
    type: 'vnd.android.cursor.item/event',
    extra: {
      'android.intent.extra.TITLE': details.title,
      ...(details.notes ? { 'android.intent.extra.DESCRIPTION': details.notes } : {}),
      beginTime: details.startDate.getTime(),
      endTime: details.endDate.getTime(),
      allDay: details.allDay,
    },
  });
}
