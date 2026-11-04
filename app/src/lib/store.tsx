import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type PocketBase from 'pocketbase';
import Storage from 'expo-sqlite/kv-store';
import { getPb, getSavedServerUrl } from './pb';
import { clearCache, fetchSnapshot, loadCache, Snapshot } from './data';
import { rescheduleAll } from './notifications';
import type { CalEvent, Family, Membership } from './types';
import * as Notifications from 'expo-notifications';

const CURRENT_FAMILY_KEY = 'familycal_current_family';

interface StoreValue {
  ready: boolean;
  pb: PocketBase | null;
  serverUrl: string;
  userId: string;
  userEmail: string;
  families: Family[];
  memberships: Membership[];
  events: CalEvent[];
  fetchedAt: number;
  loading: boolean;
  offline: boolean;
  currentFamily: Family | null;
  familyMembers: Membership[];
  myMembership: Membership | undefined;
  canWrite: boolean;
  isAdmin: boolean;
  membershipById: Map<string, Membership>;
  refresh: () => Promise<void>;
  setCurrentFamily: (id: string) => Promise<void>;
  onLoggedIn: () => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<StoreValue | null>(null);

export function useStore(): StoreValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('StoreProvider fehlt');
  return v;
}

const empty: Snapshot = { userId: '', families: [], memberships: [], events: [], fetchedAt: 0 };

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [pb, setPb] = useState<PocketBase | null>(null);
  const [serverUrl, setServerUrl] = useState('');
  const [snap, setSnap] = useState<Snapshot>(empty);
  const [currentId, setCurrentId] = useState('');
  const [loading, setLoading] = useState(false);
  const [offline, setOffline] = useState(false);
  const [authTick, setAuthTick] = useState(0);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const userId = pb?.authStore.isValid ? pb.authStore.record?.id || '' : '';
  const userEmail = pb?.authStore.record?.email || '';

  const refresh = useCallback(async () => {
    const client = pb;
    if (!client || !client.authStore.isValid) return;
    setLoading(true);
    try {
      // Token verlängern (läuft sonst nach 30 Tagen ab)
      await client.collection('users').authRefresh().catch((e) => {
        if (e?.status === 401) client.authStore.clear();
        throw e;
      });
      const s = await fetchSnapshot(client);
      setSnap(s);
      setOffline(false);
      rescheduleAll({ events: s.events, families: s.families, memberships: s.memberships, userId: s.userId }).catch(() => {});
    } catch (e: any) {
      if (!client.authStore.isValid) setAuthTick((t) => t + 1);
      setOffline(true);
    } finally {
      setLoading(false);
    }
  }, [pb]);

  // Start: Client + Cache laden
  useEffect(() => {
    (async () => {
      const url = await getSavedServerUrl();
      setServerUrl(url);
      const client = await getPb();
      setPb(client);
      const cached = await loadCache();
      if (cached && client?.authStore.isValid && cached.userId === client.authStore.record?.id) setSnap(cached);
      setCurrentId((await Storage.getItem(CURRENT_FAMILY_KEY)) || '');
      setReady(true);
    })();
  }, [authTick]);

  // Nach dem Laden: frische Daten + Realtime
  useEffect(() => {
    if (!pb || !pb.authStore.isValid) return;
    refresh();
    const schedule = () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => refresh(), 600);
    };
    const subs: Array<Promise<() => Promise<void>>> = [
      pb.collection('events').subscribe('*', schedule),
      pb.collection('memberships').subscribe('*', schedule),
      pb.collection('families').subscribe('*', schedule),
    ];
    const appState = AppState.addEventListener('change', (st) => {
      if (st === 'active') refresh();
    });
    return () => {
      appState.remove();
      subs.forEach((p) => p.then((unsub) => unsub()).catch(() => {}));
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
  }, [pb, userId, refresh]);

  const setCurrentFamily = useCallback(async (id: string) => {
    setCurrentId(id);
    await Storage.setItem(CURRENT_FAMILY_KEY, id);
  }, []);

  const onLoggedIn = useCallback(async () => {
    const client = await getPb();
    setServerUrl(await getSavedServerUrl());
    setPb(client);
    setAuthTick((t) => t + 1);
  }, []);

  const logout = useCallback(async () => {
    try {
      await pb?.realtime.unsubscribe();
    } catch {}
    pb?.authStore.clear();
    await clearCache();
    await Storage.removeItem(CURRENT_FAMILY_KEY);
    await Notifications.cancelAllScheduledNotificationsAsync().catch(() => {});
    setSnap(empty);
    setCurrentId('');
    setAuthTick((t) => t + 1);
  }, [pb]);

  const value = useMemo<StoreValue>(() => {
    const currentFamily = snap.families.find((f) => f.id === currentId) || snap.families[0] || null;
    const familyMembers = currentFamily ? snap.memberships.filter((m) => m.family === currentFamily.id) : [];
    const myMembership = familyMembers.find((m) => m.user === userId);
    return {
      ready,
      pb,
      serverUrl,
      userId,
      userEmail,
      families: snap.families,
      memberships: snap.memberships,
      events: currentFamily ? snap.events.filter((e) => e.family === currentFamily.id) : [],
      fetchedAt: snap.fetchedAt,
      loading,
      offline,
      currentFamily,
      familyMembers,
      myMembership,
      canWrite: !!myMembership && myMembership.role !== 'child',
      isAdmin: myMembership?.role === 'admin',
      membershipById: new Map(snap.memberships.map((m) => [m.id, m])),
      refresh,
      setCurrentFamily,
      onLoggedIn,
      logout,
    };
  }, [ready, pb, serverUrl, userId, userEmail, snap, currentId, loading, offline, refresh, setCurrentFamily, onLoggedIn, logout]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
