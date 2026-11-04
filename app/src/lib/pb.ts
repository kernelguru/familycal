/**
 * PocketBase-Client: Token sicher im Keychain/Keystore (expo-secure-store),
 * Server-URL in der lokalen KV-Datenbank, Realtime über react-native-sse.
 */
import PocketBase, { AsyncAuthStore } from 'pocketbase';
import * as SecureStore from 'expo-secure-store';
import Storage from 'expo-sqlite/kv-store';
import EventSource from 'react-native-sse';

// PocketBase-Realtime braucht eine EventSource-Implementierung
(globalThis as any).EventSource = EventSource;

const AUTH_KEY = 'familycal_auth';
const URL_KEY = 'familycal_server_url';

let client: PocketBase | null = null;
let clientUrl = '';

export function normalizeUrl(input: string): string {
  let u = input.trim().replace(/\/+$/, '');
  if (u && !/^https?:\/\//i.test(u)) u = 'https://' + u;
  return u;
}

export function isAllowedUrl(u: string): boolean {
  // HTTPS Pflicht; HTTP nur im Heimnetz zum Testen
  return /^https:\/\//i.test(u) || /^http:\/\/(localhost|127\.0\.0\.1|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(u);
}

export async function getSavedServerUrl(): Promise<string> {
  return (await Storage.getItem(URL_KEY)) || '';
}

async function makeClient(url: string): Promise<PocketBase> {
  // Token vorher laden, damit der Client sofort angemeldet ist
  const initial = (await SecureStore.getItemAsync(AUTH_KEY)) || '';
  const store = new AsyncAuthStore({
    save: async (serialized) => SecureStore.setItemAsync(AUTH_KEY, serialized),
    clear: async () => SecureStore.deleteItemAsync(AUTH_KEY),
    initial,
  });
  const pb = new PocketBase(url, store);
  pb.autoCancellation(false);
  return pb;
}

/** Liefert den Client für die gespeicherte Server-URL (oder null, wenn noch keine). */
export async function getPb(): Promise<PocketBase | null> {
  const url = await getSavedServerUrl();
  if (!url) return null;
  if (!client || clientUrl !== url) {
    client = await makeClient(url);
    clientUrl = url;
  }
  return client;
}

/** Synchroner Zugriff nach der Initialisierung. */
export function pbOrThrow(): PocketBase {
  if (!client) throw new Error('Nicht verbunden');
  return client;
}

export async function setServerUrl(url: string): Promise<PocketBase> {
  const u = normalizeUrl(url);
  if (!isAllowedUrl(u)) throw new Error('Bitte eine HTTPS-Adresse verwenden.');
  if (client && clientUrl !== u) {
    client.realtime.unsubscribe().catch(() => {});
    client.authStore.clear();
  }
  await Storage.setItem(URL_KEY, u);
  client = await makeClient(u);
  clientUrl = u;
  return client;
}

/** Lesbare Fehlermeldung aus einem PocketBase-Fehler. */
export function errorMessage(e: any): string {
  if (!e) return 'Unbekannter Fehler';
  const data = e?.response?.data;
  if (data && typeof data === 'object') {
    const first = Object.keys(data)[0];
    if (first && data[first]?.message) return `${first}: ${data[first].message}`;
  }
  if (e?.response?.message) return e.response.message;
  if (e?.status === 0) return 'Server nicht erreichbar.';
  return e?.message || String(e);
}
