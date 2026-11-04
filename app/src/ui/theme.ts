/**
 * Gestaltung: angelehnt an den Papier-Familienplaner – jede Person hat eine
 * eigene Farbe ("Spalte"). Diese Farben sind das Einzige, was laut ist;
 * der Rest bleibt ruhig: kühles Kreideweiß, Tinte, feine Linien.
 */
import { useColorScheme } from 'react-native';

export const MEMBER_COLORS = ['#D1495B', '#2E86AB', '#3BA55C', '#F2A541', '#7B5EA7', '#16A3A3', '#C2668A', '#5C6B73'];

const light = {
  bg: '#F3F5F7',
  surface: '#FFFFFF',
  surfaceAlt: '#E9EDF1',
  ink: '#1F2A37',
  muted: '#6B7785',
  line: '#DDE3E9',
  accent: '#2F5D8A',
  accentInk: '#FFFFFF',
  danger: '#B3261E',
  today: '#2F5D8A',
  warnBg: '#FFF4D6',
  warnInk: '#7A5B00',
};

const dark: typeof light = {
  bg: '#151A21',
  surface: '#1E252E',
  surfaceAlt: '#27303B',
  ink: '#E8ECF0',
  muted: '#9AA6B2',
  line: '#2E3843',
  accent: '#8DB6E0',
  accentInk: '#10202F',
  danger: '#F2B8B5',
  today: '#8DB6E0',
  warnBg: '#3A3220',
  warnInk: '#F0D58A',
};

export type Theme = typeof light;

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}

export const type = {
  dayHero: { fontSize: 30, fontWeight: '800' as const, letterSpacing: -0.6 },
  day: { fontSize: 20, fontWeight: '700' as const, letterSpacing: -0.3 },
  title: { fontSize: 17, fontWeight: '600' as const },
  body: { fontSize: 15, lineHeight: 21 },
  small: { fontSize: 13, lineHeight: 18 },
  time: { fontSize: 15, fontWeight: '600' as const, fontVariant: ['tabular-nums' as const] },
  label: { fontSize: 13, fontWeight: '600' as const },
};

export const space = { xs: 4, s: 8, m: 12, l: 16, xl: 24 };
export const radius = { s: 8, m: 14, pill: 999 };
