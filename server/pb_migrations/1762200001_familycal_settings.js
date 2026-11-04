/// <reference path="../pb_data/types.d.ts" />
// Grundeinstellungen: App-Name, Rate-Limits (Schutz vor Brute-Force auf Login
// und Einladungscodes), kurze Token-Laufzeit für geschützte Dateien.
migrate((app) => {
  const settings = app.settings();
  settings.meta.appName = "FamilyCal";

  settings.rateLimits.enabled = true;
  settings.rateLimits.rules = [
    { label: "*:auth", audience: "", duration: 10, maxRequests: 5 },
    { label: "*:create", audience: "", duration: 10, maxRequests: 30 },
    { label: "/api/familycal/join", audience: "", duration: 60, maxRequests: 5 },
    { label: "/api/familycal/", audience: "", duration: 60, maxRequests: 30 },
    { label: "/api/", audience: "", duration: 10, maxRequests: 300 },
  ];

  // Backups: täglich 03:30, 7 Stück behalten (liegen in pb_data/backups)
  settings.backups.cron = "30 3 * * *";
  settings.backups.cronMaxKeep = 7;

  app.save(settings);

  // Login-Token der App: 30 Tage, wird bei jeder Nutzung erneuert
  const users = app.findCollectionByNameOrId("users");
  users.authToken.duration = 30 * 24 * 3600;
  users.fileToken.duration = 180; // Anhänge-Links nur 3 Minuten gültig
  app.save(users);
}, (app) => {
  // keine Rücknahme nötig
});
