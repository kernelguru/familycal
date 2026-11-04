import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { radius, space, type, useTheme } from './theme';
import { initials } from '../lib/agenda';

export function Screen({ children, scroll = true, style }: { children: React.ReactNode; scroll?: boolean; style?: ViewStyle }) {
  const t = useTheme();
  if (!scroll) return <View style={[{ flex: 1, backgroundColor: t.bg }, style]}>{children}</View>;
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: t.bg }}
      contentContainerStyle={[{ padding: space.l, paddingBottom: 48, gap: space.l }, style]}
      keyboardShouldPersistTaps="handled"
      contentInsetAdjustmentBehavior="automatic"
    >
      {children}
    </ScrollView>
  );
}

/** Gruppe von Einstellungen/Feldern mit optionaler Überschrift. */
export function Group({ title, footer, children }: { title?: string; footer?: string; children: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ gap: space.s }}>
      {title ? <Text style={[type.label, { color: t.muted, marginLeft: space.xs }]}>{title}</Text> : null}
      <View style={{ backgroundColor: t.surface, borderRadius: radius.m, overflow: 'hidden' }}>{children}</View>
      {footer ? <Text style={[type.small, { color: t.muted, marginHorizontal: space.xs }]}>{footer}</Text> : null}
    </View>
  );
}

export function Divider() {
  const t = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: t.line, marginLeft: space.l }} />;
}

export function Row({
  label,
  value,
  icon,
  onPress,
  right,
  danger,
  detail,
}: {
  label: string;
  value?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  right?: React.ReactNode;
  danger?: boolean;
  detail?: string;
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [styles.row, { backgroundColor: pressed ? t.surfaceAlt : 'transparent' }]}
      accessibilityRole={onPress ? 'button' : undefined}
    >
      {icon ? <Ionicons name={icon} size={20} color={danger ? t.danger : t.muted} style={{ marginRight: space.m }} /> : null}
      <View style={{ flex: 1 }}>
        <Text style={[type.body, { color: danger ? t.danger : t.ink }]}>{label}</Text>
        {detail ? <Text style={[type.small, { color: t.muted }]} numberOfLines={2}>{detail}</Text> : null}
      </View>
      {value ? <Text style={[type.body, { color: t.muted, marginLeft: space.s, maxWidth: '55%' }]} numberOfLines={1}>{value}</Text> : null}
      {right}
      {onPress && !right ? <Ionicons name="chevron-forward" size={18} color={t.muted} style={{ marginLeft: space.xs }} /> : null}
    </Pressable>
  );
}

export function ToggleRow({ label, detail, value, onChange }: { label: string; detail?: string; value: boolean; onChange: (v: boolean) => void }) {
  const t = useTheme();
  return <Row label={label} detail={detail} right={<Switch value={value} onValueChange={onChange} trackColor={{ true: t.accent }} />} />;
}

export function Field({ label, ...props }: TextInputProps & { label?: string }) {
  const t = useTheme();
  return (
    <View style={{ paddingHorizontal: space.l, paddingVertical: space.m }}>
      {label ? <Text style={[type.small, { color: t.muted, marginBottom: 2 }]}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={t.muted}
        {...props}
        style={[type.body, { color: t.ink, paddingVertical: 4, minHeight: props.multiline ? 88 : undefined, textAlignVertical: props.multiline ? 'top' : 'center' }, props.style]}
      />
    </View>
  );
}

export function Button({
  title,
  onPress,
  kind = 'primary',
  icon,
  loading,
  disabled,
}: {
  title: string;
  onPress: () => void;
  kind?: 'primary' | 'secondary' | 'danger';
  icon?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  disabled?: boolean;
}) {
  const t = useTheme();
  const bg = kind === 'primary' ? t.accent : t.surface;
  const fg = kind === 'primary' ? t.accentInk : kind === 'danger' ? t.danger : t.accent;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      style={({ pressed }) => [styles.button, { backgroundColor: bg, opacity: disabled ? 0.45 : pressed ? 0.8 : 1 }]}
    >
      {loading ? <ActivityIndicator color={fg} /> : icon ? <Ionicons name={icon} size={18} color={fg} /> : null}
      <Text style={[type.title, { color: fg }]}>{title}</Text>
    </Pressable>
  );
}

export function Chip({ label, selected, onPress, color }: { label: string; selected?: boolean; onPress?: () => void; color?: string }) {
  const t = useTheme();
  const c = color || t.accent;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={[
        styles.chip,
        { borderColor: selected ? c : t.line, backgroundColor: selected ? c + '22' : t.surface },
      ]}
    >
      {color ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} /> : null}
      <Text style={[type.label, { color: selected ? t.ink : t.muted }]}>{label}</Text>
    </Pressable>
  );
}

export function ChipRow({ children }: { children: React.ReactNode }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s, padding: space.m }}>{children}</View>;
}

export function Avatar({ name, color, size = 28, faded }: { name: string; color: string; size?: number; faded?: boolean }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        opacity: faded ? 0.35 : 1,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: '#fff', fontWeight: '700', fontSize: size * 0.4 }}>{initials(name)}</Text>
    </View>
  );
}

export function Notice({ text, icon = 'cloud-offline-outline' }: { text: string; icon?: keyof typeof Ionicons.glyphMap }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: space.s, alignItems: 'center', backgroundColor: t.warnBg, padding: space.m, borderRadius: radius.s }}>
      <Ionicons name={icon} size={16} color={t.warnInk} />
      <Text style={[type.small, { color: t.warnInk, flex: 1 }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.l, paddingVertical: 13, minHeight: 48 },
  button: { flexDirection: 'row', gap: space.s, alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: radius.m },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.pill, borderWidth: 1.5 },
});
