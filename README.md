# FamilyCal

Ein schlanker, selbst gehosteter Familienkalender für iOS und Android: die nächsten Termine auf einen Blick, mit Notizen, Anhängen, Erinnerungen und einer Farbe pro Person – wie beim Familienplaner an der Küchenwand.

- **App:** Expo / React Native (SDK 57), eine Codebasis für iOS und Android
- **Server:** PocketBase 0.40 mit eigenen Hooks (Mandanten, Rollen, Erinnerungen, Webhooks)
- **Builds:** GitHub Actions → unsignierte IPA zum Sideloaden, APK, Docker-Image

```
familycal/
├── shared/calendar.js        Wiederholungen (RRULE), Datumstexte – für Server UND App
├── server/
│   ├── pb_migrations/        Datenmodell + API-Regeln
│   ├── pb_hooks/             Server-Logik (Rollen, Einladungen, Erinnerungen, Webhooks)
│   ├── Dockerfile, docker-compose.yml, .env.example, Caddyfile.example
├── app/                      Expo-App
│   ├── app/                  Bildschirme (expo-router)
│   ├── src/lib/              Daten, Sync, Benachrichtigungen
│   ├── src/ui/               Design und Bausteine
│   └── plugins/              Config-Plugins (Sideloading, Android-Signierung)
├── tests/                    Tests für Kalender- und Server-Logik
└── .github/workflows/        CI
```

---

## 1. Server einrichten

### Mit Docker (empfohlen)

```bash
cd server
cp .env.example .env          # Admin-Zugang und Zeitzone eintragen
docker compose up -d --build
```

Der Server lauscht nur auf `127.0.0.1:8090`. Davor gehört ein Reverse-Proxy mit HTTPS (Beispiel: `Caddyfile.example`). **Die App akzeptiert nur HTTPS** (Ausnahme: private IP-Adressen zum Testen).

Statt selbst zu bauen kannst du das Image aus der CI nehmen: `ghcr.io/<dein-github-name>/familycal-server:latest` (in `docker-compose.yml` die `image:`-Zeile aktivieren). Das Paket ist anfangs privat; entweder auf GitHub öffentlich stellen oder `docker login ghcr.io` mit einem Token.

**Fehler `unable to open database file (14)`:** Der Container darf nicht in `pb_data` schreiben. Neuere Images korrigieren das beim Start selbst. Bei älteren hilft auf dem Host: `chown -R 1000:1000 server/pb_data`.

### Nach dem ersten Start

1. Admin-Panel öffnen: `https://dein-server/_/` und mit `PB_ADMIN_EMAIL` / `PB_ADMIN_PASSWORD` anmelden. Danach die beiden Zeilen aus `.env` entfernen.
2. **Registrierung schließen**, sobald alle Familienmitglieder ein Konto haben: Collections → `users` → API Rules → *Create rule* auf „Superusers only“ setzen. Neue Konten legst du dann im Admin-Panel an.
3. Optional SMTP einrichten (Settings → Mail), damit „Passwort vergessen“ funktioniert.
4. Läuft der Server hinter einem Proxy: Settings → Application → *Trusted proxy* auf `X-Forwarded-For` setzen, damit die Rate-Limits die echte IP sehen.

### Was der Server schon mitbringt

- Rate-Limits für Login (5 / 10 s) und Einladungscodes (5 / Min)
- Tägliches Backup um 03:30, die letzten 7 bleiben (`pb_data/backups`)
- Anhänge sind **geschützt**: Download nur mit 3 Minuten gültigem Datei-Token und nur für Familienmitglieder
- Healthcheck unter `/api/health`

---

## 2. Wie Mandanten und Rollen funktionieren

Jede **Familie** ist ein eigener Mandant. Ein Konto kann zu mehreren Familien gehören (z. B. getrennte Eltern) und wechselt in der App oben über den Familiennamen.

| Rolle | Termine sehen | Termine bearbeiten | Mitglieder und Einladungen |
|---|---|---|---|
| Admin | ✓ | ✓ | ✓ |
| Mitglied | ✓ | ✓ | – |
| Kind | ✓ | – | – |

Technisch: Hooks spiegeln die Rollen in drei Listen der Familie (`members`, `writers`, `admins`). Die API-Regeln prüfen nur noch „steht der Nutzer in der Liste?“. Clients können diese Listen nicht verändern. Zusätzlich prüft der Server bei jedem Termin, dass alle Teilnehmer zur selben Familie gehören. **Private Termine** sieht nur, wer sie angelegt hat – auch die Anhänge.

Beitreten: Ein Admin erstellt in der App unter *Einstellungen → Familie* einen Einladungscode (7 Tage, einmalig) und teilt ihn. Die eingeladene Person meldet sich an und gibt den Code ein.

---

## 3. Benachrichtigungen

Es gibt zwei Wege, die sich ergänzen:

**Lokal auf dem Gerät** (Standard, an/aus pro Gerät): Die App plant die nächsten 60 Erinnerungen für drei Wochen direkt im System. Kein Server und kein Apple-Push nötig – funktioniert also auch beim Sideloaden. Grenze: Ändert jemand anderes einen Termin, merkt dein Handy das erst beim nächsten Öffnen oder Hintergrund-Abgleich (den iOS nach eigenem Ermessen ausführt).

**Über Webhooks vom Server** (*Einstellungen → Benachrichtigungen → Ziel hinzufügen*): Der Server prüft jede Minute, ob Erinnerungen fällig sind, und meldet zusätzlich neue, geänderte und abgesagte Termine. Versand über eine Warteschlange mit bis zu 6 Wiederholungen bei Fehlern.

| Dienst | Einrichtung |
|---|---|
| **ntfy** (empfohlen) | Topic-URL eintragen, z. B. `https://ntfy.example.de/familie-klein-x7k2`, und in der ntfy-App abonnieren. Selbst gehostet mit iOS: in der ntfy-Server-Config `upstream-base-url: "https://ntfy.sh"` setzen, sonst kommen auf dem iPhone keine sofortigen Pushes an. Topic-Namen schwer erratbar wählen oder Zugangstoken nutzen. |
| Pushover | App-Token und User-Key von pushover.net |
| Telegram | Bot bei @BotFather anlegen, Bot einmal anschreiben, Chat-ID eintragen |
| Home Assistant | Automation mit Webhook-Trigger; Daten in `trigger.json` |
| Eigener Webhook | JSON-POST; mit Geheimnis signiert als `X-FamilyCal-Signature: sha256=<HMAC>` |

Nutzt du lokale Erinnerungen **und** einen Webhook mit „Erinnerungen“, kommen sie doppelt. Am einfachsten: auf dem Handy lokal lassen und beim Webhook nur „Neue Termine / Änderungen / Absagen“ anhaken – oder umgekehrt.

Webhooks dürfen nur an HTTPS-Adressen oder ans Heimnetz gehen.

Beispiel-Payload (eigener Webhook / Home Assistant):

```json
{
  "type": "reminder",
  "title": "In 15 Min: Zahnarzt Lea",
  "message": "Mi 04.11. 18:00–19:00 · Praxis Dr. Berg · Familie Klein",
  "event": { "id": "…", "title": "Zahnarzt Lea", "start": "2026-11-04 17:00:00.000Z", "end": "…", "all_day": false, "location": "Praxis Dr. Berg", "rrule": "", "family": "…" },
  "family": { "id": "…", "name": "Familie Klein" },
  "occurrence": "2026-11-04T17:00:00.000Z",
  "sent_at": "2026-11-04T16:45:01.120Z"
}
```

---

## 4. App bauen

### Über GitHub Actions

| Workflow | Auslöser | Ergebnis |
|---|---|---|
| `tests.yml` | jeder Push / PR | Tests der Kalender- und Server-Logik |
| `server.yml` | Push auf `main` (Server-Dateien), Tags | Docker-Image nach GHCR (amd64 + arm64) |
| `android.yml` | Tag `v*` oder manuell | APK als Artefakt und im Release |
| `ios.yml` | Tag `v*` oder manuell | **unsignierte IPA** als Artefakt und im Release |

Release bauen: `git tag v1.0.0 && git push --tags`. Die Versionsnummer kommt aus dem Tag, die Build-Nummer aus der Laufnummer.

> iOS-Builds laufen auf macOS-Runnern. In privaten Repos zählen diese Minuten zehnfach – deshalb nur bei Tags oder manuell.

### Android: eigenen Signierschlüssel anlegen (einmalig!)

Ohne eigenen Schlüssel signiert die CI mit dem Debug-Key – zum Testen okay, aber ein späterer Wechsel erzwingt eine Neuinstallation (und damit Neuanmeldung).

```bash
keytool -genkeypair -v -keystore familycal.jks -alias familycal -keyalg RSA -keysize 4096 -validity 10000
base64 -w0 familycal.jks > familycal.jks.b64     # macOS: base64 -i familycal.jks
```

Im Repo unter *Settings → Secrets and variables → Actions* anlegen:

- `ANDROID_KEYSTORE_BASE64` – Inhalt von `familycal.jks.b64`
- `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` (= `familycal`), `ANDROID_KEY_PASSWORD`

**Die `.jks`-Datei sicher aufbewahren** (Passwortmanager). Geht sie verloren, kann die installierte App nicht mehr aktualisiert werden.

### iOS: Sideloaden

Die IPA ist unsigniert. Signieren beim Installieren z. B. mit **SideStore/AltStore** oder **Sideloadly**.

- Mit kostenloser Apple-ID läuft die Signatur nach **7 Tagen** ab – AltStore/SideStore frischen sie automatisch auf.
- Das Push-Entitlement wird bewusst entfernt (`plugins/withoutPushEntitlement.js`), damit das Signieren mit kostenloser Apple-ID klappt. Lokale Erinnerungen brauchen es nicht.
- Bundle-ID ist `de.familycal.app` (in `app/app.json` änderbar).

### Lokal entwickeln

```bash
cd app
npm install --legacy-peer-deps
npx expo install --fix        # richtet alle Versionen auf Expo SDK 57 aus
npx expo run:ios              # oder: npx expo run:android
```

Nach dem ersten erfolgreichen `npm install` die **`package-lock.json` committen** – dann nutzt die CI exakt dieselben Versionen (`npm ci`).

Die gemeinsame Logik liegt in `shared/calendar.js` und wird bei `npm install` automatisch nach `app/src/lib/` kopiert. Änderungen immer in `shared/` machen.

Tests: `TZ=Europe/Berlin node --test tests/*.test.js`

---

## 5. Sicherheit im Überblick

- Login-Token im iOS-Schlüsselbund bzw. Android-Keystore (`expo-secure-store`), 30 Tage gültig, wird bei jedem Öffnen erneuert
- Nur HTTPS zum Server; Rate-Limits gegen Passwort- und Code-Raten
- Mandantentrennung serverseitig durch API-Regeln **und** Hooks; Teilnehmer und Familie eines Termins lassen sich nicht auf fremde Familien umbiegen
- Anhänge nur mit kurzlebigem Token abrufbar, erlaubt sind Bilder, PDF, Office, Text und ICS bis 25 MB
- **Nicht** verschlüsselt: Daten und Anhänge liegen im Klartext in `pb_data`. Lege das Volume auf einen verschlüsselten Datenträger (z. B. ZFS-Verschlüsselung oder LUKS in Proxmox) und verschlüssele die Backups, wenn sie den Server verlassen.

---

## 6. Bekannte Grenzen und nächste Schritte

- Termine **ändern** geht nur online; ansehen auch offline (Zwischenspeicher).
- Wiederholungen: täglich, wöchentlich (mit Wochentagen), alle 2 Wochen, monatlich, jährlich, optional mit Enddatum. Regeln wie „jeden 2. Dienstag im Monat“ werden noch nicht unterstützt.
- Wird ein einzelner Termin einer Serie geändert, entsteht ein eigener Termin; die Anhänge der Serie bleiben an der Serie.
- Alle Familienmitglieder sollten in derselben Zeitzone sein (Server-Variable `TZ`).
- Ideen: Homescreen-Widget, ICS-Export/Abo, Ferien- und Geburtstagsimport, Offline-Bearbeitung.
