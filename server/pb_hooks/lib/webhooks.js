/**
 * Baut HTTP-Requests für die unterstützten Webhook-Ziele.
 * Reine Funktion ohne PocketBase-Abhängigkeiten (in Node testbar).
 *
 * hook: Datensatz aus der Collection "webhooks"
 *   { kind, url, token, target, secret }
 * msg:  { type, title, message, event, family, occurrence }
 * hmacHex: function(data, secret) -> hex-String (HMAC-SHA256)
 */

var KINDS = ['ntfy', 'pushover', 'telegram', 'homeassistant', 'generic'];
var EVENT_TYPES = ['reminder', 'created', 'updated', 'deleted'];

function genericPayload(msg) {
  return {
    type: msg.type,
    title: msg.title,
    message: msg.message,
    event: msg.event || null,
    family: msg.family || null,
    occurrence: msg.occurrence || null,
    sent_at: new Date().toISOString()
  };
}

function isHttpsOrLocal(url) {
  return /^https:\/\//i.test(url) || /^http:\/\/(localhost|127\.0\.0\.1|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|[^\/:]+\.(lan|local|home\.arpa))/i.test(url);
}

function buildRequest(hook, msg, hmacHex) {
  var kind = hook.kind;
  var headers = { 'Content-Type': 'application/json', 'User-Agent': 'FamilyCal' };
  var url = (hook.url || '').trim();
  var body;

  if (kind === 'ntfy') {
    // url = komplette Topic-URL, z. B. https://ntfy.example.com/familie
    var m = /^(https?:\/\/[^?#]+?)\/([A-Za-z0-9_-]{1,64})\/?$/.exec(url);
    if (!m) throw new Error('ntfy-URL muss auf das Topic enden, z. B. https://ntfy.sh/meine-familie');
    url = m[1];
    body = {
      topic: m[2],
      title: msg.title,
      message: msg.message,
      tags: [msg.type === 'reminder' ? 'alarm_clock' : 'calendar'],
      priority: msg.type === 'reminder' ? 4 : 3
    };
    if (hook.token) headers['Authorization'] = 'Bearer ' + hook.token;
  } else if (kind === 'pushover') {
    url = 'https://api.pushover.net/1/messages.json';
    if (!hook.token || !hook.target) throw new Error('Pushover braucht App-Token und User-Key');
    body = { token: hook.token, user: hook.target, title: msg.title, message: msg.message };
  } else if (kind === 'telegram') {
    if (!hook.token || !hook.target) throw new Error('Telegram braucht Bot-Token und Chat-ID');
    url = 'https://api.telegram.org/bot' + hook.token + '/sendMessage';
    body = { chat_id: hook.target, text: msg.title + '\n' + msg.message, disable_web_page_preview: true };
  } else if (kind === 'homeassistant' || kind === 'generic') {
    if (!url) throw new Error('URL fehlt');
    body = genericPayload(msg);
    if (hook.token) headers['Authorization'] = 'Bearer ' + hook.token;
  } else {
    throw new Error('Unbekannter Webhook-Typ: ' + kind);
  }

  if (!isHttpsOrLocal(url)) throw new Error('Nur HTTPS (oder lokale Adressen) erlaubt');

  var raw = JSON.stringify(body);
  headers['X-FamilyCal-Event'] = msg.type;
  if (hook.secret && hmacHex && (kind === 'generic' || kind === 'homeassistant')) {
    headers['X-FamilyCal-Signature'] = 'sha256=' + hmacHex(raw, hook.secret);
  }
  return { url: url, method: 'POST', headers: headers, body: raw };
}

module.exports = { KINDS: KINDS, EVENT_TYPES: EVENT_TYPES, buildRequest: buildRequest, isHttpsOrLocal: isHttpsOrLocal };
