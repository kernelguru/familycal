import * as cal from './calendar';
import type { CalEvent, Membership, Occurrence } from './types';

/** Alle Vorkommen der Termine im Zeitraum, chronologisch sortiert. */
export function occurrencesBetween(events: CalEvent[], from: Date, to: Date): Occurrence[] {
  const out: Occurrence[] = [];
  for (const ev of events) {
    const occ = cal.expand(ev, from, to, { limit: 500 });
    for (const o of occ) out.push({ event: ev, start: o.start, end: o.end, key: o.key, recurring: o.recurring });
  }
  out.sort((a, b) => {
    // Ganztägige zuerst, dann nach Startzeit
    const d = cal.startOfDayLocal(a.start).getTime() - cal.startOfDayLocal(b.start).getTime();
    if (d !== 0) return d;
    if (a.event.all_day !== b.event.all_day) return a.event.all_day ? -1 : 1;
    return a.start.getTime() - b.start.getTime() || a.event.title.localeCompare(b.event.title);
  });
  return out;
}

export interface DaySection {
  key: string;
  date: Date;
  title: string;
  subtitle: string;
  data: Occurrence[];
}

/** Gruppiert Vorkommen nach Tag. Mehrtägige Termine erscheinen an jedem Tag. */
export function groupByDay(occ: Occurrence[], from: Date, to: Date): DaySection[] {
  const map = new Map<string, DaySection>();
  const today = cal.startOfDayLocal(new Date());
  const startDay = cal.startOfDayLocal(from);
  for (const o of occ) {
    let day = cal.startOfDayLocal(o.start);
    if (day < startDay) day = startDay;
    const lastMoment = new Date(Math.max(o.start.getTime(), o.end.getTime() - 1));
    let guard = 0;
    while (day.getTime() <= lastMoment.getTime() && day < to && guard++ < 60) {
      const k = dayKey(day);
      if (!map.has(k)) map.set(k, { key: k, date: day, ...dayTitle(day, today), data: [] });
      map.get(k)!.data.push(o);
      day = cal.addDaysLocal(day, 1);
    }
  }
  return Array.from(map.values()).sort((a, b) => a.date.getTime() - b.date.getTime());
}

export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${cal.pad(d.getMonth() + 1)}-${cal.pad(d.getDate())}`;
}

export function dayTitle(day: Date, today = cal.startOfDayLocal(new Date())) {
  const diff = Math.round((day.getTime() - today.getTime()) / 86400000);
  const full = `${cal.WEEKDAY_DE_LONG[day.getDay()]}, ${day.getDate()}. ${cal.MONTH_DE[day.getMonth()]}`;
  if (diff === 0) return { title: 'Heute', subtitle: full };
  if (diff === 1) return { title: 'Morgen', subtitle: full };
  if (diff > 1 && diff < 7) return { title: cal.WEEKDAY_DE_LONG[day.getDay()], subtitle: `${day.getDate()}. ${cal.MONTH_DE[day.getMonth()]}` };
  const sameYear = day.getFullYear() === today.getFullYear();
  return { title: `${cal.WEEKDAY_DE_SHORT[day.getDay()]}, ${day.getDate()}. ${cal.MONTH_DE[day.getMonth()]}`, subtitle: sameYear ? '' : String(day.getFullYear()) };
}

export function timeLabel(o: Occurrence, day?: Date): { top: string; bottom: string } {
  if (o.event.all_day) return { top: 'Ganz-', bottom: 'tägig' };
  const hm = (d: Date) => `${cal.pad(d.getHours())}:${cal.pad(d.getMinutes())}`;
  if (day && cal.startOfDayLocal(o.start).getTime() < day.getTime()) {
    return { top: 'bis', bottom: o.end.getTime() < cal.addDaysLocal(day, 1).getTime() ? hm(o.end) : '…' };
  }
  return { top: hm(o.start), bottom: o.end.getTime() > o.start.getTime() ? hm(o.end) : '' };
}

export const REMINDER_LABELS: Record<number, string> = {
  0: 'Beginn',
  5: '5 Min',
  10: '10 Min',
  15: '15 Min',
  30: '30 Min',
  60: '1 Std',
  120: '2 Std',
  1440: '1 Tag',
  2880: '2 Tage',
  10080: '1 Woche',
};

/** Ist der Nutzer (über seine Mitgliedschaft) von diesem Termin betroffen? */
export function concernsMember(ev: CalEvent, membership: Membership | undefined, userId: string): boolean {
  if (ev.private) return ev.created_by === userId;
  if (!ev.participants?.length) return true;
  return !!membership && ev.participants.includes(membership.id);
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?';
}

/** PocketBase hängt an Dateinamen ein Zufallssuffix an: "brief_a1b2c3d4e5.pdf" -> "brief.pdf" */
export function prettyFileName(name: string): string {
  return name.replace(/_[a-z0-9]{10}(\.[^.]+)$/i, '$1');
}
