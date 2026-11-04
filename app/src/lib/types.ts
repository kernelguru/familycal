export type Role = 'admin' | 'member' | 'child';

export interface BaseRecord {
  id: string;
  collectionId: string;
  collectionName: string;
  created: string;
  updated: string;
}

export interface Family extends BaseRecord {
  name: string;
  owner: string;
  members: string[];
  writers: string[];
  admins: string[];
}

export interface Membership extends BaseRecord {
  family: string;
  user: string;
  role: Role;
  name: string;
  color: string;
}

export interface Invite extends BaseRecord {
  family: string;
  code: string;
  role: Role;
  expires: string;
  uses_left: number;
}

export interface CalEvent extends BaseRecord {
  family: string;
  title: string;
  notes: string;
  location: string;
  start: string;
  end: string;
  all_day: boolean;
  rrule: string;
  exdates: string[] | null;
  participants: string[];
  reminders: number[] | null;
  private: boolean;
  attachments: string[];
  created_by: string;
}

export type WebhookKind = 'ntfy' | 'pushover' | 'telegram' | 'homeassistant' | 'generic';
export type WebhookEventType = 'reminder' | 'created' | 'updated' | 'deleted';

export interface Webhook extends BaseRecord {
  user: string;
  family: string;
  name: string;
  kind: WebhookKind;
  url: string;
  token: string;
  target: string;
  secret: string;
  events: WebhookEventType[];
  only_participating: boolean;
  enabled: boolean;
  last_status: string;
  last_sent: string;
}

/** Ein konkretes Vorkommen eines (ggf. wiederkehrenden) Termins. */
export interface Occurrence {
  event: CalEvent;
  start: Date;
  end: Date;
  key: string;
  recurring: boolean;
}
