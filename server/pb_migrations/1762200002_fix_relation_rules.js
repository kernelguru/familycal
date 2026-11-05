/// <reference path="../pb_data/types.d.ts" />
/**
 * Korrektur: Bei Mehrfach-Relationen greift "members ?= @request.auth.id"
 * in PocketBase 0.40 nicht. Richtig ist "members.id ?= @request.auth.id".
 * Diese Migration repariert Server, die mit der ersten Version eingerichtet
 * wurden. Bei neuen Installationen ist sie wirkungslos.
 */
migrate((app) => {
  const fix = (rule) =>
    rule == null ? rule : rule.replace(/\b(members|writers|admins) \?= @request\.auth\.id/g, "$1.id ?= @request.auth.id");
  for (const name of ["families", "memberships", "invites", "events", "webhooks"]) {
    const col = app.findCollectionByNameOrId(name);
    col.listRule = fix(col.listRule);
    col.viewRule = fix(col.viewRule);
    col.createRule = fix(col.createRule);
    col.updateRule = fix(col.updateRule);
    col.deleteRule = fix(col.deleteRule);
    app.save(col);
  }
}, (app) => {});
