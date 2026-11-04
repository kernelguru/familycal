/// <reference path="../pb_data/types.d.ts" />
/**
 * FamilyCal Server-Hooks.
 * Jeder Handler lädt lib/core.js selbst (PocketBase isoliert Handler).
 */

// ===================== Familien =====================

onRecordCreateRequest((e) => {
  if (!e.auth || e.auth.collection().name !== "users") throw new ForbiddenError("Nur Nutzer können Familien anlegen.");
  e.record.set("owner", e.auth.id);
  e.record.set("members", [e.auth.id]);
  e.record.set("writers", [e.auth.id]);
  e.record.set("admins", [e.auth.id]);
  e.next();
  const core = require(`${__hooks}/lib/core.js`);
  core.createMembership(e.app, e.record.id, e.auth, "admin");
}, "families");

// ===================== Mitgliedschaften =====================

onRecordAfterCreateSuccess((e) => {
  require(`${__hooks}/lib/core.js`).syncFamilyRoles(e.app, e.record.getString("family"));
  e.next();
}, "memberships");

onRecordAfterUpdateSuccess((e) => {
  require(`${__hooks}/lib/core.js`).syncFamilyRoles(e.app, e.record.getString("family"));
  e.next();
}, "memberships");

onRecordAfterDeleteSuccess((e) => {
  require(`${__hooks}/lib/core.js`).syncFamilyRoles(e.app, e.record.getString("family"));
  e.next();
}, "memberships");

// Letzten Admin nicht degradieren
onRecordUpdateRequest((e) => {
  const core = require(`${__hooks}/lib/core.js`);
  const before = e.record.original();
  if (before.getString("role") === "admin" && e.record.getString("role") !== "admin") {
    if (core.countAdmins(e.app, e.record.getString("family")) <= 1) {
      throw new BadRequestError("Die Familie braucht mindestens einen Admin.");
    }
  }
  e.next();
}, "memberships");

// Letzten Admin nicht entfernen (außer die Familie wird gelöscht)
onRecordDeleteRequest((e) => {
  const core = require(`${__hooks}/lib/core.js`);
  if (e.record.getString("role") === "admin" && core.countAdmins(e.app, e.record.getString("family")) <= 1) {
    throw new BadRequestError("Der letzte Admin kann die Familie nicht verlassen. Lösche die Familie oder ernenne zuerst einen anderen Admin.");
  }
  e.next();
}, "memberships");

// ===================== Einladungen =====================

onRecordCreateRequest((e) => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // ohne 0/O/1/I
  e.record.set("code", $security.randomStringWithAlphabet(10, alphabet));
  e.record.set("created_by", e.auth.id);
  if (!e.record.getString("expires")) {
    e.record.set("expires", new Date(Date.now() + 7 * 86400000).toISOString().replace("T", " "));
  }
  if (!e.record.getInt("uses_left")) e.record.set("uses_left", 1);
  e.next();
}, "invites");

routerAdd("POST", "/api/familycal/join", (e) => {
  const core = require(`${__hooks}/lib/core.js`);
  const body = e.requestInfo().body || {};
  const code = String(body.code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (code.length !== 10) throw new BadRequestError("Ungültiger Einladungscode.");

  let invite;
  try {
    invite = e.app.findFirstRecordByFilter("invites", "code = {:c}", { c: code });
  } catch (_) {
    throw new BadRequestError("Ungültiger oder abgelaufener Einladungscode.");
  }
  const expires = core.cal.toDate(invite.getString("expires"));
  if ((expires && expires.getTime() < Date.now()) || invite.getInt("uses_left") < 1) {
    throw new BadRequestError("Ungültiger oder abgelaufener Einladungscode.");
  }
  const familyId = invite.getString("family");
  if (core.findMembership(e.app, familyId, e.auth.id)) {
    return e.json(200, { family: familyId, already: true });
  }

  e.app.runInTransaction((txApp) => {
    const inv = txApp.findRecordById("invites", invite.id);
    const left = inv.getInt("uses_left") - 1;
    if (left <= 0) txApp.delete(inv);
    else {
      inv.set("uses_left", left);
      txApp.save(inv);
    }
    core.createMembership(txApp, familyId, e.auth, inv.getString("role"));
  });
  return e.json(200, { family: familyId, already: false });
}, $apis.requireAuth("users"));

// ===================== Termine =====================

onRecordCreateRequest((e) => {
  const core = require(`${__hooks}/lib/core.js`);
  e.record.set("created_by", e.auth.id);
  core.validateEvent(e.app, e.record);
  e.next();
  try {
    core.notifyChange(e.app, "created", e.record, e.auth.id);
  } catch (err) {
    e.app.logger().warn("notify created failed", "error", String(err));
  }
}, "events");

onRecordUpdateRequest((e) => {
  const core = require(`${__hooks}/lib/core.js`);
  const before = e.record.original();
  // Unveränderliche Felder hart zurücksetzen (zusätzlich zu den API-Regeln)
  e.record.set("family", before.getString("family"));
  e.record.set("created_by", before.getString("created_by"));
  core.validateEvent(e.app, e.record);
  e.next();
  try {
    core.notifyChange(e.app, "updated", e.record, e.auth.id);
  } catch (err) {
    e.app.logger().warn("notify updated failed", "error", String(err));
  }
}, "events");

onRecordDeleteRequest((e) => {
  const core = require(`${__hooks}/lib/core.js`);
  const actor = e.auth ? e.auth.id : "";
  e.next();
  try {
    core.notifyChange(e.app, "deleted", e.record, actor);
  } catch (err) {
    e.app.logger().warn("notify deleted failed", "error", String(err));
  }
}, "events");

// ===================== Webhooks =====================

onRecordCreateRequest((e) => {
  require(`${__hooks}/lib/core.js`).validateWebhook(e.record);
  e.next();
}, "webhooks");

onRecordUpdateRequest((e) => {
  require(`${__hooks}/lib/core.js`).validateWebhook(e.record);
  e.next();
}, "webhooks");

routerAdd("POST", "/api/familycal/webhooks/{id}/test", (e) => {
  const core = require(`${__hooks}/lib/core.js`);
  const id = e.request.pathValue("id");
  let hook;
  try {
    hook = e.app.findRecordById("webhooks", id);
  } catch (_) {
    throw new NotFoundError("Webhook nicht gefunden.");
  }
  if (hook.getString("user") !== e.auth.id) throw new NotFoundError("Webhook nicht gefunden.");

  let status = 0;
  let error = "";
  try {
    status = core.sendOne(e.app, hook, {
      type: "reminder",
      title: "FamilyCal Test",
      message: "Wenn du das liest, funktioniert dein Webhook. 🎉",
      event: null,
      family: null,
    });
    if (status < 200 || status >= 300) error = "HTTP " + status;
  } catch (err) {
    error = String(err && err.message ? err.message : err);
  }
  hook.set("last_status", error ? "Fehler: " + error.slice(0, 280) : "OK (HTTP " + status + ")");
  hook.set("last_sent", new Date().toISOString().replace("T", " "));
  e.app.save(hook);
  return e.json(200, { ok: !error, status: status, error: error });
}, $apis.requireAuth("users"));

// ===================== Cron: Erinnerungen + Versand =====================

cronAdd("familycal_tick", "* * * * *", () => {
  const core = require(`${__hooks}/lib/core.js`);
  try {
    core.processReminders($app);
  } catch (err) {
    $app.logger().error("reminders failed", "error", String(err));
  }
  try {
    core.drainOutbox($app);
  } catch (err) {
    $app.logger().error("outbox failed", "error", String(err));
  }
});
