import React, { useMemo, useState } from 'react';
import { ActivityIndicator, ActionSheetIOS, Alert, Platform, Pressable, RefreshControl, SectionList, Text, View } from 'react-native';
import { Redirect, Stack, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as cal from '../src/lib/calendar';
import { groupByDay, occurrencesBetween } from '../src/lib/agenda';
import { useStore } from '../src/lib/store';
import { EventCard } from '../src/ui/EventCard';
import { Avatar, Notice } from '../src/ui/components';
import { radius, space, type, useTheme } from '../src/ui/theme';

const STEP_DAYS = 42;

export default function Agenda() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const s = useStore();
  const [days, setDays] = useState(STEP_DAYS);
  const [filter, setFilter] = useState<string[]>([]); // Mitgliedschafts-IDs

  const today = cal.startOfDayLocal(new Date());
  const to = cal.addDaysLocal(today, days);

  const sections = useMemo(() => {
    let occ = occurrencesBetween(s.events, today, to);
    if (filter.length) {
      // Termine ohne Teilnehmer betreffen alle und bleiben sichtbar
      occ = occ.filter((o) => !o.event.participants?.length || o.event.participants.some((p) => filter.includes(p)));
    }
    return groupByDay(occ, today, to);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.events, filter, days, today.getTime()]);

  if (!s.ready) return <Center />;
  if (!s.userId) return <Redirect href="/login" />;
  if (!s.families.length) {
    if (!s.fetchedAt) return <Center />;
    return <Redirect href="/onboarding" />;
  }

  const switchFamily = () => {
    const names = s.families.map((f) => f.name);
    const pick = (i: number) => i < s.families.length && s.setCurrentFamily(s.families[i].id);
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions({ options: [...names, 'Abbrechen'], cancelButtonIndex: names.length, title: 'Familie wählen' }, pick);
    } else {
      Alert.alert('Familie wählen', undefined, [...names.map((n, i) => ({ text: n, onPress: () => pick(i) })), { text: 'Abbrechen', style: 'cancel' as const }]);
    }
  };

  const toggle = (id: string) => setFilter((f) => (f.includes(id) ? f.filter((x) => x !== id) : [...f, id]));

  const header = (
    <View style={{ gap: space.m, marginBottom: space.s }}>
      {s.offline ? (
        <Notice text={`Offline – zeigt den Stand von ${s.fetchedAt ? new Date(s.fetchedAt).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'unbekannt'}.`} />
      ) : null}
      {s.familyMembers.length > 1 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s }}>
          {s.familyMembers.map((m) => {
            const active = filter.length === 0 || filter.includes(m.id);
            return (
              <Pressable
                key={m.id}
                onPress={() => toggle(m.id)}
                accessibilityRole="button"
                accessibilityState={{ selected: filter.includes(m.id) }}
                accessibilityLabel={`Nur Termine von ${m.name}`}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingRight: 10, paddingLeft: 3, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: filter.includes(m.id) ? m.color + '2A' : t.surface }}
              >
                <Avatar name={m.name} color={m.color} size={24} faded={!active} />
                <Text style={[type.label, { color: active ? t.ink : t.muted }]}>{m.name}</Text>
              </Pressable>
            );
          })}
          {filter.length ? (
            <Pressable onPress={() => setFilter([])} style={{ justifyContent: 'center', paddingHorizontal: 8 }}>
              <Text style={[type.label, { color: t.accent }]}>Alle zeigen</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Stack.Screen
        options={{
          headerTitle: () => (
            <Pressable onPress={s.families.length > 1 ? switchFamily : undefined} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }} accessibilityRole="button">
              <Text style={[type.title, { color: t.ink }]} numberOfLines={1}>{s.currentFamily?.name}</Text>
              {s.families.length > 1 ? <Ionicons name="chevron-down" size={16} color={t.muted} /> : null}
            </Pressable>
          ),
          headerRight: () => (
            <Pressable onPress={() => router.push('/settings')} hitSlop={12} accessibilityLabel="Einstellungen">
              <Ionicons name="settings-outline" size={22} color={t.accent} />
            </Pressable>
          ),
        }}
      />
      <SectionList
        sections={sections}
        keyExtractor={(o, i) => o.event.id + o.key + i}
        contentContainerStyle={{ padding: space.l, paddingBottom: 120 + insets.bottom }}
        ListHeaderComponent={header}
        stickySectionHeadersEnabled={false}
        refreshControl={<RefreshControl refreshing={s.loading} onRefresh={s.refresh} tintColor={t.muted} />}
        renderSectionHeader={({ section }) => {
          const isToday = section.title === 'Heute';
          return (
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.s, marginTop: space.l, marginBottom: space.s }}>
              <Text style={[isToday ? type.dayHero : type.day, { color: isToday ? t.today : t.ink }]}>{section.title}</Text>
              {section.subtitle ? <Text style={[type.small, { color: t.muted }]}>{section.subtitle}</Text> : null}
            </View>
          );
        }}
        renderItem={({ item, section }) => (
          <View style={{ marginBottom: space.s }}>
            <EventCard
              occ={item}
              day={section.date}
              members={(item.event.participants || []).map((id) => s.membershipById.get(id)).filter(Boolean) as any}
              onPress={() => router.push({ pathname: '/event/[id]', params: { id: item.event.id, occ: item.key } })}
            />
          </View>
        )}
        ListEmptyComponent={
          <View style={{ alignItems: 'center', paddingVertical: 64, gap: space.s }}>
            <Ionicons name="calendar-clear-outline" size={40} color={t.muted} />
            <Text style={[type.title, { color: t.ink }]}>Nichts geplant</Text>
            <Text style={[type.body, { color: t.muted, textAlign: 'center' }]}>
              {filter.length ? 'Für diese Auswahl gibt es keine Termine.' : `In den nächsten ${days} Tagen steht nichts an.`}
            </Text>
          </View>
        }
        ListFooterComponent={
          <Pressable onPress={() => setDays((d) => d + STEP_DAYS)} style={{ padding: space.l, alignItems: 'center' }}>
            <Text style={[type.label, { color: t.accent }]}>
              Weitere {STEP_DAYS} Tage anzeigen (bis {cal.pad(to.getDate())}.{cal.pad(to.getMonth() + 1)}.)
            </Text>
          </Pressable>
        }
      />
      {s.canWrite ? (
        <Pressable
          onPress={() => router.push('/event/edit')}
          accessibilityRole="button"
          accessibilityLabel="Termin hinzufügen"
          style={({ pressed }) => ({
            position: 'absolute',
            right: space.l + 4,
            bottom: insets.bottom + space.l + 4,
            width: 60,
            height: 60,
            borderRadius: 30,
            backgroundColor: t.accent,
            alignItems: 'center',
            justifyContent: 'center',
            transform: [{ scale: pressed ? 0.94 : 1 }],
          })}
        >
          <Ionicons name="add" size={32} color={t.accentInk} />
        </Pressable>
      ) : null}
    </View>
  );
}

function Center() {
  const t = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.bg }}>
      <ActivityIndicator color={t.muted} />
    </View>
  );
}
