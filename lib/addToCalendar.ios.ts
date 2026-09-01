import { Linking } from 'react-native';
import * as Calendar from 'expo-calendar';
import { buildGoogleUrl, buildNativeDetails } from './calendarLinks';
import type { CalendarExportEvent } from './addToCalendar';

// Add to Other Calendars (FEATURES.md) — iOS hand-off. The Apple/Outlook/Other
// button presents Apple's own pre-filled New Event sheet
// (createEventInCalendarAsync): EventKit UI is user-in-the-loop, so no
// calendar permission is requested. The sheet requires iOS 17+; on older
// devices the promise rejects and the caller shows a short alert.

export async function addToGoogle(event: CalendarExportEvent): Promise<void> {
  await Linking.openURL(buildGoogleUrl(event));
}

export async function addToOtherCalendar(event: CalendarExportEvent): Promise<void> {
  // buildNativeDetails carries the free-text location through — EventKit's
  // pre-filled sheet takes it as-is (no Places lookup).
  await Calendar.createEventInCalendarAsync(buildNativeDetails(event));
}
