import React, { useState } from 'react';
import { Alert, Text } from 'react-native';
import { router } from 'expo-router';
import { errorMessage } from '../src/lib/pb';
import { useStore } from '../src/lib/store';
import { Button, Field, Group, Screen } from '../src/ui/components';
import { type, useTheme } from '../src/ui/theme';

export default function Onboarding() {
  const t = useTheme();
  const { pb, refresh, setCurrentFamily, families } = useStore();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<'create' | 'join' | null>(null);

  const done = async (familyId: string) => {
    await setCurrentFamily(familyId);
    await refresh();
    router.replace('/');
  };

  const create = async () => {
    if (!pb || !name.trim()) return;
    setBusy('create');
    try {
      const fam = await pb.collection('families').create({ name: name.trim() });
      await done(fam.id);
    } catch (e) {
      Alert.alert('Familie konnte nicht angelegt werden', errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const join = async () => {
    if (!pb || !code.trim()) return;
    setBusy('join');
    try {
      const res = await pb.send('/api/familycal/join', { method: 'POST', body: { code: code.trim() } });
      await done(res.family);
    } catch (e) {
      Alert.alert('Beitritt fehlgeschlagen', errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen>
      {families.length === 0 ? (
        <Text style={[type.body, { color: t.muted }]}>
          Lege eine Familie an oder tritt mit einem Einladungscode einer bestehenden bei.
        </Text>
      ) : null}

      <Group title="Einladungscode" footer="Den Code bekommst du von einem Admin der Familie.">
        <Field value={code} onChangeText={(v) => setCode(v.toUpperCase())} placeholder="z. B. K7P2M9QXRT" autoCapitalize="characters" autoCorrect={false} maxLength={12} />
      </Group>
      <Button title="Familie beitreten" onPress={join} loading={busy === 'join'} disabled={!code.trim()} kind="secondary" icon="enter-outline" />

      <Group title="Neue Familie">
        <Field value={name} onChangeText={setName} placeholder="z. B. Familie Klein" maxLength={80} />
      </Group>
      <Button title="Familie anlegen" onPress={create} loading={busy === 'create'} disabled={!name.trim()} icon="add" />
    </Screen>
  );
}
