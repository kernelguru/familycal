/**
 * FamilyCal – gemeinsame Kalender-Logik für Server (PocketBase JSVM) und App.
 *
 * Diese Datei ist die EINZIGE Quelle. Sie wird kopiert nach:
 *   - server/pb_hooks/lib/calendar.js   (Dockerfile / docker-compose)
 *   - app/src/lib/calendar.js           (npm postinstall: scripts/sync-shared.js)
 *
 * Bewusst einfaches ES2015 + CommonJS, damit es sowohl in goja (PocketBase)
 * als auch in Hermes (React Native) läuft. Keine Abhängigkeiten.
 *
 * Zeiten: Termine werden als UTC-Zeitpunkte gespeichert. Wiederholungen
 * werden in der LOKALEN Zeitzone der Laufzeit berechnet (Server: TZ-Variable,
 * App: Gerätezeitzone), damit "jeden Montag 18:00" auch nach der
 * Sommerzeit-Umstellung 18:00 bleibt.
 */

var WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
var WEEKDAY_DE_SHORT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
var WEEKDAY_DE_LONG = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
var MONTH_DE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
var MAX_ITERATIONS = 50000;

/** Wandelt PocketBase-Datum ("2026-11-04 18:00:00.000Z"), ISO-String oder Date in Date. */
function toDate(v) {
  if (v instanceof Date) return new Date(v.getTime());
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return new Date(v);
  var s = String(v).trim();
  // PocketBase nutzt ein Leerzeichen statt "T" – nicht jede Engine parst das.
  if (/^\d{4}-\d{2}-\d{2} \d{2}:/.test(s)) s = s.replace(' ', 'T');
  var d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

/** Format, das PocketBase für Datumsfelder erwartet. */
function toPbDate(d) {
  return toDate(d).toISOString().replace('T', ' ');
}

function pad(n) {
  return n < 10 ? '0' + n : '' + n;
}

/** Datum lokal um n Tage verschieben, Uhrzeit (Wanduhr) bleibt gleich. */
function addDaysLocal(d, n) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds());
}

function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function startOfDayLocal(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function parseUntil(s) {
  // YYYYMMDD oder YYYYMMDDTHHMMSSZ
  var m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(s);
  if (!m) throw new Error('UNTIL ungültig: ' + s);
  if (!m[4]) {
    // Nur Datum: bis Ende dieses Tages (lokal)
    return new Date(+m[1], +m[2] - 1, +m[3], 23, 59, 59, 999);
  }
  if (m[7]) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]));
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
}

/**
 * Unterstützte RRULE-Teilmenge (RFC 5545):
 * FREQ=DAILY|WEEKLY|MONTHLY|YEARLY; INTERVAL=n; BYDAY=MO,TU,...(nur WEEKLY);
 * COUNT=n; UNTIL=YYYYMMDD[THHMMSS[Z]]
 * Gibt null für leere Regel zurück, wirft bei ungültiger Regel.
 */
function parseRRule(str) {
  if (!str) return null;
  var s = String(str).trim();
  if (!s) return null;
  if (s.indexOf('RRULE:') === 0) s = s.slice(6);
  var rule = { freq: null, interval: 1, byday: [], count: null, until: null };
  var parts = s.split(';');
  for (var i = 0; i < parts.length; i++) {
    if (!parts[i]) continue;
    var kv = parts[i].split('=');
    var key = kv[0].toUpperCase();
    var val = (kv[1] || '').toUpperCase();
    if (key === 'FREQ') {
      if (['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].indexOf(val) < 0) throw new Error('FREQ nicht unterstützt: ' + val);
      rule.freq = val;
    } else if (key === 'INTERVAL') {
      var iv = parseInt(val, 10);
      if (!(iv >= 1 && iv <= 1000)) throw new Error('INTERVAL ungültig');
      rule.interval = iv;
    } else if (key === 'BYDAY') {
      var days = val.split(',');
      for (var j = 0; j < days.length; j++) {
        var idx = WEEKDAYS.indexOf(days[j]);
        if (idx < 0) throw new Error('BYDAY ungültig: ' + days[j]);
        if (rule.byday.indexOf(idx) < 0) rule.byday.push(idx);
      }
    } else if (key === 'COUNT') {
      var c = parseInt(val, 10);
      if (!(c >= 1 && c <= 10000)) throw new Error('COUNT ungültig');
      rule.count = c;
    } else if (key === 'UNTIL') {
      rule.until = parseUntil(val);
    } else if (key === 'WKST') {
      // ignoriert, Woche beginnt immer Montag
    } else {
      throw new Error('RRULE-Teil nicht unterstützt: ' + key);
    }
  }
  if (!rule.freq) throw new Error('FREQ fehlt');
  if (rule.byday.length && rule.freq !== 'WEEKLY') throw new Error('BYDAY nur bei WEEKLY unterstützt');
  return rule;
}

/** Baut eine RRULE aus einfachen Optionen (für den Editor in der App). */
function buildRRule(opts) {
  if (!opts || !opts.freq) return '';
  var p = ['FREQ=' + opts.freq];
  if (opts.interval && opts.interval > 1) p.push('INTERVAL=' + opts.interval);
  if (opts.freq === 'WEEKLY' && opts.byday && opts.byday.length) {
    var sorted = opts.byday.slice().sort(function (a, b) { return ((a + 6) % 7) - ((b + 6) % 7); });
    p.push('BYDAY=' + sorted.map(function (d) { return WEEKDAYS[d]; }).join(','));
  }
  if (opts.count) p.push('COUNT=' + opts.count);
  else if (opts.until) {
    var u = toDate(opts.until);
    p.push('UNTIL=' + u.getFullYear() + pad(u.getMonth() + 1) + pad(u.getDate()));
  }
  return p.join(';');
}

/** Deutsche Kurzbeschreibung einer Regel, z. B. "Alle 2 Wochen am Mo, Mi". */
function describeRRule(str) {
  var r;
  try { r = parseRRule(str); } catch (e) { return 'Ungültige Wiederholung'; }
  if (!r) return 'Einmalig';
  var n = r.interval;
  var base;
  if (r.freq === 'DAILY') base = n === 1 ? 'Täglich' : 'Alle ' + n + ' Tage';
  else if (r.freq === 'WEEKLY') {
    base = n === 1 ? 'Wöchentlich' : 'Alle ' + n + ' Wochen';
    if (r.byday.length) {
      var d = r.byday.slice().sort(function (a, b) { return ((a + 6) % 7) - ((b + 6) % 7); });
      base += ' am ' + d.map(function (x) { return WEEKDAY_DE_SHORT[x]; }).join(', ');
    }
  } else if (r.freq === 'MONTHLY') base = n === 1 ? 'Monatlich' : 'Alle ' + n + ' Monate';
  else base = n === 1 ? 'Jährlich' : 'Alle ' + n + ' Jahre';
  if (r.count) base += ', ' + r.count + '×';
  else if (r.until) base += ', bis ' + pad(r.until.getDate()) + '.' + pad(r.until.getMonth() + 1) + '.' + r.until.getFullYear();
  return base;
}

/** Eindeutiger Schlüssel einer Wiederholung (für Ausnahmen / Erinnerungs-Log). */
function occurrenceKey(start) {
  return toDate(start).toISOString();
}

/**
 * Liefert alle Vorkommen eines Termins, die das Fenster [from, to) berühren.
 * ev: { start, end, rrule, exdates: [occurrenceKey, ...] }
 * Rückgabe: [{ start: Date, end: Date, key: string, recurring: bool }]
 */
function expand(ev, from, to, opts) {
  var limit = (opts && opts.limit) || 1000;
  var start = toDate(ev.start);
  var end = toDate(ev.end) || start;
  if (!start) return [];
  var dur = Math.max(0, end.getTime() - start.getTime());
  var f = toDate(from).getTime();
  var t = toDate(to).getTime();
  var out = [];
  var rule;
  try { rule = parseRRule(ev.rrule); } catch (e) { rule = null; }

  if (!rule) {
    // Ganztägig/0-Dauer: als Zeitpunkt behandeln, der "berührt" wenn start in [f,t)
    var s0 = start.getTime();
    var e0 = s0 + dur;
    if ((dur === 0 && s0 >= f && s0 < t) || (dur > 0 && s0 < t && e0 > f)) {
      out.push({ start: start, end: new Date(e0), key: occurrenceKey(start), recurring: false });
    }
    return out;
  }

  var ex = {};
  var exd = ev.exdates || [];
  if (typeof exd === 'string') { try { exd = JSON.parse(exd); } catch (e) { exd = []; } }
  for (var i = 0; i < exd.length; i++) ex[occurrenceKey(exd[i])] = true;

  var generated = 0;
  var untilMs = rule.until ? rule.until.getTime() : Infinity;
  var iter = 0;

  function emit(cand) {
    // gibt false zurück, wenn die Expansion enden soll
    var cs = cand.getTime();
    if (cs < start.getTime()) return true;
    if (cs > untilMs) return false;
    if (rule.count !== null && generated >= rule.count) return false;
    generated++;
    if (cs >= t) return false;
    var key = occurrenceKey(cand);
    if (!ex[key] && cs + dur > f - (dur === 0 ? 1 : 0) && (dur > 0 || cs >= f)) {
      out.push({ start: cand, end: new Date(cs + dur), key: key, recurring: true });
      if (out.length >= limit) return false;
    }
    return true;
  }

  // Abkürzung: Bei DAILY/WEEKLY ohne COUNT weit vor dem Fenster beginnen ist
  // teuer – wir springen in ganzen Intervallen nahe an das Fenster heran.
  var skip = 0;
  if (rule.count === null && f > start.getTime()) {
    var dayMs = 86400000;
    if (rule.freq === 'DAILY') skip = Math.max(0, Math.floor((f - start.getTime() - dur) / (dayMs * rule.interval)) - 2);
    else if (rule.freq === 'WEEKLY') skip = Math.max(0, Math.floor((f - start.getTime() - dur) / (7 * dayMs * rule.interval)) - 2);
  }

  if (rule.freq === 'DAILY') {
    for (var k = skip; iter++ < MAX_ITERATIONS; k++) {
      if (!emit(addDaysLocal(start, k * rule.interval))) break;
    }
  } else if (rule.freq === 'WEEKLY') {
    var days = rule.byday.length ? rule.byday.slice() : [start.getDay()];
    days.sort(function (a, b) { return ((a + 6) % 7) - ((b + 6) % 7); });
    var monOffset = (start.getDay() + 6) % 7; // 0 = Montag
    var weekAnchor = addDaysLocal(start, -monOffset); // Montag der Startwoche, gleiche Uhrzeit
    var stop = false;
    for (var w = skip; !stop && iter++ < MAX_ITERATIONS; w++) {
      var weekStart = addDaysLocal(weekAnchor, w * 7 * rule.interval);
      for (var di = 0; di < days.length; di++) {
        var cand = addDaysLocal(weekStart, (days[di] + 6) % 7);
        if (!emit(cand)) { stop = true; break; }
      }
    }
  } else if (rule.freq === 'MONTHLY') {
    var dom = start.getDate();
    for (var m = 0; iter++ < MAX_ITERATIONS; m++) {
      var y = start.getFullYear();
      var mo = start.getMonth() + m * rule.interval;
      var ym = new Date(y, mo, 1);
      if (dom > daysInMonth(ym.getFullYear(), ym.getMonth())) {
        // RFC 5545: Monate ohne diesen Tag werden übersprungen
        if (new Date(ym.getFullYear(), ym.getMonth(), 1).getTime() > Math.min(t, untilMs)) break;
        continue;
      }
      var c = new Date(ym.getFullYear(), ym.getMonth(), dom, start.getHours(), start.getMinutes(), start.getSeconds(), start.getMilliseconds());
      if (!emit(c)) break;
    }
  } else if (rule.freq === 'YEARLY') {
    for (var yy = 0; iter++ < MAX_ITERATIONS; yy++) {
      var year = start.getFullYear() + yy * rule.interval;
      if (start.getDate() > daysInMonth(year, start.getMonth())) {
        if (new Date(year, start.getMonth(), 1).getTime() > Math.min(t, untilMs)) break;
        continue; // 29. Februar
      }
      var cy = new Date(year, start.getMonth(), start.getDate(), start.getHours(), start.getMinutes(), start.getSeconds(), start.getMilliseconds());
      if (!emit(cy)) break;
    }
  }
  return out;
}

/** "Mi 04.11. 18:00–19:00" bzw. "Mi 04.11. ganztägig" (lokale Zeit). */
function formatWhen(start, end, allDay) {
  var s = toDate(start);
  var e = toDate(end) || s;
  var day = WEEKDAY_DE_SHORT[s.getDay()] + ' ' + pad(s.getDate()) + '.' + pad(s.getMonth() + 1) + '.';
  if (allDay) {
    // Ende ist exklusiv (Mitternacht des Folgetags)
    var lastDay = new Date(e.getTime() - 1);
    if (startOfDayLocal(lastDay).getTime() > startOfDayLocal(s).getTime()) {
      return day + ' – ' + WEEKDAY_DE_SHORT[lastDay.getDay()] + ' ' + pad(lastDay.getDate()) + '.' + pad(lastDay.getMonth() + 1) + '.';
    }
    return day + ' ganztägig';
  }
  var time = pad(s.getHours()) + ':' + pad(s.getMinutes());
  if (e.getTime() > s.getTime()) {
    var sameDay = startOfDayLocal(s).getTime() === startOfDayLocal(e).getTime();
    time += '–' + (sameDay ? '' : WEEKDAY_DE_SHORT[e.getDay()] + ' ') + pad(e.getHours()) + ':' + pad(e.getMinutes());
  }
  return day + ' ' + time;
}

/** "in 15 Min", "in 2 Std", "morgen", "in 3 Tagen" für Erinnerungen. */
function formatLead(minutes) {
  if (minutes <= 0) return 'Jetzt';
  if (minutes < 60) return 'In ' + minutes + ' Min';
  if (minutes < 1440) return 'In ' + Math.round(minutes / 60) + ' Std';
  var d = Math.round(minutes / 1440);
  return d === 1 ? 'Morgen' : 'In ' + d + ' Tagen';
}

/** Erlaubte Erinnerungs-Vorlaufzeiten in Minuten (max. 7 Tage). */
var REMINDER_OPTIONS = [0, 5, 10, 15, 30, 60, 120, 1440, 2880, 10080];
var MAX_REMINDER_MINUTES = 10080;

module.exports = {
  WEEKDAYS: WEEKDAYS,
  WEEKDAY_DE_SHORT: WEEKDAY_DE_SHORT,
  WEEKDAY_DE_LONG: WEEKDAY_DE_LONG,
  MONTH_DE: MONTH_DE,
  REMINDER_OPTIONS: REMINDER_OPTIONS,
  MAX_REMINDER_MINUTES: MAX_REMINDER_MINUTES,
  toDate: toDate,
  toPbDate: toPbDate,
  addDaysLocal: addDaysLocal,
  startOfDayLocal: startOfDayLocal,
  parseRRule: parseRRule,
  buildRRule: buildRRule,
  describeRRule: describeRRule,
  occurrenceKey: occurrenceKey,
  expand: expand,
  formatWhen: formatWhen,
  formatLead: formatLead,
  pad: pad
};
