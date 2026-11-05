/**
 * Server-Logik für FamilyCal (PocketBase JSVM).
 * Wichtig: PocketBase führt jeden Hook in einem isolierten Kontext aus.
 * Deshalb wird dieses Modul in jedem Handler per require() geladen.
 */
var cal = require(__hooks + "/lib/calendar.js");
var wh = require(__hooks + "/lib/webhooks.js");

var ALLOWED_REMINDERS = cal.REMINDER_OPTIONS;

function parseJsonField(record, field, fallback) {
  var raw = record.getString(field);
  if (!raw || raw === "null") return fallback;
  try {
    var v = JSON.parse(raw);
    return v === null || v === undefined ? fallback : v;
  } catch (e) {
    return fallback;
  }
}

function displayName(user) {
  var n = user.getString("name");
  if (n) return n.slice(0, 40);
  var email = user.getString("email") || "Mitglied";
  return email.split("@")[0].slice(0, 40);
}

var COLORS = ["#D1495B", "#2E86AB", "#3BA55C", "#F2A541", "#7B5EA7", "#16A3A3", "#C2668A", "#5C6B73"];

function nextColor(app, familyId) {
  var used = {};
  var list = app.findRecordsByFilter("memberships", "family = {:f}", "", 500, 0, { f: familyId });
  for (var i = 0; i < list.length; i++) used[list[i].getString("color")] = true;
  for (var c = 0; c < COLORS.length; c++) if (!used[COLORS[c]]) return COLORS[c];
  return COLORS[list.length % COLORS.length];
}

/** Spiegelt die Rollen der Mitgliedschaften in families.members/writers/admins. */
function syncFamilyRoles(app, familyId) {
  var fam;
  try {
    fam = app.findRecordById("families", familyId);
  } catch (e) {
    return; // Familie wurde gelöscht
  }
  var ms = app.findRecordsByFilter("memberships", "family = {:f}", "", 500, 0, { f: familyId });
  var members = [], writers = [], admins = [];
  for (var i = 0; i < ms.length; i++) {
    var u = ms[i].getString("user");
    var r = ms[i].getString("role");
    members.push(u);
    if (r !== "child") writers.push(u);
    if (r === "admin") admins.push(u);
  }
  fam.set("members", members);
  fam.set("writers", writers);
  fam.set("admins", admins);
  app.save(fam);
}

function countAdmins(app, familyId) {
  return app.findRecordsByFilter("memberships", "family = {:f} && role = 'admin'", "", 500, 0, { f: familyId }).length;
}

function findMembership(app, familyId, userId) {
  try {
    return app.findFirstRecordByFilter("memberships", "family = {:f} && user = {:u}", { f: familyId, u: userId });
  } catch (e) {
    return null;
  }
}

function createMembership(app, familyId, user, role) {
  var col = app.findCollectionByNameOrId("memberships");
  var m = new Record(col);
  m.set("family", familyId);
  m.set("user", user.id);
  m.set("role", role);
  m.set("name", displayName(user));
  m.set("color", nextColor(app, familyId));
  app.save(m);
  return m;
}

/** Validiert und normalisiert einen Termin vor dem Speichern. Wirft BadRequestError. */
function validateEvent(app, record) {
  var start = cal.toDate(record.getString("start"));
  var end = cal.toDate(record.getString("end"));
  if (!start) throw new BadRequestError("Start fehlt.");
  if (!end) {
    end = start;
    record.set("end", cal.toPbDate(end));
  }
  if (end.getTime() < start.getTime()) throw new BadRequestError("Ende liegt vor dem Start.");

  var rrule = record.getString("rrule");
  if (rrule) {
    try {
      cal.parseRRule(rrule);
    } catch (e) {
      throw new BadRequestError("Wiederholung ungültig: " + e.message);
    }
  }

  var reminders = parseJsonField(record, "reminders", []);
  if (!Array.isArray(reminders)) throw new BadRequestError("Erinnerungen müssen eine Liste sein.");
  var clean = [];
  for (var i = 0; i < reminders.length; i++) {
    var m = parseInt(reminders[i], 10);
    if (ALLOWED_REMINDERS.indexOf(m) < 0) throw new BadRequestError("Erinnerung nicht erlaubt: " + reminders[i]);
    if (clean.indexOf(m) < 0) clean.push(m);
  }
  record.set("reminders", clean);

  var ex = parseJsonField(record, "exdates", []);
  if (!Array.isArray(ex)) ex = [];
  var exClean = [];
  for (var j = 0; j < ex.length && j < 500; j++) {
    var d = cal.toDate(ex[j]);
    if (d) exClean.push(d.toISOString());
  }
  record.set("exdates", exClean);

  // Teilnehmer müssen zur selben Familie gehören (Mandantentrennung!)
  var fam = record.getString("family");
  var parts = record.getStringSlice("participants");
  for (var k = 0; k < parts.length; k++) {
    var pm;
    try {
      pm = app.findRecordById("memberships", parts[k]);
    } catch (e) {
      throw new BadRequestError("Teilnehmer unbekannt.");
    }
    if (pm.getString("family") !== fam) throw new BadRequestError("Teilnehmer gehört nicht zu dieser Familie.");
  }
}

/** Empfänger (User-IDs) eines Termins: Teilnehmer, sonst ganze Familie; privat = nur Ersteller. */
function recipientsForEvent(app, ev) {
  if (ev.getBool("private")) return [ev.getString("created_by")];
  var parts = ev.getStringSlice("participants");
  if (parts.length) {
    var users = [];
    for (var i = 0; i < parts.length; i++) {
      try {
        var m = app.findRecordById("memberships", parts[i]);
        users.push(m.getString("user"));
      } catch (e) {}
    }
    return users;
  }
  try {
    return app.findRecordById("families", ev.getString("family")).getStringSlice("members");
  } catch (e) {
    return [];
  }
}

function eventSnapshot(ev) {
  return {
    id: ev.id,
    title: ev.getString("title"),
    start: ev.getString("start"),
    end: ev.getString("end"),
    all_day: ev.getBool("all_day"),
    location: ev.getString("location"),
    rrule: ev.getString("rrule"),
    family: ev.getString("family"),
  };
}

/**
 * Legt Webhook-Nachrichten in der Outbox ab (Versand per Cron, mit Wiederholung).
 * type: reminder | created | updated | deleted
 */
function enqueue(app, type, ev, userIds, msg, isParticipantFn) {
  if (!userIds.length) return 0;
  var famId = ev.getString("family");
  var famName = "";
  try {
    famName = app.findRecordById("families", famId).getString("name");
  } catch (e) {}

  var filter = "enabled = true && events ~ {:t} && (family = '' || family = {:f}) && (";
  var params = { t: type, f: famId };
  for (var i = 0; i < userIds.length; i++) {
    filter += (i ? " || " : "") + "user = {:u" + i + "}";
    params["u" + i] = userIds[i];
  }
  filter += ")";
  var hooks = app.findRecordsByFilter("webhooks", filter, "", 500, 0, params);
  var col = app.findCollectionByNameOrId("outbox");
  var n = 0;
  for (var h = 0; h < hooks.length; h++) {
    var hook = hooks[h];
    if (hook.getBool("only_participating") && isParticipantFn && !isParticipantFn(hook.getString("user"))) continue;
    var rec = new Record(col);
    rec.set("webhook", hook.id);
    rec.set("payload", {
      type: type,
      title: msg.title,
      message: msg.message + (famName ? " · " + famName : ""),
      event: eventSnapshot(ev),
      family: { id: famId, name: famName },
      occurrence: msg.occurrence || null,
    });
    rec.set("status", "pending");
    rec.set("attempts", 0);
    rec.set("next_try", cal.toPbDate(new Date()));
    app.save(rec);
    n++;
  }
  return n;
}

/** Änderungsbenachrichtigung an alle Empfänger außer dem Auslöser. */
function notifyChange(app, type, ev, actorId) {
  if (ev.getBool("private")) return;
  var famUsers;
  try {
    famUsers = app.findRecordById("families", ev.getString("family")).getStringSlice("members");
  } catch (e) {
    return;
  }
  var targets = famUsers.filter(function (u) { return u !== actorId; });
  var participantsUsers = recipientsForEvent(app, ev);
  var hasParticipants = ev.getStringSlice("participants").length > 0;
  var actorName = "";
  try {
    var am = findMembership(app, ev.getString("family"), actorId);
    if (am) actorName = am.getString("name");
  } catch (e) {}
  var verb = type === "created" ? "Neuer Termin" : type === "updated" ? "Termin geändert" : "Termin abgesagt";
  var when = cal.formatWhen(ev.getString("start"), ev.getString("end"), ev.getBool("all_day"));
  enqueue(app, type, ev, targets, {
    title: verb + ": " + ev.getString("title"),
    message: when + (actorName ? " (von " + actorName + ")" : ""),
  }, function (userId) {
    return !hasParticipants || participantsUsers.indexOf(userId) >= 0;
  });
}

/** Cron: fällige Erinnerungen finden und in die Outbox legen. */
function processReminders(app) {
  var now = new Date();
  var windowMs = 10 * 60000; // verpasste Erinnerungen bis 10 Min nachholen (z. B. nach Neustart)
  var horizon = new Date(now.getTime() + cal.MAX_REMINDER_MINUTES * 60000 + 60000);
  var past = new Date(now.getTime() - 86400000);
  var events = app.findRecordsByFilter(
    "events",
    "reminders != '[]' && reminders != '' && reminders != 'null' && (rrule != '' || (start <= {:h} && end >= {:p}))",
    "",
    5000,
    0,
    { h: cal.toPbDate(horizon), p: cal.toPbDate(past) }
  );
  var logCol = app.findCollectionByNameOrId("reminder_log");
  var queued = 0;

  for (var i = 0; i < events.length; i++) {
    var ev = events[i];
    var reminders = parseJsonField(ev, "reminders", []);
    if (!reminders.length) continue;
    var maxM = Math.max.apply(null, reminders);
    var occ = cal.expand(
      { start: ev.getString("start"), end: ev.getString("end"), rrule: ev.getString("rrule"), exdates: parseJsonField(ev, "exdates", []) },
      new Date(now.getTime() - windowMs),
      new Date(now.getTime() + maxM * 60000 + 60000),
      { limit: 50 }
    );
    for (var o = 0; o < occ.length; o++) {
      for (var r = 0; r < reminders.length; r++) {
        var m = reminders[r];
        var fireAt = occ[o].start.getTime() - m * 60000;
        if (fireAt > now.getTime() || fireAt <= now.getTime() - windowMs) continue;
        try {
          app.findFirstRecordByFilter("reminder_log", "event = {:e} && occurrence = {:o} && minutes = {:m}", { e: ev.id, o: occ[o].key, m: m });
          continue; // schon verschickt
        } catch (e) {}
        var log = new Record(logCol);
        log.set("event", ev.id);
        log.set("occurrence", occ[o].key);
        log.set("minutes", m);
        app.save(log);

        var when = cal.formatWhen(occ[o].start, occ[o].end, ev.getBool("all_day"));
        var loc = ev.getString("location");
        queued += enqueue(app, "reminder", ev, recipientsForEvent(app, ev), {
          title: (m === 0 ? "Jetzt" : cal.formatLead(m)) + ": " + ev.getString("title"),
          message: when + (loc ? " · " + loc : ""),
          occurrence: occ[o].key,
        }, null);
      }
    }
  }
  return queued;
}

function sendOne(app, hook, payload) {
  var req = wh.buildRequest(
    {
      kind: hook.getString("kind"),
      url: hook.getString("url"),
      token: hook.getString("token"),
      target: hook.getString("target"),
      secret: hook.getString("secret"),
    },
    payload,
    function (data, secret) { return $security.hs256(data, secret); }
  );
  var res = $http.send({ url: req.url, method: req.method, headers: req.headers, body: req.body, timeout: 10 });
  return res.statusCode;
}

/** Cron: Outbox abarbeiten. Fehlversuche mit exponentiellem Backoff, max. 6 Versuche. */
function drainOutbox(app) {
  var now = new Date();
  var due = app.findRecordsByFilter("outbox", "status = 'pending' && next_try <= {:n}", "next_try", 100, 0, { n: cal.toPbDate(now) });
  for (var i = 0; i < due.length; i++) {
    var item = due[i];
    var hook;
    try {
      hook = app.findRecordById("webhooks", item.getString("webhook"));
    } catch (e) {
      app.delete(item);
      continue;
    }
    var status = 0;
    var err = "";
    try {
      status = sendOne(app, hook, parseJsonField(item, "payload", {}));
      if (status < 200 || status >= 300) err = "HTTP " + status;
    } catch (e) {
      err = String(e && e.message ? e.message : e).slice(0, 900);
    }
    var attempts = item.getInt("attempts") + 1;
    item.set("attempts", attempts);
    if (!err) {
      item.set("status", "sent");
      item.set("last_error", "");
    } else {
      item.set("last_error", err);
      if (attempts >= 6) item.set("status", "failed");
      else item.set("next_try", cal.toPbDate(new Date(now.getTime() + Math.pow(2, attempts) * 60000)));
    }
    app.save(item);
    hook.set("last_status", err ? "Fehler: " + err.slice(0, 280) : "OK (HTTP " + status + ")");
    hook.set("last_sent", cal.toPbDate(now));
    app.save(hook);
  }

  // Aufräumen: erledigte Einträge nach 7 Tagen, alte Erinnerungs-Logs nach 30 Tagen
  var old = cal.toPbDate(new Date(now.getTime() - 7 * 86400000));
  var done = app.findRecordsByFilter("outbox", "status != 'pending' && updated < {:o}", "", 500, 0, { o: old });
  for (var d = 0; d < done.length; d++) app.delete(done[d]);
  var oldLogs = app.findRecordsByFilter("reminder_log", "created < {:o}", "", 500, 0, { o: cal.toPbDate(new Date(now.getTime() - 30 * 86400000)) });
  for (var l = 0; l < oldLogs.length; l++) app.delete(oldLogs[l]);
}

/** Prüft Webhook-Konfiguration beim Speichern. */
function validateWebhook(record) {
  try {
    wh.buildRequest(
      {
        kind: record.getString("kind"),
        url: record.getString("url"),
        token: record.getString("token"),
        target: record.getString("target"),
        secret: record.getString("secret"),
      },
      { type: "created", title: "x", message: "x" },
      null
    );
  } catch (err) {
    throw new BadRequestError(String(err && err.message ? err.message : err));
  }
}

module.exports = {
  validateWebhook: validateWebhook,
  cal: cal,
  wh: wh,
  displayName: displayName,
  syncFamilyRoles: syncFamilyRoles,
  countAdmins: countAdmins,
  findMembership: findMembership,
  createMembership: createMembership,
  validateEvent: validateEvent,
  notifyChange: notifyChange,
  processReminders: processReminders,
  drainOutbox: drainOutbox,
  sendOne: sendOne,
};
