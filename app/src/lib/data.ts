/**
 * Laden und Zwischenspeichern der Daten. Die API-Regeln des Servers sorgen
 * dafür, dass nur Daten der eigenen Familien zurückkommen.
 */
import type PocketBase from 'pocketbase';
import Storage from 'expo-sqlite/kv-store';
import * as cal from './calendar';
import type { CalEvent, Family, Membership } from './types';

const CACHE_KEY = 'familycal_cache_v1';

export interface Snapshot {
  userId: string;
  families: Family[];
  memberships: Membership[];
  events: CalEvent[];
  fetchedAt: number;
}

export async function fetchSnapshot(pb: PocketBase): Promise<Snapshot> {
  const userId = pb.authStore.record?.id || '';
  const since = cal.toPbDate(new Date(Date.now() - 2 * 86400000));
  const [families, memberships, events] = await Promise.all([
    pb.collection('families').getFullList<Family>({ sort: 'name' }),
    pb.collection('memberships').getFullList<Membership>({ sort: 'name' }),
    // Wiederkehrende immer, einmalige nur ab vorgestern (spart Daten)
    pb.collection('events').getFullList<CalEvent>({
      filter: pb.filter('rrule != "" || end >= {:since}', { since }),
      sort: 'start',
    }),
  ]);
  const snap = { userId, families, memberships, events, fetchedAt: Date.now() };
  await saveCache(snap);
  return snap;
}

/** Vergangene Einzeltermine nachladen (z. B. für "Ältere anzeigen"). */
export async function fetchPastEvents(pb: PocketBase, familyId: string, from: Date, to: Date): Promise<CalEvent[]> {
  return pb.collection('events').getFullList<CalEvent>({
    filter: pb.filter('family = {:f} && rrule = "" && start >= {:from} && start < {:to}', {
      f: familyId,
      from: cal.toPbDate(from),
      to: cal.toPbDate(to),
    }),
    sort: 'start',
  });
}

export async function saveCache(s: Snapshot) {
  try {
    await Storage.setItem(CACHE_KEY, JSON.stringify(s));
  } catch {}
}

export async function loadCache(): Promise<Snapshot | null> {
  try {
    const raw = await Storage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as Snapshot) : null;
  } catch {
    return null;
  }
}

export async function clearCache() {
  try {
    await Storage.removeItem(CACHE_KEY);
  } catch {}
}
