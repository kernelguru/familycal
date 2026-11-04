import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, Linking, Platform, Pressable, Text, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import * as cal from '../../src/lib/calendar';
import { REMINDER_LABELS, prettyFileName } from '../../src/lib/agenda';
import { errorMessage } from '../../src/lib/pb';
import { useStore } from '../../src/lib/store';
import type { CalEvent } from '../../src/lib/types';
import { Avatar, Divider, Group, Row, Screen } from '../../src/ui/components';
import { radius, space, type, useTheme } from '../../src/ui/theme';

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|heic|heif)$/i;

export default function EventDetail() {
  const t = useTheme();
  const s = useStore();
  const { id, occ } = useLocalSearchParams<{ id: string; occ?: string }>();
  const [remote, setRemote] = useState<CalEvent | null>(null);
  const [fileToken, setFileToken] = useState('');
  const [missing, setMissing] = useState(false);

  const local = s.events.find((e) => e.id === id) || null;
  const ev = local || remote;

  useEffect(() => {
    if (!s.pb) return;
    if (!local) {
      s.pb.collection('events').getOne<CalEvent>(id).then(setRemote).catch(() => setMissing(true));
    }
  }, [id, local, s.pb]);

  useEffect(() => {
    if (s.pb && ev?.attachments?.length) s.pb.files.getToken().then(setFileToken).catch(() => {});
  }, [s.pb, ev?.id, ev?.attachments?.length]);

  // Konkretes Vorkommen (bei Wiederholungen) bestimmen
  const when = useMemo(() => {
    if (!ev) return null;
    const occStart = occ ? cal.toDate(occ) : null;
    if (occStart && ev.rrule) {
      const dur = cal.toDate(ev.end)!.getTime() - cal.toDate(ev.start)!.getTime();
      return { start: occStart, end: new Date(occStart.getTime() + dur) };
    }
    return { start: cal.toDate(ev.start)!, end: cal.toDate(ev.end)! };
  }, [ev, occ]);

  if (missing) {
    return (
      <Screen>
        <Text style={[type.body, { color: t.muted }]}>Dieser Termin wurde gelöscht oder du hast keinen Zugriff mehr.</Text>
      </Screen>
    );
  }
  if (!ev || !when) return <ActivityIndicator style={{ marginTop: 48 }} />;

  const members = (ev.participants || []).map((p) => s.membershipById.get(p)).filter(Boolean) as any[];
  const creator = s.memberships.find((m) => m.family === ev.family && m.user === ev.created_by);
  const canEdit = s.canWrite && (!ev.private || ev.created_by === s.userId);
  const isRecurring = !!ev.rrule;
  const occKey = occ || cal.occurrenceKey(when.start);

  const askScope = (title: string, onSingle: () => void, onAll: () => void) => {
    if (!isRecurring) return onAll();
    Alert.alert(title, 'Dieser Termin wiederholt sich.', [
      { text: 'Nur diesen Termin', onPress: onSingle },
      { text: 'Alle Termine der Serie', onPress: onAll },
      { text: 'Abbrechen', style: 'cancel' },
    ]);
  };

  const edit = () =>
    askScope(
      'Was möchtest du bearbeiten?',
      () => router.push({ pathname: '/event/edit', params: { id: ev.id, occ: occKey, mode: 'single' } }),
      () => router.push({ pathname: '/event/edit', params: { id: ev.id, mode: 'all' } })
    );

  const remove = () => {
    const doDeleteAll = () =>
      Alert.alert(isRecurring ? 'Ganze Serie löschen?' : 'Termin löschen?', 'Anhänge werden ebenfalls gelöscht.', [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Löschen',
          style: 'destructive',
          onPress: async () => {
            try {
              await s.pb!.collection('events').delete(ev.id);
              await s.refresh();
              router.back();
            } catch (e) {
              Alert.alert('Löschen fehlgeschlagen', errorMessage(e));
            }
          },
        },
      ]);
    const doDeleteSingle = async () => {
      try {
        await s.pb!.collection('events').update(ev.id, { exdates: [...(ev.exdates || []), occKey] });
        await s.refresh();
        router.back();
      } catch (e) {
        Alert.alert('Löschen fehlgeschlagen', errorMessage(e));
      }
    };
    askScope('Was möchtest du löschen?', doDeleteSingle, doDeleteAll);
  };

  const openFile = async (name: string) => {
    try {
      const token = await s.pb!.files.getToken();
      await WebBrowser.openBrowserAsync(s.pb!.files.getURL(ev, name, { token }));
    } catch (e) {
      Alert.alert('Datei kann nicht geöffnet werden', errorMessage(e));
    }
  };

  const openMap = () => {
    const q = encodeURIComponent(ev.location);
    Linking.openURL(Platform.OS === 'ios' ? `maps:?q=${q}` : `geo:0,0?q=${q}`).catch(() => {});
  };

  return (
    <Screen>
      <Stack.Screen
        options={{
          headerRight: canEdit
            ? () => (
                <Pressable onPress={edit} hitSlop={12}>
                  <Text style={[type.title, { color: t.accent }]}>Bearbeiten</Text>
                </Pressable>
              )
            : undefined,
        }}
      />

      <View style={{ gap: 6 }}>
        <Text style={[type.dayHero, { color: t.ink, fontSize: 26 }]} selectable>
          {ev.title}
        </Text>
        <Text style={[type.title, { color: t.ink, fontWeight: '500' }]}>{cal.formatWhen(when.start, when.end, ev.all_day)}</Text>
        {isRecurring ? (
          <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
            <Ionicons name="repeat" size={15} color={t.muted} />
            <Text style={[type.small, { color: t.muted }]}>{cal.describeRRule(ev.rrule)}</Text>
          </View>
        ) : null}
      </View>

      <Group>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s, padding: space.l }}>
          {members.length ? (
            members.map((m) => (
              <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Avatar name={m.name} color={m.color} size={26} />
                <Text style={[type.body, { color: t.ink }]}>{m.name}</Text>
              </View>
            ))
          ) : (
            <Text style={[type.body, { color: t.ink }]}>Ganze Familie</Text>
          )}
        </View>
        {ev.location ? (
          <>
            <Divider />
            <Row icon="location-outline" label={ev.location} onPress={openMap} />
          </>
        ) : null}
        {ev.reminders?.length ? (
          <>
            <Divider />
            <Row
              icon="notifications-outline"
              label={ev.reminders
                .slice()
                .sort((a, b) => a - b)
                .map((m) => (m === 0 ? 'Zu Beginn' : `${REMINDER_LABELS[m] || m + ' Min'} vorher`))
                .join(', ')}
            />
          </>
        ) : null}
        {ev.private ? (
          <>
            <Divider />
            <Row icon="lock-closed-outline" label="Privat – nur für dich sichtbar" />
          </>
        ) : null}
      </Group>

      {ev.notes ? (
        <Group title="Notizen">
          <Text style={[type.body, { color: t.ink, padding: space.l }]} selectable>
            {ev.notes}
          </Text>
        </Group>
      ) : null}

      {ev.attachments?.length ? (
        <Group title={`Anhänge (${ev.attachments.length})`}>
          {ev.attachments.map((name, i) => (
            <React.Fragment key={name}>
              {i ? <Divider /> : null}
              <Pressable onPress={() => openFile(name)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.m, padding: space.m, backgroundColor: pressed ? t.surfaceAlt : 'transparent' })}>
                {IMAGE_EXT.test(name) && fileToken ? (
                  <Image source={{ uri: s.pb!.files.getURL(ev, name, { token: fileToken, thumb: '240x240' }) }} style={{ width: 48, height: 48, borderRadius: radius.s, backgroundColor: t.surfaceAlt }} />
                ) : (
                  <View style={{ width: 48, height: 48, borderRadius: radius.s, backgroundColor: t.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name={/\.pdf$/i.test(name) ? 'document-text-outline' : 'document-outline'} size={24} color={t.muted} />
                  </View>
                )}
                <Text style={[type.body, { color: t.ink, flex: 1 }]} numberOfLines={2}>
                  {prettyFileName(name)}
                </Text>
                <Ionicons name="open-outline" size={18} color={t.muted} />
              </Pressable>
            </React.Fragment>
          ))}
        </Group>
      ) : null}

      <Text style={[type.small, { color: t.muted, marginHorizontal: space.xs }]}>
        {creator ? `Eingetragen von ${creator.name}` : ''}
        {ev.updated ? ` · geändert ${new Date(cal.toDate(ev.updated)!).toLocaleDateString('de-DE')}` : ''}
      </Text>

      {canEdit ? (
        <Group>
          <Row icon="trash-outline" label="Termin löschen" danger onPress={remove} />
        </Group>
      ) : null}
    </Screen>
  );
}
