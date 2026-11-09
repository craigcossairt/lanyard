// Domain metric names (02-contracts section 6). Attributes: event, room, session, type
// or channel kind only. Never anonId, never text.
export const METRICS = {
  roomOccupancy: 'conf.room.occupancy',
  roomCapacity: 'conf.room.capacity',
  sessionAttendees: 'conf.session.attendees',
  signals: 'conf.signals',
  questions: 'conf.questions',
  questionDedup: 'conf.question.dedup',
  rerouteSuggested: 'conf.reroute.suggested',
  rerouteAccepted: 'conf.reroute.accepted',
  captionLagMs: 'conf.caption.lag_ms',
  captionTranslated: 'conf.caption.translated',
  realtimeFanoutMs: 'conf.realtime.fanout_ms',
  sseClients: 'conf.sse.clients',
} as const;
export type MetricName = (typeof METRICS)[keyof typeof METRICS];

export const METRIC_ATTRIBUTES = [
  'event',
  'room',
  'session',
  'type',
  'channel_kind',
  'merged',
] as const;
export type MetricAttribute = (typeof METRIC_ATTRIBUTES)[number];

export const SERVICE_NAMES = {
  app: 'lanyard-app',
  worker: 'lanyard-worker',
  web: 'lanyard-web',
} as const;

export const ES_INDICES = {
  events: 'cnh-events',
  rooms: 'cnh-rooms',
  speakers: 'cnh-speakers',
  sessions: 'cnh-sessions',
  transcripts: 'cnh-transcripts',
  questions: 'cnh-questions',
  signals: 'cnh-signals',
  presence: 'cnh-presence',
  people: 'cnh-people',
  booths: 'cnh-booths',
} as const;
export type EsIndex = (typeof ES_INDICES)[keyof typeof ES_INDICES];
