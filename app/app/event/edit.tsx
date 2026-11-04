import React, { useEffect, useMemo, useState } from 'react';
import { ActionSheetIOS, Alert, KeyboardAvoidingView, Platform, Pressable, Text, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as cal from '../../src/lib/calendar';
import { REMINDER_LABELS, prettyFileName } from '../../src/lib/agenda';
import { errorMessage } from '../../src/lib/pb';
import { useStore } from '../../src/lib/store';
import type { CalEvent } from '../../src/lib/types';
import { Chip, ChipRow, Divider, Field, Group, Row, Screen, ToggleRow } from '../../src/ui/components';
import { DateTimeField } from '../../src/ui/DateTimeField';
import { space, type, useTheme } from '../../src/ui/theme';

type Repeat = 'none' | 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'YEARLY' | 'custom';
type NewFile = { uri: string; name: string; type: string; size?: number };

const MAX_FILE = 25 * 1024 * 1024;
const REPEAT_LABELS: [Repeat, string][] = [
  ['none', 'Nie'],
  ['DAILY', 'Täglich'],
  ['WEEKLY', 'Wöchentlich'],
  ['BIWEEKLY', 'Alle 2 Wochen'],
  ['MONTHLY', 'Monatlich'],
  ['YEARLY', 'Jährlich'],
];
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

function nextFullHour() {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return d;
}

export default function EditEvent() {
  const t = useTheme();
  const s = useStore();
  const params = useLocalSearchParams<{ id?: string; occ?: string; mode?: 'all' | 'single' }>();
  const source: CalEvent | undefined = params.id ? s.events.find((e) => e.id === params.id) : undefined;
  const single = params.mode === 'single' && !!source;
  const isNew = !source || single;

  const [title, setTitle] = useState('');
  const [allDay, setAllDay] = useState(false);
  const [start, setStart] = useState(nextFullHour());
  const [end, setEnd] = useState(new Date(nextFullHour().getTime() + 3600000));
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [participants, setParticipants] = useState<string[]>([]);
  const [repeat, setRepeat] = useState<Repeat>('none');
  const [byday, setByday] = useState<number[]>([]);
  const [until, setUntil] = useState<Date | null>(null);
  const [customRule, setCustomRule] = useState('');
  const [reminders, setReminders] = useState<number[]>([60]);
  const [isPrivate, setPrivate] = useState(false);
  const [existing, setExisting] = useState<string[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const [newFiles, setNewFiles] = useState<NewFile[]>([]);
  const [busy, setBusy] = useState(false);

  // Formular aus vorhandenem Termin füllen
  useEffect(() => {
    if (!source) {
      if (s.myMembership) setParticipants([s.myMembership.id]);
      return;
    }
    const st = cal.toDate(source.start)!;
    const en = cal.toDate(source.end)!;
    const dur = en.getTime() - st.getTime();
    const occStart = single && params.occ ? cal.toDate(params.occ)! : st;
    setTitle(source.title);
    setAllDay(source.all_day);
    setStart(occStart);
    setEnd(source.all_day ? new Date(occStart.getTime() + dur - 1) : new Date(occStart.getTime() + dur));
    setLocation(source.location || '');
    setNotes(source.notes || '');
    setParticipants(source.participants || []);
    setReminders(source.reminders || []);
    setPrivate(source.private);
    if (!single) {
      setExisting(source.attachments || []);
      const r = cal.parseRRule(source.rrule || '');
      if (r) {
        if (r.freq === 'WEEKLY' && r.interval === 2) setRepeat('BIWEEKLY');
        else if (r.interval === 1) setRepeat(r.freq);
        else setRepeat('custom');
        setByday(r.byday);
        setUntil(r.until);
        if (r.count || (r.interval > 1 && !(r.freq === 'WEEKLY' && r.interval === 2))) {
          setRepeat('custom');
        }
        setCustomRule(source.rrule);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source?.id]);

  const rrule = useMemo(() => {
    if (repeat === 'none') return '';
    if (repeat === 'custom') return customRule;
    const freq = repeat === 'BIWEEKLY' ? 'WEEKLY' : repeat;
    const days = freq === 'WEEKLY' && byday.length ? byday : [];
    return cal.buildRRule({ freq, interval: repeat === 'BIWEEKLY' ? 2 : 1, byday: days, until });
  }, [repeat, byday, until, customRule]);

  const changeStart = (d: Date) => {
    const dur = end.getTime() - start.getTime();
    setStart(d);
    setEnd(new Date(d.getTime() + Math.max(0, dur)));
  };

  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const addFiles = (files: NewFile[]) => {
    const tooBig = files.filter((f) => f.size && f.size > MAX_FILE);
    if (tooBig.length) Alert.alert('Datei zu groß', `${tooBig.map((f) => f.name).join(', ')} ist größer als 25 MB.`);
    const ok = files.filter((f) => !f.size || f.size <= MAX_FILE);
    const free = 10 - (existing.length - removed.length) - newFiles.length;
    if (ok.length > free) Alert.alert('Zu viele Anhänge', 'Pro Termin sind maximal 10 Anhänge möglich.');
    setNewFiles((n) => [...n, ...ok.slice(0, Math.max(0, free))]);
  };

  const pickPhoto = async (camera: boolean) => {
    if (camera) {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) return Alert.alert('Kein Kamerazugriff', 'Erlaube den Kamerazugriff in den Systemeinstellungen.');
    }
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.7, allowsMultipleSelection: !camera, selectionLimit: 5 };
    const res = camera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    if (res.canceled) return;
    addFiles(
      res.assets.map((a, i) => ({
        uri: a.uri,
        name: a.fileName || `foto_${Date.now()}_${i}.jpg`,
        type: a.mimeType || 'image/jpeg',
        size: a.fileSize,
      }))
    );
  };

  const pickDocument = async () => {
    const res = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true });
    if (res.canceled) return;
    addFiles(res.assets.map((a) => ({ uri: a.uri, name: a.name, type: a.mimeType || 'application/octet-stream', size: a.size })));
  };

  const addAttachment = () => {
    const actions = [
      { label: 'Foto aufnehmen', run: () => pickPhoto(true) },
      { label: 'Foto auswählen', run: () => pickPhoto(false) },
      { label: 'Datei auswählen (PDF …)', run: pickDocument },
    ];
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions({ options: [...actions.map((a) => a.label), 'Abbrechen'], cancelButtonIndex: actions.length }, (i) => actions[i]?.run());
    } else {
      Alert.alert('Anhang hinzufügen', undefined, [...actions.map((a) => ({ text: a.label, onPress: a.run })), { text: 'Abbrechen', style: 'cancel' as const }]);
    }
  };

  const save = async () => {
    if (!s.pb || !s.currentFamily) return;
    if (!title.trim()) return Alert.alert('Bitte einen Titel eingeben.');
    let st = start;
    let en = end;
    if (allDay) {
      st = cal.startOfDayLocal(start);
      en = cal.addDaysLocal(cal.startOfDayLocal(end < start ? start : end), 1); // Ende exklusiv
    } else if (en.getTime() < st.getTime()) {
      return Alert.alert('Das Ende liegt vor dem Beginn.');
    }

    const data: Record<string, any> = {
      family: source?.family || s.currentFamily.id,
      title: title.trim(),
      notes: notes.trim(),
      location: location.trim(),
      start: cal.toPbDate(st),
      end: cal.toPbDate(en),
      all_day: allDay,
      rrule: single ? '' : rrule,
      participants,
      reminders,
      private: isPrivate,
    };

    setBusy(true);
    try {
      const col = s.pb.collection('events');
      let body: any = data;
      if (newFiles.length || removed.length) {
        const fd = new FormData();
        for (const [k, v] of Object.entries(data)) {
          if (k === 'participants') {
            if (v.length) v.forEach((p: string) => fd.append('participants', p));
            else fd.append('participants', '');
          } else if (k === 'reminders') fd.append('reminders', JSON.stringify(v));
          else fd.append(k, typeof v === 'boolean' ? String(v) : v);
        }
        for (const f of newFiles) fd.append(isNew ? 'attachments' : 'attachments+', { uri: f.uri, name: f.name, type: f.type } as any);
        for (const r of removed) fd.append('attachments-', r);
        body = fd;
      }

      if (isNew) {
        await col.create(body);
        if (single && source && params.occ) {
          // Ausnahme in der Serie eintragen
          await col.update(source.id, { exdates: [...(source.exdates || []), cal.occurrenceKey(params.occ)] });
        }
      } else {
        await col.update(source!.id, body);
      }
      await s.refresh();
      router.back();
    } catch (e) {
      Alert.alert('Speichern fehlgeschlagen', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const visibleExisting = existing.filter((n) => !removed.includes(n));

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen
        options={{
          title: source && !single ? 'Termin bearbeiten' : single ? 'Einzelnen Termin ändern' : 'Neuer Termin',
          headerLeft: () => (
            <Pressable onPress={() => router.back()} hitSlop={12}>
              <Text style={[type.body, { color: t.accent }]}>Abbrechen</Text>
            </Pressable>
          ),
          headerRight: () => (
            <Pressable onPress={save} disabled={busy} hitSlop={12}>
              <Text style={[type.title, { color: busy ? t.muted : t.accent }]}>{busy ? 'Speichert …' : 'Sichern'}</Text>
            </Pressable>
          ),
        }}
      />
      <Screen>
        <Group>
          <Field value={title} onChangeText={setTitle} placeholder="Titel, z. B. Zahnarzt Lea" maxLength={200} style={{ fontSize: 18, fontWeight: '600' }} autoFocus={!source} />
          <Divider />
          <Field value={location} onChangeText={setLocation} placeholder="Ort (optional)" maxLength={300} />
        </Group>

        <Group>
          <ToggleRow label="Ganztägig" value={allDay} onChange={setAllDay} />
          <Divider />
          <DateTimeField label="Beginn" value={start} onChange={changeStart} withTime={!allDay} />
          <Divider />
          <DateTimeField label="Ende" value={end} onChange={setEnd} withTime={!allDay} minimumDate={allDay ? cal.startOfDayLocal(start) : start} />
        </Group>

        <Group title="Wer ist dabei?" footer="Ohne Auswahl gilt der Termin für die ganze Familie.">
          <ChipRow>
            <Chip label="Alle" selected={participants.length === 0} onPress={() => setParticipants([])} />
            {s.familyMembers.map((m) => (
              <Chip key={m.id} label={m.name} color={m.color} selected={participants.includes(m.id)} onPress={() => setParticipants((p) => toggle(p, m.id))} />
            ))}
          </ChipRow>
        </Group>

        {!single ? (
          <Group title="Wiederholen">
            <ChipRow>
              {REPEAT_LABELS.map(([k, label]) => (
                <Chip key={k} label={label} selected={repeat === k} onPress={() => setRepeat(k)} />
              ))}
              {repeat === 'custom' ? <Chip label={cal.describeRRule(customRule)} selected /> : null}
            </ChipRow>
            {repeat === 'WEEKLY' || repeat === 'BIWEEKLY' ? (
              <>
                <Divider />
                <ChipRow>
                  {WEEK_ORDER.map((d) => (
                    <Chip key={d} label={cal.WEEKDAY_DE_SHORT[d]} selected={byday.length ? byday.includes(d) : d === start.getDay()} onPress={() => setByday((b) => toggle(b.length ? b : [start.getDay()], d))} />
                  ))}
                </ChipRow>
              </>
            ) : null}
            {repeat !== 'none' && repeat !== 'custom' ? (
              <>
                <Divider />
                <ToggleRow label="Endet an einem Datum" value={!!until} onChange={(v) => setUntil(v ? cal.addDaysLocal(start, 90) : null)} />
                {until ? <DateTimeField label="Letzter Tag" value={until} onChange={setUntil} withTime={false} minimumDate={start} /> : null}
              </>
            ) : null}
          </Group>
        ) : null}

        <Group title="Erinnern" footer="Erinnert alle Beteiligten – auf dem Handy und über eingerichtete Benachrichtigungsziele.">
          <ChipRow>
            <Chip label="Keine" selected={reminders.length === 0} onPress={() => setReminders([])} />
            {cal.REMINDER_OPTIONS.map((m) => (
              <Chip key={m} label={REMINDER_LABELS[m]} selected={reminders.includes(m)} onPress={() => setReminders((r) => toggle(r, m))} />
            ))}
          </ChipRow>
        </Group>

        <Group title="Notizen">
          <Field value={notes} onChangeText={setNotes} placeholder="Was mitbringen, Infos, Telefonnummern …" multiline maxLength={10000} />
        </Group>

        <Group title="Anhänge" footer={single ? 'Anhänge der Serie bleiben an der Serie. Hier kannst du neue für diesen Termin hinzufügen.' : 'Fotos, PDFs, Dokumente – bis 25 MB pro Datei.'}>
          {visibleExisting.map((n) => (
            <React.Fragment key={n}>
              <Row icon="document-attach-outline" label={prettyFileName(n)} right={<RemoveButton onPress={() => setRemoved((r) => [...r, n])} />} />
              <Divider />
            </React.Fragment>
          ))}
          {newFiles.map((f, i) => (
            <React.Fragment key={f.uri + i}>
              <Row icon="cloud-upload-outline" label={f.name} detail="Wird beim Sichern hochgeladen" right={<RemoveButton onPress={() => setNewFiles((n) => n.filter((_, j) => j !== i))} />} />
              <Divider />
            </React.Fragment>
          ))}
          <Row icon="add-circle-outline" label="Anhang hinzufügen" onPress={addAttachment} />
        </Group>

        <Group>
          <ToggleRow label="Privat" detail="Nur du siehst diesen Termin." value={isPrivate} onChange={setPrivate} />
        </Group>
        <View style={{ height: space.xl }} />
      </Screen>
    </KeyboardAvoidingView>
  );
}

function RemoveButton({ onPress }: { onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} hitSlop={10} accessibilityLabel="Entfernen">
      <Ionicons name="close-circle" size={22} color={t.muted} />
    </Pressable>
  );
}
