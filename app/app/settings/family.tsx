import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, Share, Text, View } from 'react-native';
import { router } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import * as cal from '../../src/lib/calendar';
import { errorMessage } from '../../src/lib/pb';
import { useStore } from '../../src/lib/store';
import type { Invite, Membership, Role } from '../../src/lib/types';
import { Avatar, Button, Chip, ChipRow, Divider, Field, Group, Row, Screen } from '../../src/ui/components';
import { MEMBER_COLORS, space, type, useTheme } from '../../src/ui/theme';

const ROLE_LABEL: Record<Role, string> = { admin: 'Admin', member: 'Mitglied', child: 'Kind' };
const ROLE_HELP: Record<Role, string> = {
  admin: 'Termine, Mitglieder und Einladungen verwalten',
  member: 'Termine sehen und bearbeiten',
  child: 'Termine nur ansehen',
};

export default function FamilySettings() {
  const t = useTheme();
  const s = useStore();
  const fam = s.currentFamily;
  const [invites, setInvites] = useState<Invite[]>([]);
  const [inviteRole, setInviteRole] = useState<Role>('member');
  const [myName, setMyName] = useState(s.myMembership?.name || '');
  const [famName, setFamName] = useState(fam?.name || '');

  const loadInvites = useCallback(async () => {
    if (!s.pb || !fam || !s.isAdmin) return;
    try {
      setInvites(await s.pb.collection('invites').getFullList<Invite>({ filter: s.pb.filter('family = {:f}', { f: fam.id }), sort: '-created' }));
    } catch {}
  }, [s.pb, fam?.id, s.isAdmin]);

  useEffect(() => {
    loadInvites();
  }, [loadInvites]);

  if (!fam || !s.pb) return null;
  const pb = s.pb;

  const run = async (fn: () => Promise<any>, failTitle: string) => {
    try {
      await fn();
      await s.refresh();
    } catch (e) {
      Alert.alert(failTitle, errorMessage(e));
    }
  };

  const memberActions = (m: Membership) => {
    if (!s.isAdmin) return;
    const roles: Role[] = ['admin', 'member', 'child'];
    Alert.alert(m.name, `Aktuell: ${ROLE_LABEL[m.role]}`, [
      ...roles
        .filter((r) => r !== m.role)
        .map((r) => ({ text: `Zu ${ROLE_LABEL[r]} machen`, onPress: () => run(() => pb.collection('memberships').update(m.id, { role: r }), 'Rolle nicht geändert') })),
      ...(m.user !== s.userId
        ? [{ text: 'Aus Familie entfernen', style: 'destructive' as const, onPress: () => run(() => pb.collection('memberships').delete(m.id), 'Entfernen fehlgeschlagen') }]
        : []),
      { text: 'Abbrechen', style: 'cancel' as const },
    ]);
  };

  const createInvite = () =>
    run(async () => {
      const inv = await pb.collection('invites').create<Invite>({ family: fam.id, role: inviteRole, uses_left: 1 });
      await loadInvites();
      shareInvite(inv);
    }, 'Einladung fehlgeschlagen');

  const shareInvite = (inv: Invite) =>
    Share.share({
      message: `Du bist zu „${fam.name}" in FamilyCal eingeladen.\n\nServer: ${s.serverUrl}\nEinladungscode: ${inv.code}\n\nDer Code ist 7 Tage gültig.`,
    });

  const leave = () =>
    Alert.alert('Familie verlassen?', 'Du siehst danach keine Termine dieser Familie mehr.', [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Verlassen',
        style: 'destructive',
        onPress: () =>
          run(async () => {
            await pb.collection('memberships').delete(s.myMembership!.id);
            router.replace('/');
          }, 'Verlassen fehlgeschlagen'),
      },
    ]);

  const deleteFamily = () =>
    Alert.alert(`„${fam.name}" löschen?`, 'Alle Termine und Anhänge dieser Familie werden endgültig gelöscht.', [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Endgültig löschen',
        style: 'destructive',
        onPress: () =>
          run(async () => {
            await pb.collection('families').delete(fam.id);
            router.replace('/');
          }, 'Löschen fehlgeschlagen'),
      },
    ]);

  return (
    <Screen>
      {s.isAdmin ? (
        <Group title="Name der Familie">
          <Field
            value={famName}
            onChangeText={setFamName}
            onEndEditing={() => famName.trim() && famName !== fam.name && run(() => pb.collection('families').update(fam.id, { name: famName.trim() }), 'Umbenennen fehlgeschlagen')}
            maxLength={80}
          />
        </Group>
      ) : (
        <Text style={[type.day, { color: t.ink }]}>{fam.name}</Text>
      )}

      <Group title="Mitglieder" footer={s.isAdmin ? 'Tippe auf eine Person, um die Rolle zu ändern.' : undefined}>
        {s.familyMembers.map((m, i) => (
          <React.Fragment key={m.id}>
            {i ? <Divider /> : null}
            <Row
              label={m.name + (m.user === s.userId ? ' (du)' : '')}
              detail={`${ROLE_LABEL[m.role]} · ${ROLE_HELP[m.role]}`}
              right={<Avatar name={m.name} color={m.color} />}
              onPress={s.isAdmin ? () => memberActions(m) : undefined}
            />
          </React.Fragment>
        ))}
      </Group>

      {s.myMembership ? (
        <Group title="So erscheinst du">
          <Field
            value={myName}
            onChangeText={setMyName}
            onEndEditing={() => myName.trim() && run(() => pb.collection('memberships').update(s.myMembership!.id, { name: myName.trim() }), 'Name nicht gespeichert')}
            maxLength={40}
            placeholder="Dein Name"
          />
          <Divider />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.m, padding: space.l }}>
            {MEMBER_COLORS.map((c) => (
              <Pressable
                key={c}
                onPress={() => run(() => pb.collection('memberships').update(s.myMembership!.id, { color: c }), 'Farbe nicht gespeichert')}
                accessibilityLabel={`Farbe ${c}`}
                style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: c, borderWidth: 3, borderColor: s.myMembership!.color === c ? t.ink : 'transparent' }}
              />
            ))}
          </View>
        </Group>
      ) : null}

      {s.isAdmin ? (
        <Group title="Jemanden einladen" footer="Der Code gilt 7 Tage und einmalig. Die eingeladene Person braucht ein eigenes Konto auf deinem Server.">
          <ChipRow>
            {(['member', 'child', 'admin'] as Role[]).map((r) => (
              <Chip key={r} label={ROLE_LABEL[r]} selected={inviteRole === r} onPress={() => setInviteRole(r)} />
            ))}
          </ChipRow>
          <View style={{ padding: space.m, paddingTop: 0 }}>
            <Button title="Einladung erstellen und teilen" icon="share-outline" onPress={createInvite} />
          </View>
          {invites.map((inv) => (
            <React.Fragment key={inv.id}>
              <Divider />
              <Row
                label={inv.code.replace(/(.{5})/, '$1 ')}
                detail={`${ROLE_LABEL[inv.role]} · gültig bis ${cal.formatWhen(inv.expires, inv.expires, true).replace(' ganztägig', '')}`}
                onPress={() =>
                  Alert.alert('Einladung', inv.code, [
                    { text: 'Teilen', onPress: () => shareInvite(inv) },
                    { text: 'Code kopieren', onPress: () => Clipboard.setStringAsync(inv.code) },
                    { text: 'Widerrufen', style: 'destructive', onPress: () => run(async () => { await pb.collection('invites').delete(inv.id); await loadInvites(); }, 'Widerrufen fehlgeschlagen') },
                    { text: 'Abbrechen', style: 'cancel' },
                  ])
                }
              />
            </React.Fragment>
          ))}
        </Group>
      ) : null}

      <Group>
        {s.myMembership ? <Row icon="exit-outline" label="Familie verlassen" danger onPress={leave} /> : null}
        {fam.owner === s.userId ? (
          <>
            <Divider />
            <Row icon="trash-outline" label="Familie löschen" danger onPress={deleteFamily} />
          </>
        ) : null}
      </Group>
    </Screen>
  );
}
