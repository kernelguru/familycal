import React from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import * as cal from '../lib/calendar';
import { space, type, useTheme } from './theme';

/** Datum (+ optional Uhrzeit) wählen. iOS: kompakte native Auswahl, Android: Dialoge. */
export function DateTimeField({
  label,
  value,
  onChange,
  withTime = true,
  minimumDate,
}: {
  label: string;
  value: Date;
  onChange: (d: Date) => void;
  withTime?: boolean;
  minimumDate?: Date;
}) {
  const t = useTheme();

  const dateText = `${cal.WEEKDAY_DE_SHORT[value.getDay()]}, ${cal.pad(value.getDate())}.${cal.pad(value.getMonth() + 1)}.${value.getFullYear()}`;
  const timeText = `${cal.pad(value.getHours())}:${cal.pad(value.getMinutes())}`;

  const openAndroid = (mode: 'date' | 'time') => {
    DateTimePickerAndroid.open({
      value,
      mode,
      is24Hour: true,
      minimumDate,
      onChange: (ev, d) => {
        if (ev.type === 'set' && d) onChange(d);
      },
    });
  };

  if (Platform.OS === 'ios') {
    return (
      <View style={{ paddingHorizontal: space.l, paddingVertical: 8, flexDirection: 'row', alignItems: 'center' }}>
        <Text style={[type.body, { color: t.ink, flex: 1 }]}>{label}</Text>
        <DateTimePicker
          value={value}
          mode={withTime ? 'datetime' : 'date'}
          display="compact"
          locale="de-DE"
          minuteInterval={5}
          minimumDate={minimumDate}
          onChange={(_, d) => d && onChange(d)}
          accentColor={t.accent}
        />
      </View>
    );
  }

  return (
    <View style={{ paddingHorizontal: space.l, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: space.s }}>
      <Text style={[type.body, { color: t.ink, flex: 1 }]}>{label}</Text>
      <Pressable onPress={() => openAndroid('date')} style={{ backgroundColor: t.surfaceAlt, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 }}>
        <Text style={[type.body, { color: t.ink }]}>{dateText}</Text>
      </Pressable>
      {withTime ? (
        <Pressable onPress={() => openAndroid('time')} style={{ backgroundColor: t.surfaceAlt, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 }}>
          <Text style={[type.time, { color: t.ink }]}>{timeText}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
