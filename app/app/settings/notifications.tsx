import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Switch } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { errorMessage } from '../../src/lib/pb';
import { localRemindersEnabled, rescheduleAll, setLocalRemindersEnabled } from '../../src/lib/notifications';
import { useStore } from '../../src/lib/store';
import type { Webhook } from '../../src/lib/types';
import { KINDS } from '../../src/lib/webhookKinds';
import { Divider, Group, Row, Screen, ToggleRow } from '../../src/ui/components';
import { useTheme } from '../../src/ui/theme';

export default function NotificationSettings() {
  const t = useTheme();
  const s = useStore();
  const [local, setLocal] = useState(true);
  const [hooks, setHooks] = useState<Webhook[]>([]);

  useEffect(() => {
    localRemindersEnabled().then(setLocal);
  }, []);

  const load = useCallback(async () => {
    if (!s.pb) return;
    try {
      setHooks(await s.pb.collection('webhooks').getFullList<Webhook>({ sort: 'name' }));
    } catch {}
  }, [s.pb]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const toggleLocal = async (on: boolean) => {
    const result = await setLocalRemindersEnabled(on);
    setLocal(result);
    if (on && !result) {
      Alert.alert('Benachrichtigungen sind blockiert', 'Erlaube Benachrichtigungen für FamilyCal in den Systemeinstellungen.', [
        { text: 'Abbrechen', style: 'cancel' },
        { text: 'Einstellungen öffnen', onPress: () => Linking.openSettings() },
      ]);
    }
    if (result) {
      rescheduleAll({ events: s.events, families: s.families, memberships: s.memberships, userId: s.userId }).catch(() => {});
    }
  };

  const toggleHook = async (h: Webhook, enabled: boolean) => {
    try {
      await s.pb!.collection('webhooks').update(h.id, { enabled });
      load();
    } catch (e) {
      Alert.alert('Nicht gespeichert', errorMessage(e));
    }
  };

  return (
    <Screen>
      <Group
        title="Auf diesem Gerät"
        footer="Die App plant Erinnerungen für die nächsten drei Wochen direkt auf dem Handy. Änderungen anderer siehst du nach dem nächsten Öffnen oder Hintergrund-Abgleich."
      >
        <ToggleRow label="Lokale Erinnerungen" value={local} onChange={toggleLocal} />
      </Group>

      <Group
        title="Benachrichtigungsziele"
        footer="Der Server schickt Erinnerungen und Änderungen sofort an diese Ziele – z. B. an die ntfy-App auf deinem Handy. Nutzt du beides, schalte für Erinnerungen eines davon ab, sonst kommen sie doppelt."
      >
        {hooks.map((h, i) => (
          <React.Fragment key={h.id}>
            {i ? <Divider /> : null}
            <Row
              label={h.name}
              detail={`${KINDS[h.kind]?.label || h.kind}${h.last_status ? ' · ' + h.last_status : ''}`}
              onPress={() => router.push({ pathname: '/settings/webhook', params: { id: h.id } })}
              right={<Switch value={h.enabled} onValueChange={(v) => toggleHook(h, v)} trackColor={{ true: t.accent }} />}
            />
          </React.Fragment>
        ))}
        {hooks.length ? <Divider /> : null}
        <Row icon="add" label="Ziel hinzufügen" onPress={() => router.push('/settings/webhook')} />
      </Group>
    </Screen>
  );
}
