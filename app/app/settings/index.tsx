import React from 'react';
import { Alert, Text } from 'react-native';
import { router } from 'expo-router';
import Constants from 'expo-constants';
import { useStore } from '../../src/lib/store';
import { Avatar, Divider, Group, Row, Screen } from '../../src/ui/components';
import { space, type, useTheme } from '../../src/ui/theme';

const ROLE_LABEL = { admin: 'Admin', member: 'Mitglied', child: 'Kind (nur lesen)' };

export default function Settings() {
  const t = useTheme();
  const s = useStore();

  const logout = () =>
    Alert.alert('Abmelden?', 'Lokale Erinnerungen auf diesem Gerät werden entfernt.', [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Abmelden',
        style: 'destructive',
        onPress: async () => {
          await s.logout();
          router.replace('/login');
        },
      },
    ]);

  return (
    <Screen>
      <Group title="Familien">
        {s.families.map((f, i) => {
          const me = s.memberships.find((m) => m.family === f.id && m.user === s.userId);
          const current = f.id === s.currentFamily?.id;
          return (
            <React.Fragment key={f.id}>
              {i ? <Divider /> : null}
              <Row
                label={f.name}
                detail={me ? ROLE_LABEL[me.role] : undefined}
                right={current ? <Text style={[type.label, { color: t.accent }]}>Aktiv</Text> : undefined}
                onPress={async () => {
                  await s.setCurrentFamily(f.id);
                  router.push('/settings/family');
                }}
              />
            </React.Fragment>
          );
        })}
        <Divider />
        <Row icon="add" label="Familie beitreten oder anlegen" onPress={() => router.push('/onboarding')} />
      </Group>

      <Group title="Benachrichtigungen">
        <Row icon="notifications-outline" label="Erinnerungen und Benachrichtigungsziele" onPress={() => router.push('/settings/notifications')} />
      </Group>

      <Group title="Konto">
        {s.myMembership ? (
          <Row label={s.myMembership.name} detail={s.userEmail} right={<Avatar name={s.myMembership.name} color={s.myMembership.color} />} />
        ) : (
          <Row label={s.userEmail} />
        )}
        <Divider />
        <Row icon="server-outline" label="Server" value={s.serverUrl.replace(/^https?:\/\//, '')} />
        <Divider />
        <Row icon="log-out-outline" label="Abmelden" danger onPress={logout} />
      </Group>

      <Text style={[type.small, { color: t.muted, textAlign: 'center', marginTop: space.s }]}>
        FamilyCal {Constants.expoConfig?.version || ''}
      </Text>
    </Screen>
  );
}
