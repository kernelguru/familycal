/**
 * Lokale Erinnerungen auf dem Gerät.
 * iOS erlaubt max. 64 geplante Benachrichtigungen pro App – wir planen immer
 * nur die nächsten 60 und planen bei jedem Sync (App-Start, Änderung,
 * Hintergrundaktualisierung) neu.
 */
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import Storage from 'expo-sqlite/kv-store';
import * as cal from './calendar';
import { concernsMember } from './agenda';
import type { CalEvent, Family, Membership } from './types';

const SETTINGS_KEY = 'familycal_local_reminders';
const MAX_SCHEDULED = 60;
const HORIZON_DAYS = 21;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function localRemindersEnabled(): Promise<boolean> {
  return (await Storage.getItem(SETTINGS_KEY)) !== 'off';
}

export async function setLocalRemindersEnabled(on: boolean): Promise<boolean> {
  if (on) {
    const granted = await ensurePermission();
    if (!granted) return false;
  }
  await Storage.setItem(SETTINGS_KEY, on ? 'on' : 'off');
  if (!on) await Notifications.cancelAllScheduledNotificationsAsync();
  return on;
}

export async function ensurePermission(): Promise<boolean> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('reminders', {
      name: 'Termin-Erinnerungen',
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const req = await Notifications.requestPermissionsAsync();
  return req.granted;
}

/** Plant alle lokalen Erinnerungen neu. */
export async function rescheduleAll(params: {
  events: CalEvent[];
  families: Family[];
  memberships: Membership[]; // eigene Mitgliedschaften (eine pro Familie)
  userId: string;
}): Promise<number> {
  if (!(await localRemindersEnabled())) return 0;
  const perm = await Notifications.getPermissionsAsync();
  if (!perm.granted) return 0;

  const now = Date.now();
  const to = new Date(now + HORIZON_DAYS * 86400000);
  const famName = new Map(params.families.map((f) => [f.id, f.name]));
  const myMembership = new Map(params.memberships.filter((m) => m.user === params.userId).map((m) => [m.family, m]));
  const multiFamily = params.families.length > 1;

  type Item = { id: string; at: number; title: string; body: string; eventId: string; occ: string };
  const items: Item[] = [];
  for (const ev of params.events) {
    const reminders = ev.reminders || [];
    if (!reminders.length) continue;
    if (!concernsMember(ev, myMembership.get(ev.family), params.userId)) continue;
    const maxM = Math.max(...reminders);
    const occ = cal.expand(ev, new Date(now), new Date(to.getTime() + maxM * 60000), { limit: 100 });
    for (const o of occ) {
      for (const m of reminders) {
        const at = o.start.getTime() - m * 60000;
        if (at <= now + 5000 || at > to.getTime()) continue;
        const when = cal.formatWhen(o.start, o.end, ev.all_day);
        items.push({
          id: `${ev.id}|${o.key}|${m}`,
          at,
          title: `${m === 0 ? 'Jetzt' : cal.formatLead(m)}: ${ev.title}`,
          body: [when, ev.location, multiFamily ? famName.get(ev.family) : ''].filter(Boolean).join(' · '),
          eventId: ev.id,
          occ: o.key,
        });
      }
    }
  }
  items.sort((a, b) => a.at - b.at);

  await Notifications.cancelAllScheduledNotificationsAsync();
  const chosen = items.slice(0, MAX_SCHEDULED);
  for (const it of chosen) {
    await Notifications.scheduleNotificationAsync({
      identifier: it.id,
      content: {
        title: it.title,
        body: it.body,
        data: { eventId: it.eventId, occ: it.occ },
        sound: 'default',
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: new Date(it.at),
        channelId: Platform.OS === 'android' ? 'reminders' : undefined,
      } as Notifications.DateTriggerInput,
    });
  }
  return chosen.length;
}
