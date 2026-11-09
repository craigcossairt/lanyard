// API payloads (02-contracts section 4). All routes live under /api and speak JSON.
import { z } from 'zod';
import {
  AccessibilityPrefs,
  Alert,
  Event,
  Id,
  IsoDateTime,
  PresenceKind,
  Question,
  QuestionCluster,
  QuestionStatus,
  Role,
  Room,
  Session,
  SignalType,
} from './entities';
import { SignalCounts } from './realtime';

export const API_PREFIX = '/api';

/** Error body for every non-2xx response. */
export const ApiError = z.object({ error: z.object({ code: z.string(), message: z.string() }) });
export type ApiError = z.infer<typeof ApiError>;

export interface HealthResponse {
  status: 'ok';
  role: 'app' | 'worker';
  version: string;
}

/** Claims inside the signed role token (Authorization: Bearer <token>). */
export const TokenClaims = z.object({
  sub: Id, // anonId for attendees, a generated id for role links
  role: Role,
  eventId: Id,
  handle: z.string().optional(),
  iat: z.number().int(),
  exp: z.number().int(),
});
export type TokenClaims = z.infer<typeof TokenClaims>;

// POST /events/:eventId/join
export const JoinRequest = z.object({ joinCode: z.string().max(64).optional() });
export type JoinRequest = z.infer<typeof JoinRequest>;
export const JoinResponse = z.object({
  anonId: Id,
  handle: z.string(),
  token: z.string(),
  role: Role,
  eventId: Id,
});
export type JoinResponse = z.infer<typeof JoinResponse>;

// GET /events/:eventId
export const EventView = z.object({
  event: Event,
  rooms: z.array(Room),
  now: z.array(Session),
  next: z.array(Session),
});
export type EventView = z.infer<typeof EventView>;

// POST /events/:eventId/role-links (organizer)
export const RoleLinkRequest = z.object({
  role: z.enum(['speaker', 'organizer', 'vendor', 'venue']),
  count: z.number().int().min(1).max(20).default(1),
  label: z.string().max(80).optional(),
  ttlHours: z.number().int().min(1).max(72).default(24),
});
export type RoleLinkRequest = z.input<typeof RoleLinkRequest>;
/** `url` carries the token in the fragment: `<base>/join#t=<token>`. */
export const RoleLinkResponse = z.object({
  links: z.array(z.object({ role: Role, url: z.string(), expiresAt: IsoDateTime })),
});
export type RoleLinkResponse = z.infer<typeof RoleLinkResponse>;

// GET /events/:eventId/search?q=&track=&level=&from=&to=
export const SearchQuery = z
  .object({
    q: z.string().trim().min(1).max(200),
    limit: z.coerce.number().int().min(1).max(50).optional(),
    track: z.string().min(1).max(100).optional(),
    level: z.string().min(1).max(40).optional(),
    from: IsoDateTime.optional(),
    to: IsoDateTime.optional(),
  })
  .refine((value) => !value.from || !value.to || Date.parse(value.from) < Date.parse(value.to), {
    message: 'from must precede to',
    path: ['to'],
  });
export const SearchHit = z.object({
  session: Session,
  score: z.number(),
  highlights: z.array(z.string()).optional(),
});
export const SearchResponse = z.object({ hits: z.array(SearchHit) });
export type SearchResponse = z.infer<typeof SearchResponse>;

// POST /events/:eventId/plan-my-day
export const PlanMyDayRequest = z.object({
  interests: z.string().max(500),
  date: z.string().optional(),
});
export const PlanMyDayResponse = z.object({
  plan: z.array(z.object({ sessionId: Id, reason: z.string() })),
  summary: z.string(),
});
export type PlanMyDayResponse = z.infer<typeof PlanMyDayResponse>;

// POST /events/:eventId/ask
export const AskRequest = z.object({ question: z.string().min(1).max(500) });
export const AskResponse = z.object({
  answer: z.string(),
  citations: z.array(
    z.object({ sessionId: Id, chunkId: Id.optional(), questionId: Id.optional() }),
  ),
});
export type AskResponse = z.infer<typeof AskResponse>;

// GET and PUT /me/schedule
export const MySchedule = z.object({ sessionIds: z.array(Id) });
export type MySchedule = z.infer<typeof MySchedule>;

// PUT /me/prefs
export const PrefsRequest = z.object({
  accessibility: AccessibilityPrefs.optional(),
  language: z.string().max(16).optional(),
  interests: z.string().max(500).optional(), // opt-in
});
export type PrefsRequest = z.infer<typeof PrefsRequest>;

// POST /sessions/:id/presence
export const PresenceRequest = z.object({ kind: PresenceKind });
export const PresenceResponse = z.object({ count: z.number().int(), capacity: z.number().int() });

// POST /sessions/:id/transcript (speaker)
export const TranscriptRequest = z.object({
  text: z.string().min(1).max(2000),
  seq: z.number().int().nonnegative().optional(),
  startedAt: IsoDateTime.optional(),
  endedAt: IsoDateTime.optional(),
  lang: z.string().max(16).default('en'),
  source: z.enum(['speech', 'typed']).default('speech'),
});
export type TranscriptRequest = z.input<typeof TranscriptRequest>;
export const TranscriptResponse = z.object({ chunkId: Id, seq: z.number().int() });

// POST /sessions/:id/questions (attendee)
export const AskQuestionRequest = z.object({ text: z.string().min(1).max(500) });
export const AskQuestionResponse = z.object({
  question: Question,
  cluster: QuestionCluster,
  merged: z.boolean(),
});
export type AskQuestionResponse = z.infer<typeof AskQuestionResponse>;

// GET session snapshot (questions + clusters), used after SSE reconnect
export const SessionSnapshot = z.object({
  session: Session,
  questions: z.array(Question),
  clusters: z.array(QuestionCluster),
  attendance: z.object({ count: z.number().int(), capacity: z.number().int() }).optional(),
});
export type SessionSnapshot = z.infer<typeof SessionSnapshot>;

// POST /questions/:id/vote ; PATCH /questions/:id (speaker)
export const VoteResponse = z.object({ questionId: Id, votes: z.number().int() });
export const PatchQuestionRequest = z.object({ status: QuestionStatus });

// POST /sessions/:id/signals
export const SignalRequest = z.object({ type: SignalType });
export const SignalResponse = z.object({
  accepted: z.boolean(),
  retryAfterSec: z.number().optional(),
});

// POST /sessions/:id/catch-up
export const CatchUpRequest = z.object({ minutes: z.number().int().min(1).max(30).default(5) });
export const CatchUpResponse = z.object({
  summary: z.string(),
  fromSeq: z.number().int(),
  toSeq: z.number().int(),
});
export type CatchUpResponse = z.infer<typeof CatchUpResponse>;

// GET /sessions/:id/digest (P1)
export const DigestResponse = z.object({
  summary: z.string(),
  topClusters: z.array(QuestionCluster),
  signals: SignalCounts,
});

// GET /events/:eventId/ops
export const RoomStatus = z.object({
  room: Room,
  sessionId: Id.optional(),
  occupancy: z.number().int(),
  ratio: z.number(),
  signals: SignalCounts,
  questionCount: z.number().int().nonnegative().optional(),
});
export const OpsSnapshot = z.object({ rooms: z.array(RoomStatus), alerts: z.array(Alert) });
export type OpsSnapshot = z.infer<typeof OpsSnapshot>;

// GET/POST /events/:eventId/ops/simulation (organizer, CNH Demos only)
export const SimulationControlRequest = z.object({
  running: z.boolean(),
  attendees: z.number().int().min(1).max(200).default(40),
  mode: z.enum(['crowd', 'demo']).default('crowd'),
}).refine(request => request.mode !== 'demo' || request.attendees === 40, {
  message: 'Demo mode uses exactly 40 attendees', path: ['attendees'],
});
export type SimulationControlRequest = z.input<typeof SimulationControlRequest>;
export const SimulationStatus = z.object({
  simulated: z.literal(true),
  mode: z.enum(['crowd', 'demo']).optional(),
  running: z.boolean(),
  stopping: z.boolean(),
  attendees: z.number().int().min(0).max(200),
  startedAt: IsoDateTime.optional(),
  endsAt: IsoDateTime.optional(),
});
export type SimulationStatus = z.infer<typeof SimulationStatus>;

// POST /events/:eventId/alerts/:id/reroute
export const RerouteResponse = z.object({ suggested: z.number().int(), toSessionIds: z.array(Id) });

// POST /events/:eventId/reroute/accept (attendee, idempotent per suggestion)
export const RerouteAcceptRequest = z.object({ suggestionId: Id });
export const RerouteAcceptResponse = z.object({ accepted: z.boolean(), sessionId: Id });
export type RerouteAcceptResponse = z.infer<typeof RerouteAcceptResponse>;

// GET /events/:eventId/rooms/:roomId/history
export const RoomHistory = z.object({
  points: z.array(
    z.object({ at: IsoDateTime, occupancy: z.number().int(), signals: SignalCounts }),
  ),
});
export type RoomHistory = z.infer<typeof RoomHistory>;

// GET /api/config (runtime config for the SPA; public values only)
export const RuntimeConfig = z.object({
  version: z.string(),
  eventTz: z.string(),
  publicBaseUrl: z.string(),
  rum: z
    .object({ endpoint: z.string(), authToken: z.string(), serviceName: z.string() })
    .optional(),
});
export type RuntimeConfig = z.infer<typeof RuntimeConfig>;
