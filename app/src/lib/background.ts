/**
 * Hintergrundaktualisierung: holt neue Termine und plant lokale Erinnerungen neu.
 * Wann das passiert, entscheidet das Betriebssystem (iOS: meist alle paar
 * Stunden, abhängig von der Nutzung). Für zuverlässige Benachrichtigungen bei
 * Änderungen anderer Familienmitglieder gibt es die Webhooks.
 */
import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { getPb } from './pb';
import { fetchSnapshot } from './data';
import { rescheduleAll } from './notifications';

export const BACKGROUND_SYNC = 'familycal-background-sync';

TaskManager.defineTask(BACKGROUND_SYNC, async () => {
  try {
    const pb = await getPb();
    if (!pb || !pb.authStore.isValid) return BackgroundTask.BackgroundTaskResult.Success;
    const s = await fetchSnapshot(pb);
    await rescheduleAll({ events: s.events, families: s.families, memberships: s.memberships, userId: s.userId });
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

export async function registerBackgroundSync() {
  try {
    const status = await BackgroundTask.getStatusAsync();
    if (status !== BackgroundTask.BackgroundTaskStatus.Available) return;
    if (await TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC)) return;
    await BackgroundTask.registerTaskAsync(BACKGROUND_SYNC, { minimumInterval: 30 });
  } catch {}
}
