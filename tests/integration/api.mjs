// Integrationstest gegen einen laufenden FamilyCal-Server.
// Aufruf: PB_URL=http://127.0.0.1:8090 node tests/integration/api.mjs
const BASE = process.env.PB_URL || 'http://127.0.0.1:8090';
let failures = 0;

async function api(method, path, body, token) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch {}
  return { status: res.status, data };
}

function check(name, cond, info) {
  if (cond) console.log('  ok  ', name);
  else { failures++; console.log('  FAIL', name, JSON.stringify(info)); }
}

async function user(email, name) {
  const pw = 'testpasswort123';
  const c = await api('POST', '/api/collections/users/records', { email, password: pw, passwordConfirm: pw, name });
  check(`Konto ${name} anlegen`, c.status === 200, c);
  const a = await api('POST', '/api/collections/users/auth-with-password', { identity: email, password: pw });
  check(`${name} anmelden`, a.status === 200, a);
  return { token: a.data?.token, id: a.data?.record?.id };
}

const anna = await user('anna@test.local', 'Anna');
const ben = await user('ben@test.local', 'Ben');
const eve = await user('eve@test.local', 'Eve');

// Familie anlegen
const fam = await api('POST', '/api/collections/families/records', { name: 'Familie Test' }, anna.token);
check('Familie anlegen', fam.status === 200, fam);
const famId = fam.data?.id;

const famView = await api('GET', `/api/collections/families/records/${famId}`, null, anna.token);
check('Anna ist Admin der Familie', famView.data?.admins?.includes(anna.id) && famView.data?.members?.includes(anna.id), famView);

const ms = await api('GET', `/api/collections/memberships/records?filter=${encodeURIComponent(`family="${famId}"`)}`, null, anna.token);
check('Mitgliedschaft für Anna existiert', ms.data?.items?.length === 1 && ms.data.items[0].role === 'admin', ms);

// Einladung
const inv = await api('POST', '/api/collections/invites/records', { family: famId, role: 'member', uses_left: 1 }, anna.token);
check('Einladung erstellen', inv.status === 200 && /^[A-Z0-9]{10}$/.test(inv.data?.code || ''), inv);
const invEve = await api('POST', '/api/collections/invites/records', { family: famId, role: 'member' }, eve.token);
check('Fremde können keine Einladung erstellen', invEve.status >= 400, invEve);

// Beitreten
const join = await api('POST', '/api/familycal/join', { code: inv.data?.code }, ben.token);
check('Ben tritt bei', join.status === 200 && join.data?.family === famId, join);
const join2 = await api('POST', '/api/familycal/join', { code: inv.data?.code }, eve.token);
check('Einmal-Code ist verbraucht', join2.status === 400, join2);
const joinBad = await api('POST', '/api/familycal/join', { code: 'XXXXXXXXXX' }, eve.token);
check('Falscher Code abgelehnt', joinBad.status === 400, joinBad);

const famBen = await api('GET', `/api/collections/families/records/${famId}`, null, ben.token);
check('Ben sieht die Familie', famBen.status === 200 && famBen.data?.writers?.includes(ben.id), famBen);
const famEve = await api('GET', `/api/collections/families/records/${famId}`, null, eve.token);
check('Eve sieht die Familie nicht', famEve.status === 404, famEve);

// Termine
const start = new Date(Date.now() + 86400000);
const pbDate = (d) => d.toISOString().replace('T', ' ');
const ev = await api('POST', '/api/collections/events/records', {
  family: famId, title: 'Zahnarzt', start: pbDate(start), end: pbDate(new Date(start.getTime() + 3600000)), reminders: [15, 60], rrule: 'FREQ=WEEKLY',
}, ben.token);
check('Ben legt Termin an', ev.status === 200 && ev.data?.created_by === ben.id, ev);
const evBad = await api('POST', '/api/collections/events/records', { family: famId, title: 'x', start: pbDate(start), end: pbDate(start), reminders: [7] }, ben.token);
check('Ungültige Erinnerung abgelehnt', evBad.status === 400, evBad);
const evEve = await api('POST', '/api/collections/events/records', { family: famId, title: 'Hack', start: pbDate(start), end: pbDate(start) }, eve.token);
check('Eve kann keinen Termin anlegen', evEve.status >= 400, evEve);
const listEve = await api('GET', '/api/collections/events/records', null, eve.token);
check('Eve sieht keine Termine', listEve.data?.items?.length === 0, listEve);
const listAnna = await api('GET', '/api/collections/events/records', null, anna.token);
check('Anna sieht Bens Termin', listAnna.data?.items?.length === 1, listAnna);

const priv = await api('POST', '/api/collections/events/records', { family: famId, title: 'Geheim', start: pbDate(start), end: pbDate(start), private: true }, anna.token);
check('Anna legt privaten Termin an', priv.status === 200, priv);
const listBen = await api('GET', '/api/collections/events/records', null, ben.token);
check('Ben sieht Annas privaten Termin nicht', listBen.data?.items?.length === 1, listBen);

// Rollen
const benMs = (await api('GET', `/api/collections/memberships/records?filter=${encodeURIComponent(`user="${ben.id}"`)}`, null, ben.token)).data?.items?.[0];
const selfPromote = await api('PATCH', `/api/collections/memberships/records/${benMs?.id}`, { role: 'admin' }, ben.token);
check('Ben kann sich nicht selbst zum Admin machen', selfPromote.status >= 400, selfPromote);
const rename = await api('PATCH', `/api/collections/memberships/records/${benMs?.id}`, { name: 'Benni' }, ben.token);
check('Ben kann seinen Namen ändern', rename.status === 200, rename);
const famHack = await api('PATCH', `/api/collections/families/records/${famId}`, { admins: [ben.id] }, anna.token);
check('Admin-Liste nicht direkt änderbar', famHack.status >= 400, famHack);

// Webhook
const wh = await api('POST', '/api/collections/webhooks/records', {
  user: ben.id, name: 'Test', kind: 'generic', url: 'http://127.0.0.1:9/hook', events: ['created'], enabled: true,
}, ben.token);
check('Webhook anlegen', wh.status === 200, wh);
const whTest = await api('POST', `/api/familycal/webhooks/${wh.data?.id}/test`, null, ben.token);
check('Webhook-Test antwortet', whTest.status === 200 && whTest.data?.ok === false, whTest);
const whEve = await api('POST', `/api/familycal/webhooks/${wh.data?.id}/test`, null, eve.token);
check('Fremder Webhook-Test verboten', whEve.status === 404, whEve);

console.log(failures ? `\n${failures} Fehler` : '\nAlles ok');
process.exit(failures ? 1 : 0);
