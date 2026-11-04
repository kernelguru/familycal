// Ausführen mit: TZ=Europe/Berlin node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const cal = require('../shared/calendar.js');
const wh = require('../server/pb_hooks/lib/webhooks.js');

const local = (y, m, d, h = 0, mi = 0) => new Date(y, m - 1, d, h, mi);
const hhmm = (d) => cal.pad(d.getHours()) + ':' + cal.pad(d.getMinutes());

test('toDate parst PocketBase-Format', () => {
  const d = cal.toDate('2026-11-04 17:00:00.000Z');
  assert.equal(d.toISOString(), '2026-11-04T17:00:00.000Z');
  assert.equal(cal.toPbDate(d), '2026-11-04 17:00:00.000Z');
  assert.equal(cal.toDate(''), null);
});

test('Einzeltermin: nur im Fenster', () => {
  const ev = { start: local(2026, 11, 10, 18), end: local(2026, 11, 10, 19) };
  assert.equal(cal.expand(ev, local(2026, 11, 1), local(2026, 11, 30)).length, 1);
  assert.equal(cal.expand(ev, local(2026, 11, 11), local(2026, 11, 30)).length, 0);
  // läuft gerade -> berührt Fenster
  assert.equal(cal.expand(ev, local(2026, 11, 10, 18, 30), local(2026, 11, 30)).length, 1);
});

test('Wöchentlich bleibt über Sommerzeit-Umstellung bei 18:00', () => {
  const ev = { start: local(2026, 10, 19, 18), end: local(2026, 10, 19, 19), rrule: 'FREQ=WEEKLY' };
  const occ = cal.expand(ev, local(2026, 10, 1), local(2026, 11, 10));
  assert.deepEqual(occ.map((o) => o.start.getDate()), [19, 26, 2, 9]);
  for (const o of occ) assert.equal(hhmm(o.start), '18:00');
});

test('Wöchentlich mit BYDAY, INTERVAL und COUNT', () => {
  // Start Mi 04.11.2026
  const ev = { start: local(2026, 11, 4, 8), end: local(2026, 11, 4, 9), rrule: 'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;COUNT=4' };
  const occ = cal.expand(ev, local(2026, 1, 1), local(2027, 12, 31));
  // Mo 02.11. liegt vor dem Start -> zählt nicht; Mi 04.11., Mo 16.11., Mi 18.11., Mo 30.11.
  assert.deepEqual(occ.map((o) => `${o.start.getDate()}.${o.start.getMonth() + 1}`), ['4.11', '16.11', '18.11', '30.11']);
});

test('Ausnahmen (exdates) werden entfernt, COUNT zählt sie mit', () => {
  const first = local(2026, 11, 2, 7);
  const ev = { start: first, end: first, rrule: 'FREQ=DAILY;COUNT=3', exdates: [cal.addDaysLocal(first, 1).toISOString()] };
  const occ = cal.expand(ev, local(2026, 11, 1), local(2026, 12, 1));
  assert.deepEqual(occ.map((o) => o.start.getDate()), [2, 4]);
});

test('Monatlich überspringt Monate ohne den 31.', () => {
  const ev = { start: local(2026, 1, 31, 10), end: local(2026, 1, 31, 11), rrule: 'FREQ=MONTHLY;COUNT=4' };
  const occ = cal.expand(ev, local(2026, 1, 1), local(2027, 1, 1));
  assert.deepEqual(occ.map((o) => o.start.getMonth() + 1), [1, 3, 5, 7]);
});

test('Jährlich (Geburtstag, ganztägig) und UNTIL', () => {
  const ev = { start: local(2020, 3, 15), end: local(2020, 3, 16), rrule: 'FREQ=YEARLY;UNTIL=20280101' };
  const occ = cal.expand(ev, local(2026, 1, 1), local(2030, 1, 1));
  assert.deepEqual(occ.map((o) => o.start.getFullYear()), [2026, 2027]);
});

test('Täglich: weit zurückliegender Start ist schnell und korrekt', () => {
  const ev = { start: local(2000, 1, 1, 6), end: local(2000, 1, 1, 6, 30), rrule: 'FREQ=DAILY' };
  const occ = cal.expand(ev, local(2026, 11, 4), local(2026, 11, 7));
  assert.deepEqual(occ.map((o) => o.start.getDate()), [4, 5, 6]);
  for (const o of occ) assert.equal(hhmm(o.start), '06:00');
});

test('parse/build/describe', () => {
  assert.throws(() => cal.parseRRule('FREQ=HOURLY'));
  assert.throws(() => cal.parseRRule('FREQ=DAILY;BYDAY=MO'));
  assert.equal(cal.parseRRule(''), null);
  const r = cal.buildRRule({ freq: 'WEEKLY', interval: 2, byday: [3, 1] });
  assert.equal(r, 'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE');
  assert.equal(cal.describeRRule(r), 'Alle 2 Wochen am Mo, Mi');
  assert.equal(cal.describeRRule(''), 'Einmalig');
});

test('formatWhen', () => {
  assert.equal(cal.formatWhen(local(2026, 11, 4, 18), local(2026, 11, 4, 19, 30), false), 'Mi 04.11. 18:00–19:30');
  assert.equal(cal.formatWhen(local(2026, 11, 4), local(2026, 11, 5), true), 'Mi 04.11. ganztägig');
  assert.equal(cal.formatWhen(local(2026, 11, 4), local(2026, 11, 7), true), 'Mi 04.11. – Fr 06.11.');
});

test('Webhook: ntfy', () => {
  const req = wh.buildRequest({ kind: 'ntfy', url: 'https://ntfy.example.com/familie', token: 'tk' }, { type: 'reminder', title: 'Zahnarzt', message: 'Mi 18:00' });
  assert.equal(req.url, 'https://ntfy.example.com');
  const body = JSON.parse(req.body);
  assert.equal(body.topic, 'familie');
  assert.equal(body.priority, 4);
  assert.equal(req.headers.Authorization, 'Bearer tk');
});

test('Webhook: generic signiert', () => {
  const req = wh.buildRequest({ kind: 'generic', url: 'https://example.com/hook', secret: 's' }, { type: 'created', title: 'T', message: 'M' }, (d, s) => 'sig:' + s + ':' + d.length);
  assert.match(req.headers['X-FamilyCal-Signature'], /^sha256=sig:s:\d+$/);
});

test('Webhook: http nach außen wird abgelehnt', () => {
  assert.throws(() => wh.buildRequest({ kind: 'generic', url: 'http://example.com/x' }, { type: 'created', title: 'T', message: 'M' }));
  assert.doesNotThrow(() => wh.buildRequest({ kind: 'homeassistant', url: 'http://192.168.1.5:8123/api/webhook/abc' }, { type: 'created', title: 'T', message: 'M' }));
});

test('Webhook: Telegram und Pushover', () => {
  const t = wh.buildRequest({ kind: 'telegram', token: '123:ABC', target: '42' }, { type: 'reminder', title: 'A', message: 'B' });
  assert.equal(t.url, 'https://api.telegram.org/bot123:ABC/sendMessage');
  assert.throws(() => wh.buildRequest({ kind: 'pushover', token: 'x' }, { type: 'reminder', title: 'A', message: 'B' }));
});

test('Wöchentlich: weit zurückliegender Start (Sprung-Optimierung)', () => {
  const ev = { start: local(2019, 1, 7, 17), end: local(2019, 1, 7, 18), rrule: 'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,TH' };
  const occ = cal.expand(ev, local(2026, 11, 1), local(2026, 11, 30));
  // Referenz ohne Sprung: alle Vorkommen ab Start berechnen und filtern
  const all = cal.expand(ev, local(2019, 1, 1), local(2026, 11, 30), { limit: 100000 })
    .filter((o) => o.end > local(2026, 11, 1));
  assert.deepEqual(occ.map((o) => o.key), all.map((o) => o.key));
  assert.ok(occ.length >= 3);
});
