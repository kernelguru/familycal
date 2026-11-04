import React, { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, Text } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { errorMessage } from '../../src/lib/pb';
import { useStore } from '../../src/lib/store';
import type { Webhook, WebhookEventType, WebhookKind } from '../../src/lib/types';
import { EVENT_LABELS, KINDS } from '../../src/lib/webhookKinds';
import { Button, Chip, ChipRow, Divider, Field, Group, Row, Screen, ToggleRow } from '../../src/ui/components';
import { space, type, useTheme } from '../../src/ui/theme';

const ALL_EVENTS: WebhookEventType[] = ['reminder', 'created', 'updated', 'deleted'];

function randomSecret() {
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 32; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export default function WebhookEdit() {
  const t = useTheme();
  const s = useStore();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [loaded, setLoaded] = useState(!id);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<WebhookKind>('ntfy');
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const [target, setTarget] = useState('');
  const [secret, setSecret] = useState('');
  const [events, setEvents] = useState<WebhookEventType[]>(['reminder', 'created', 'updated', 'deleted']);
  const [family, setFamily] = useState('');
  const [onlyMine, setOnlyMine] = useState(true);
  const [enabled, setEnabled] = useState(true);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState<'save' | 'test' | null>(null);

  useEffect(() => {
    if (!id || !s.pb) return;
    s.pb
      .collection('webhooks')
      .getOne<Webhook>(id)
      .then((h) => {
        setName(h.name);
        setKind(h.kind);
        setUrl(h.url);
        setToken(h.token);
        setTarget(h.target);
        setSecret(h.secret);
        setEvents(h.events || []);
        setFamily(h.family || '');
        setOnlyMine(h.only_participating);
        setEnabled(h.enabled);
        setStatus(h.last_status);
        setLoaded(true);
      })
      .catch((e) => Alert.alert('Nicht gefunden', errorMessage(e)));
  }, [id, s.pb]);

  const spec = KINDS[kind];

  const persist = async (): Promise<string | null> => {
    if (!s.pb) return null;
    const data = {
      user: s.userId,
      name: name.trim() || spec.label,
      kind,
      url: spec.url ? url.trim() : '',
      token: spec.token ? token.trim() : '',
      target: spec.target ? target.trim() : '',
      secret: spec.secret ? secret.trim() : '',
      events,
      family,
      only_participating: onlyMine,
      enabled,
    };
    if (id) {
      const { user, ...rest } = data;
      await s.pb.collection('webhooks').update(id, rest);
      return id;
    }
    const rec = await s.pb.collection('webhooks').create(data);
    return rec.id;
  };

  const save = async () => {
    setBusy('save');
    try {
      await persist();
      router.back();
    } catch (e) {
      Alert.alert('Nicht gespeichert', errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const test = async () => {
    setBusy('test');
    try {
      const savedId = await persist();
      const res = await s.pb!.send(`/api/familycal/webhooks/${savedId}/test`, { method: 'POST' });
      setStatus(res.ok ? `OK (HTTP ${res.status})` : `Fehler: ${res.error}`);
      if (!id && savedId) router.setParams({ id: savedId });
      Alert.alert(res.ok ? 'Testnachricht verschickt' : 'Test fehlgeschlagen', res.ok ? 'Prüfe, ob sie angekommen ist.' : res.error);
    } catch (e) {
      Alert.alert('Test fehlgeschlagen', errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const remove = () =>
    Alert.alert('Ziel löschen?', undefined, [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Löschen',
        style: 'destructive',
        onPress: async () => {
          try {
            await s.pb!.collection('webhooks').delete(id!);
            router.back();
          } catch (e) {
            Alert.alert('Löschen fehlgeschlagen', errorMessage(e));
          }
        },
      },
    ]);

  if (!loaded) return null;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen
        options={{
          title: id ? 'Ziel bearbeiten' : 'Neues Ziel',
          headerLeft: () => (
            <Pressable onPress={() => router.back()} hitSlop={12}>
              <Text style={[type.body, { color: t.accent }]}>Abbrechen</Text>
            </Pressable>
          ),
          headerRight: () => (
            <Pressable onPress={save} disabled={!!busy} hitSlop={12}>
              <Text style={[type.title, { color: busy ? t.muted : t.accent }]}>Sichern</Text>
            </Pressable>
          ),
        }}
      />
      <Screen>
        <Group title="Dienst" footer={spec.help}>
          <ChipRow>
            {(Object.keys(KINDS) as WebhookKind[]).map((k) => (
              <Chip key={k} label={KINDS[k].label} selected={kind === k} onPress={() => setKind(k)} />
            ))}
          </ChipRow>
        </Group>

        <Group>
          <Field label="Name" value={name} onChangeText={setName} placeholder={`z. B. ${spec.label} Handy`} maxLength={60} />
          {spec.url ? (
            <>
              <Divider />
              <Field label={spec.url.label} value={url} onChangeText={setUrl} placeholder={spec.url.placeholder} autoCapitalize="none" autoCorrect={false} keyboardType="url" />
            </>
          ) : null}
          {spec.token ? (
            <>
              <Divider />
              <Field label={spec.token.label} value={token} onChangeText={setToken} placeholder={spec.token.placeholder} autoCapitalize="none" autoCorrect={false} secureTextEntry />
            </>
          ) : null}
          {spec.target ? (
            <>
              <Divider />
              <Field label={spec.target.label} value={target} onChangeText={setTarget} placeholder={spec.target.placeholder} autoCapitalize="none" autoCorrect={false} />
            </>
          ) : null}
          {spec.secret ? (
            <>
              <Divider />
              <Field label="Geheimnis zum Signieren (optional)" value={secret} onChangeText={setSecret} autoCapitalize="none" autoCorrect={false} />
              <Row label="Zufälliges Geheimnis erzeugen" icon="key-outline" onPress={() => setSecret(randomSecret())} />
            </>
          ) : null}
        </Group>

        <Group title="Was soll ankommen?">
          <ChipRow>
            {ALL_EVENTS.map((e) => (
              <Chip key={e} label={EVENT_LABELS[e]} selected={events.includes(e)} onPress={() => setEvents((l) => (l.includes(e) ? l.filter((x) => x !== e) : [...l, e]))} />
            ))}
          </ChipRow>
          <Divider />
          <ToggleRow label="Nur Termine, bei denen ich dabei bin" detail="Termine für die ganze Familie zählen immer dazu." value={onlyMine} onChange={setOnlyMine} />
        </Group>

        {s.families.length > 1 ? (
          <Group title="Für welche Familie?">
            <ChipRow>
              <Chip label="Alle" selected={!family} onPress={() => setFamily('')} />
              {s.families.map((f) => (
                <Chip key={f.id} label={f.name} selected={family === f.id} onPress={() => setFamily(f.id)} />
              ))}
            </ChipRow>
          </Group>
        ) : null}

        <Group footer={status ? `Letzter Versand: ${status}` : undefined}>
          <ToggleRow label="Aktiv" value={enabled} onChange={setEnabled} />
        </Group>

        <Button title="Sichern und Testnachricht senden" kind="secondary" icon="paper-plane-outline" onPress={test} loading={busy === 'test'} />
        {id ? <Button title="Ziel löschen" kind="danger" onPress={remove} /> : null}
        <Text style={{ height: space.l }} />
      </Screen>
    </KeyboardAvoidingView>
  );
}
