/// <reference path="../pb_data/types.d.ts" />
/**
 * FamilyCal – Datenmodell und API-Regeln.
 *
 * Mandantentrennung: Jede Familie ist ein Mandant. Damit die API-Regeln
 * einfach und sicher bleiben, spiegeln Hooks (pb_hooks/main.pb.js) die
 * Rollen aus "memberships" in drei Listen der Familie:
 *   families.members  – alle Mitglieder (lesen)
 *   families.writers  – Admins + Mitglieder (Termine schreiben)
 *   families.admins   – Admins (Familie, Mitglieder, Einladungen verwalten)
 * Diese Listen kann kein Client direkt ändern.
 */
migrate((app) => {
  const users = app.findCollectionByNameOrId("users");

  const autodates = [
    { name: "created", type: "autodate", onCreate: true, onUpdate: false },
    { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
  ];

  // ---------- families ----------
  const families = new Collection({
    type: "base",
    name: "families",
    listRule: "members ?= @request.auth.id",
    viewRule: "members ?= @request.auth.id",
    createRule: "@request.auth.id != '' && @request.auth.collectionName = 'users'",
    updateRule:
      "admins ?= @request.auth.id" +
      " && @request.body.owner:isset = false" +
      " && @request.body.members:isset = false" +
      " && @request.body.writers:isset = false" +
      " && @request.body.admins:isset = false",
    deleteRule: "owner = @request.auth.id",
    fields: [
      { name: "name", type: "text", required: true, min: 1, max: 80 },
      { name: "owner", type: "relation", collectionId: users.id, maxSelect: 1 },
      { name: "members", type: "relation", collectionId: users.id, maxSelect: 200 },
      { name: "writers", type: "relation", collectionId: users.id, maxSelect: 200 },
      { name: "admins", type: "relation", collectionId: users.id, maxSelect: 200 },
      ...autodates,
    ],
  });
  app.save(families);

  // ---------- memberships ----------
  const memberships = new Collection({
    type: "base",
    name: "memberships",
    listRule: "family.members ?= @request.auth.id",
    viewRule: "family.members ?= @request.auth.id",
    createRule: null, // nur über Hooks (Familie anlegen, Einladung einlösen)
    updateRule:
      "(family.admins ?= @request.auth.id || (user = @request.auth.id && @request.body.role:isset = false))" +
      " && @request.body.family:isset = false && @request.body.user:isset = false",
    deleteRule: "family.admins ?= @request.auth.id || user = @request.auth.id",
    fields: [
      { name: "family", type: "relation", collectionId: families.id, maxSelect: 1, required: true, cascadeDelete: true },
      { name: "user", type: "relation", collectionId: users.id, maxSelect: 1, required: true, cascadeDelete: true },
      { name: "role", type: "select", values: ["admin", "member", "child"], maxSelect: 1, required: true },
      { name: "name", type: "text", required: true, min: 1, max: 40 },
      { name: "color", type: "text", max: 7, pattern: "^#[0-9a-fA-F]{6}$" },
      ...autodates,
    ],
    indexes: ["CREATE UNIQUE INDEX idx_membership_unique ON memberships (family, user)"],
  });
  app.save(memberships);

  // ---------- invites ----------
  const invites = new Collection({
    type: "base",
    name: "invites",
    listRule: "family.admins ?= @request.auth.id",
    viewRule: "family.admins ?= @request.auth.id",
    createRule: "family.admins ?= @request.auth.id",
    updateRule: null,
    deleteRule: "family.admins ?= @request.auth.id",
    fields: [
      { name: "family", type: "relation", collectionId: families.id, maxSelect: 1, required: true, cascadeDelete: true },
      { name: "code", type: "text", max: 32 },
      { name: "role", type: "select", values: ["admin", "member", "child"], maxSelect: 1, required: true },
      { name: "expires", type: "date" },
      { name: "uses_left", type: "number", min: 0, max: 50, onlyInt: true },
      { name: "created_by", type: "relation", collectionId: users.id, maxSelect: 1 },
      ...autodates,
    ],
    indexes: ["CREATE UNIQUE INDEX idx_invite_code ON invites (code)"],
  });
  app.save(invites);

  // ---------- events ----------
  const visible = "family.members ?= @request.auth.id && (private = false || created_by = @request.auth.id)";
  const writable = "family.writers ?= @request.auth.id && (private = false || created_by = @request.auth.id)";
  const events = new Collection({
    type: "base",
    name: "events",
    listRule: visible,
    viewRule: visible, // gilt auch für geschützte Anhänge
    createRule: "family.writers ?= @request.auth.id",
    updateRule:
      writable +
      " && (@request.body.family:isset = false || @request.body.family = family)" +
      " && @request.body.created_by:isset = false",
    deleteRule: writable,
    fields: [
      { name: "family", type: "relation", collectionId: families.id, maxSelect: 1, required: true, cascadeDelete: true },
      { name: "title", type: "text", required: true, min: 1, max: 200 },
      { name: "notes", type: "text", max: 10000 },
      { name: "location", type: "text", max: 300 },
      { name: "start", type: "date", required: true },
      { name: "end", type: "date", required: true },
      { name: "all_day", type: "bool" },
      { name: "rrule", type: "text", max: 300 },
      { name: "exdates", type: "json", maxSize: 20000 },
      { name: "participants", type: "relation", collectionId: memberships.id, maxSelect: 50 },
      { name: "reminders", type: "json", maxSize: 1000 },
      { name: "private", type: "bool" },
      {
        name: "attachments",
        type: "file",
        maxSelect: 10,
        maxSize: 26214400, // 25 MB pro Datei
        protected: true, // Download nur mit kurzlebigem File-Token + viewRule
        thumbs: ["240x240"],
        mimeTypes: [
          "image/jpeg", "image/png", "image/heic", "image/heif", "image/webp", "image/gif",
          "application/pdf", "text/plain",
          "application/msword",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "application/vnd.ms-excel",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "text/calendar",
        ],
      },
      { name: "created_by", type: "relation", collectionId: users.id, maxSelect: 1 },
      ...autodates,
    ],
    indexes: [
      "CREATE INDEX idx_events_family_start ON events (family, start)",
      "CREATE INDEX idx_events_rrule ON events (rrule)",
    ],
  });
  app.save(events);

  // ---------- webhooks (pro Nutzer) ----------
  const own = "user = @request.auth.id";
  const webhooks = new Collection({
    type: "base",
    name: "webhooks",
    listRule: own,
    viewRule: own,
    createRule:
      "@request.auth.id != '' && @request.body.user = @request.auth.id" +
      " && (@request.body.family:isset = false || @request.body.family = '' || family.members ?= @request.auth.id)",
    updateRule:
      own + " && @request.body.user:isset = false" +
      " && (@request.body.family:isset = false || @request.body.family = '' || family.members ?= @request.auth.id)",
    deleteRule: own,
    fields: [
      { name: "user", type: "relation", collectionId: users.id, maxSelect: 1, required: true, cascadeDelete: true },
      { name: "family", type: "relation", collectionId: families.id, maxSelect: 1, cascadeDelete: true },
      { name: "name", type: "text", required: true, min: 1, max: 60 },
      { name: "kind", type: "select", values: ["ntfy", "pushover", "telegram", "homeassistant", "generic"], maxSelect: 1, required: true },
      { name: "url", type: "text", max: 500 },
      { name: "token", type: "text", max: 300 },
      { name: "target", type: "text", max: 200 },
      { name: "secret", type: "text", max: 200 },
      { name: "events", type: "select", values: ["reminder", "created", "updated", "deleted"], maxSelect: 4 },
      { name: "only_participating", type: "bool" },
      { name: "enabled", type: "bool" },
      { name: "last_status", type: "text", max: 300 },
      { name: "last_sent", type: "date" },
      ...autodates,
    ],
  });
  app.save(webhooks);

  // ---------- outbox (nur Server) ----------
  const outbox = new Collection({
    type: "base",
    name: "outbox",
    listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
    fields: [
      { name: "webhook", type: "relation", collectionId: webhooks.id, maxSelect: 1, required: true, cascadeDelete: true },
      { name: "payload", type: "json", maxSize: 50000 },
      { name: "status", type: "select", values: ["pending", "sent", "failed"], maxSelect: 1 },
      { name: "attempts", type: "number", onlyInt: true },
      { name: "next_try", type: "date" },
      { name: "last_error", type: "text", max: 1000 },
      ...autodates,
    ],
    indexes: ["CREATE INDEX idx_outbox_due ON outbox (status, next_try)"],
  });
  app.save(outbox);

  // ---------- reminder_log (nur Server, verhindert Doppelversand) ----------
  const reminderLog = new Collection({
    type: "base",
    name: "reminder_log",
    listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
    fields: [
      { name: "event", type: "relation", collectionId: events.id, maxSelect: 1, required: true, cascadeDelete: true },
      { name: "occurrence", type: "text", required: true, max: 40 },
      { name: "minutes", type: "number", onlyInt: true },
      ...autodates,
    ],
    indexes: ["CREATE UNIQUE INDEX idx_reminder_once ON reminder_log (event, occurrence, minutes)"],
  });
  app.save(reminderLog);
}, (app) => {
  for (const name of ["reminder_log", "outbox", "webhooks", "events", "invites", "memberships", "families"]) {
    try {
      app.delete(app.findCollectionByNameOrId(name));
    } catch (_) {}
  }
});
