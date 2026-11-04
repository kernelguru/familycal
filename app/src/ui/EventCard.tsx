import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Membership, Occurrence } from '../lib/types';
import { timeLabel } from '../lib/agenda';
import { Avatar } from './components';
import { radius, space, type, useTheme } from './theme';

/**
 * Ein Termin in der Agenda. Links die farbigen "Spalten" der beteiligten
 * Personen – wie beim Papier-Familienplaner. Ohne Teilnehmer: ganze Familie.
 */
export function EventCard({
  occ,
  day,
  members,
  onPress,
}: {
  occ: Occurrence;
  day: Date;
  members: Membership[]; // Teilnehmer dieses Termins (leer = alle)
  onPress: () => void;
}) {
  const t = useTheme();
  const ev = occ.event;
  const time = timeLabel(occ, day);
  const lanes = members.length ? members.map((m) => m.color || t.muted) : [t.muted + '55'];
  const past = occ.end.getTime() < Date.now() && !ev.all_day;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${ev.title}, ${ev.all_day ? 'ganztägig' : time.top}`}
      style={({ pressed }) => [styles.card, { backgroundColor: pressed ? t.surfaceAlt : t.surface, opacity: past ? 0.55 : 1 }]}
    >
      <View style={[styles.lanes, { width: lanes.length > 1 ? 4 * Math.min(lanes.length, 4) : 5 }]}>
        {lanes.slice(0, 4).map((c, i) => (
          <View key={i} style={{ flex: 1, backgroundColor: c }} />
        ))}
      </View>
      <View style={styles.time}>
        <Text style={[type.time, { color: t.ink }]}>{time.top}</Text>
        {time.bottom ? <Text style={[type.small, { color: t.muted, fontVariant: ['tabular-nums'] }]}>{time.bottom}</Text> : null}
      </View>
      <View style={{ flex: 1, paddingVertical: space.m, paddingRight: space.m, gap: 2 }}>
        <Text style={[type.title, { color: t.ink }]} numberOfLines={2}>
          {ev.title}
        </Text>
        {ev.location ? (
          <Text style={[type.small, { color: t.muted }]} numberOfLines={1}>
            {ev.location}
          </Text>
        ) : null}
        {ev.notes ? (
          <Text style={[type.small, { color: t.muted }]} numberOfLines={1}>
            {ev.notes}
          </Text>
        ) : null}
        <View style={styles.meta}>
          {members.length ? (
            <View style={{ flexDirection: 'row' }}>
              {members.slice(0, 5).map((m, i) => (
                <View key={m.id} style={{ marginLeft: i ? -6 : 0, borderWidth: 2, borderColor: t.surface, borderRadius: 12 }}>
                  <Avatar name={m.name} color={m.color} size={20} />
                </View>
              ))}
            </View>
          ) : (
            <Text style={[type.small, { color: t.muted }]}>Alle</Text>
          )}
          <View style={{ flex: 1 }} />
          {occ.recurring ? <Ionicons name="repeat" size={14} color={t.muted} /> : null}
          {ev.attachments?.length ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
              <Ionicons name="attach" size={15} color={t.muted} />
              <Text style={[type.small, { color: t.muted }]}>{ev.attachments.length}</Text>
            </View>
          ) : null}
          {ev.reminders?.length ? <Ionicons name="notifications-outline" size={13} color={t.muted} /> : null}
          {ev.private ? <Ionicons name="lock-closed" size={13} color={t.muted} /> : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', borderRadius: radius.m, overflow: 'hidden', minHeight: 64 },
  lanes: { flexDirection: 'row' },
  time: { width: 62, paddingVertical: space.m, paddingLeft: space.m },
  meta: { flexDirection: 'row', alignItems: 'center', gap: space.s, marginTop: 6 },
});
