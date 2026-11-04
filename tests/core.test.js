// Testet die Server-Logik (lib/core.js) gegen ein minimales PocketBase-Mock.
// Ausführen mit: TZ=Europe/Berlin node --test tests/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const hooksDir = path.join(__dirname, '..', 'server', 'pb_hooks');
fs.copyFileSync(path.join(__dirname, '..', 'shared', 'calendar.js'), path.join(hooksDir, 'lib', 'calendar.js'));

// ---------- PocketBase-Globals nachbilden ----------
let idSeq = 0;
class MockRecord {
  constructor(col, data = {}) {
    this._col = typeof col === 'string' ? col : col.name;
    this.id = data.id || 'r' + ++idSeq;
    this.data = { ...data };
  }
  set(k, v) { this.data[k] = v; }
  get(k) { return this.data[k]; }
  getString(k) {
    const v = this.data[k];
    if (v === undefined || v === null) return '';
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  }
  getBool(k) { return !!this.data[k]; }
  getInt(k) { return parseInt(this.data[k] || 0, 10); }
  getStringSlice(k) { return Array.isArray(this.data[k]) ? this.data[k] : this.data[k] ? [this.data[k]] : []; }
}
class BadRequestError extends Error {}
const sent = [];
global.__hooks = hooksDir;
global.Record = MockRecord;
global.BadRequestError = BadRequestError;
global.$security = { hs256: (d, s) => 'hmac-' + s };
global.$http = { send: (req) => { sent.push(req); return { statusCode: req.url.includes('fail') ? 500 : 200 }; } };

function mockApp() {
  const db = {};
  const all = (c) => (db[c] = db[c] || []);
  const app = {
    db,
    findCollectionByNameOrId: (name) => ({ name }),
    save: (r) => { const l = all(r._col); if (!l.includes(r)) l.push(r); },
    delete: (r) => { db[r._col] = all(r._col).filter((x) => x !== r); },
    findRecordById: (c, id) => { const r = all(c).find((x) => x.id === id); if (!r) throw new Error('not found'); return r; },
    findFirstRecordByFilter: (c, filter, p) => {
      const r = app.findRecordsByFilter(c, filter, '', 1, 0, p)[0];
      if (!r) throw new Error('not found');
      return r;
    },
    findRecordsByFilter: (c, filter, sort, limit, offset, p = {}) => {
      const list = all(c);
      if (c === 'memberships') {
        return list.filter((m) => m.data.family === p.f && (!p.u || m.data.user === p.u) && (!filter.includes("role = 'admin'") || m.data.role === 'admin'));
      }
      if (c === 'events') return list.filter((e) => (e.data.reminders || []).length);
      if (c === 'reminder_log') {
        if (filter.startsWith('created <')) return [];
        return list.filter((l) => l.data.event === p.e && l.data.occurrence === p.o && l.data.minutes === p.m);
      }
      if (c === 'webhooks') {
        const users = Object.keys(p).filter((k) => /^u\d+$/.test(k)).map((k) => p[k]);
        return list.filter((h) => h.data.enabled && (h.data.events || []).includes(p.t) && (!h.data.family || h.data.family === p.f) && users.includes(h.data.user));
      }
      if (c === 'outbox') {
        if (filter.startsWith("status != 'pending'")) return [];
        return list.filter((o) => o.data.status === 'pending' && new Date(o.data.next_try.replace(' ', 'T')) <= new Date(p.n.replace(' ', 'T')));
      }
      return list;
    },
  };
  return app;
}

const core = require(path.join(hooksDir, 'lib', 'core.js'));

function setupFamily(app) {
  const fam = new MockRecord('families', { id: 'fam1', name: 'Müllers', members: ['uA', 'uB', 'uC'] });
  app.save(fam);
  const mA = new MockRecord('memberships', { id: 'mA', family: 'fam1', user: 'uA', role: 'admin', name: 'Anna' });
  const mB = new MockRecord('memberships', { id: 'mB', family: 'fam1', user: 'uB', role: 'member', name: 'Ben' });
  const mC = new MockRecord('memberships', { id: 'mC', family: 'fam1', user: 'uC', role: 'child', name: 'Cleo' });
  [mA, mB, mC].forEach(app.save);
  const hookA = new MockRecord('webhooks', { id: 'hA', user: 'uA', kind: 'ntfy', url: 'https://ntfy.example.com/anna', events: ['reminder', 'created'], enabled: true });
  const hookB = new MockRecord('webhooks', { id: 'hB', user: 'uB', kind: 'generic', url: 'https://example.com/fail', secret: 'x', events: ['reminder', 'created'], enabled: true });
  const hookC = new MockRecord('webhooks', { id: 'hC', user: 'uC', kind: 'ntfy', url: 'https://ntfy.example.com/cleo', events: ['created'], enabled: true, only_participating: true });
  [hookA, hookB, hookC].forEach(app.save);
  return { fam, mA, mB, mC };
}

test('syncFamilyRoles spiegelt Rollen', () => {
  const app = mockApp();
  setupFamily(app);
  core.syncFamilyRoles(app, 'fam1');
  const fam = app.findRecordById('families', 'fam1');
  assert.deepEqual(fam.data.members, ['uA', 'uB', 'uC']);
  assert.deepEqual(fam.data.writers, ['uA', 'uB']);
  assert.deepEqual(fam.data.admins, ['uA']);
});

test('validateEvent: fremde Teilnehmer und ungültige Erinnerungen werden abgelehnt', () => {
  const app = mockApp();
  setupFamily(app);
  app.save(new MockRecord('memberships', { id: 'mX', family: 'famOther', user: 'uX', role: 'admin', name: 'X' }));
  const base = { family: 'fam1', title: 'T', start: '2026-11-10 17:00:00.000Z', end: '2026-11-10 18:00:00.000Z' };
  assert.throws(() => core.validateEvent(app, new MockRecord('events', { ...base, participants: ['mX'] })), BadRequestError);
  assert.throws(() => core.validateEvent(app, new MockRecord('events', { ...base, reminders: [7] })), BadRequestError);
  assert.throws(() => core.validateEvent(app, new MockRecord('events', { ...base, end: '2026-11-10 16:00:00.000Z' })), BadRequestError);
  assert.throws(() => core.validateEvent(app, new MockRecord('events', { ...base, rrule: 'FREQ=HOURLY' })), BadRequestError);
  const ok = new MockRecord('events', { ...base, participants: ['mA'], reminders: [15, 15, 60] });
  core.validateEvent(app, ok);
  assert.deepEqual(ok.data.reminders, [15, 60]);
});

test('Erinnerung: genau einmal, nur an Teilnehmer, Outbox mit Retry', () => {
  const app = mockApp();
  setupFamily(app);
  sent.length = 0;
  const start = new Date(Date.now() + 15 * 60000 - 30000); // fällig vor 30 s (15-Min-Erinnerung)
  const ev = new MockRecord('events', {
    id: 'ev1', family: 'fam1', title: 'Zahnarzt', location: 'Praxis', created_by: 'uA',
    start: core.cal.toPbDate(start), end: core.cal.toPbDate(new Date(start.getTime() + 3600000)),
    reminders: [15, 60], participants: ['mA', 'mB'],
  });
  app.save(ev);

  assert.equal(core.processReminders(app), 2); // Anna + Ben, Cleo nicht beteiligt
  assert.equal(core.processReminders(app), 0); // kein Doppelversand
  core.drainOutbox(app);
  assert.equal(sent.length, 2);
  const ntfy = sent.find((r) => r.url === 'https://ntfy.example.com');
  const body = JSON.parse(ntfy.body);
  assert.match(body.title, /^In 15 Min: Zahnarzt$/);
  assert.match(body.message, /Praxis · Müllers$/);

  const failed = app.db.outbox.find((o) => o.data.webhook === 'hB');
  assert.equal(failed.data.status, 'pending');
  assert.equal(failed.data.attempts, 1);
  assert.match(app.findRecordById('webhooks', 'hB').data.last_status, /HTTP 500/);
  assert.equal(app.db.outbox.find((o) => o.data.webhook === 'hA').data.status, 'sent');
});

test('Änderungsbenachrichtigung: nicht an Auslöser, only_participating respektiert, privat = still', () => {
  const app = mockApp();
  setupFamily(app);
  const ev = new MockRecord('events', { id: 'ev2', family: 'fam1', title: 'Elternabend', created_by: 'uA', start: '2026-11-10 17:00:00.000Z', end: '2026-11-10 18:00:00.000Z', participants: ['mA', 'mB'] });
  core.notifyChange(app, 'created', ev, 'uA');
  const targets = (app.db.outbox || []).map((o) => o.data.webhook).sort();
  assert.deepEqual(targets, ['hB']); // Anna = Auslöserin, Cleo nimmt nicht teil

  const app2 = mockApp();
  setupFamily(app2);
  core.notifyChange(app2, 'created', new MockRecord('events', { ...ev.data, private: true }), 'uA');
  assert.equal((app2.db.outbox || []).length, 0);
});

test('Wiederkehrender Termin erzeugt Erinnerung für das heutige Vorkommen', () => {
  const app = mockApp();
  setupFamily(app);
  const now = new Date();
  const todayOcc = new Date(now.getTime() + 5 * 60000 - 20000);
  const firstStart = core.cal.addDaysLocal(todayOcc, -21); // vor 3 Wochen begonnen
  const ev = new MockRecord('events', {
    id: 'ev3', family: 'fam1', title: 'Training', created_by: 'uB',
    start: core.cal.toPbDate(firstStart), end: core.cal.toPbDate(new Date(firstStart.getTime() + 5400000)),
    rrule: 'FREQ=WEEKLY', reminders: [5],
  });
  app.save(ev);
  assert.equal(core.processReminders(app), 2); // ganze Familie, aber nur Anna+Ben haben reminder-Webhooks
  assert.equal(app.db.reminder_log[0].data.occurrence, todayOcc.toISOString());
});
