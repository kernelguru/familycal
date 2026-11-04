// Typen für die gemeinsame JS-Logik (shared/calendar.js, per postinstall kopiert).
export interface RRule {
  freq: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
  interval: number;
  byday: number[];
  count: number | null;
  until: Date | null;
}
export interface RawOccurrence {
  start: Date;
  end: Date;
  key: string;
  recurring: boolean;
}
export const WEEKDAYS: string[];
export const WEEKDAY_DE_SHORT: string[];
export const WEEKDAY_DE_LONG: string[];
export const MONTH_DE: string[];
export const REMINDER_OPTIONS: number[];
export const MAX_REMINDER_MINUTES: number;
export function toDate(v: unknown): Date | null;
export function toPbDate(v: unknown): string;
export function addDaysLocal(d: Date, n: number): Date;
export function startOfDayLocal(d: Date): Date;
export function parseRRule(s: string): RRule | null;
export function buildRRule(o: { freq: string; interval?: number; byday?: number[]; count?: number; until?: Date | string | null }): string;
export function describeRRule(s: string): string;
export function occurrenceKey(d: Date | string): string;
export function expand(
  ev: { start: unknown; end: unknown; rrule?: string; exdates?: unknown },
  from: Date,
  to: Date,
  opts?: { limit?: number }
): RawOccurrence[];
export function formatWhen(start: unknown, end: unknown, allDay: boolean): string;
export function formatLead(minutes: number): string;
export function pad(n: number): string;
