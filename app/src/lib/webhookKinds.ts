import type { WebhookEventType, WebhookKind } from './types';

export interface KindSpec {
  label: string;
  help: string;
  url?: { label: string; placeholder: string };
  token?: { label: string; placeholder: string; required?: boolean };
  target?: { label: string; placeholder: string };
  secret?: boolean;
}

export const KINDS: Record<WebhookKind, KindSpec> = {
  ntfy: {
    label: 'ntfy',
    help: 'Push aufs Handy über die ntfy-App. Gib die Adresse deines Topics an und abonniere es in der App.',
    url: { label: 'Topic-Adresse', placeholder: 'https://ntfy.sh/familie-klein-x7k2' },
    token: { label: 'Zugangstoken (optional)', placeholder: 'tk_…' },
  },
  pushover: {
    label: 'Pushover',
    help: 'Push über die Pushover-App. Du brauchst einen App-Token und deinen User-Key von pushover.net.',
    token: { label: 'App-Token', placeholder: 'Token deiner Pushover-App', required: true },
    target: { label: 'User-Key', placeholder: 'Dein User-Key' },
  },
  telegram: {
    label: 'Telegram',
    help: 'Nachricht über einen eigenen Telegram-Bot. Bot bei @BotFather anlegen, Bot anschreiben, Chat-ID eintragen.',
    token: { label: 'Bot-Token', placeholder: '123456:ABC-DEF…', required: true },
    target: { label: 'Chat-ID', placeholder: '123456789' },
  },
  homeassistant: {
    label: 'Home Assistant',
    help: 'Löst eine Automation über einen Webhook-Trigger aus. Die Termindaten stehen in trigger.json.',
    url: { label: 'Webhook-Adresse', placeholder: 'https://ha.example.de/api/webhook/familycal' },
    secret: true,
  },
  generic: {
    label: 'Eigener Webhook',
    help: 'POST mit JSON an deine Adresse. Mit Geheimnis wird jede Nachricht signiert (Header X-FamilyCal-Signature, HMAC-SHA256).',
    url: { label: 'Adresse', placeholder: 'https://example.de/hooks/familycal' },
    token: { label: 'Bearer-Token (optional)', placeholder: '' },
    secret: true,
  },
};

export const EVENT_LABELS: Record<WebhookEventType, string> = {
  reminder: 'Erinnerungen',
  created: 'Neue Termine',
  updated: 'Änderungen',
  deleted: 'Absagen',
};
