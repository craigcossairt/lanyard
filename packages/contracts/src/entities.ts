// Domain model (02-contracts section 2). Field names are camelCase and identical in
// ES documents, these types and API payloads. All times are UTC ISO-8601 strings.
import { z } from 'zod';

export const EVENT_IDS = { kubecon: 'kubecon-na-2026', cnhDemos: 'cnh-demos' } as const;

/** UTC only, e.g. 2026-11-09T23:30:00Z (02-contracts: all times UTC in storage and transit). */
export const IsoDateTime = z.iso.datetime();
export const Id = z.string().min(1).max(200);

export const Accessibility = z.object({
  stepFree: z.boolean(),
  hearingLoop: z.boolean(),
  quiet: z.boolean(),
});
export type Accessibility = z.infer<typeof Accessibility>;

export const Event = z.object({
  id: Id,
  name: z.string(),
  timezone: z.string(),
  venueName: z.string(),
  startsAt: IsoDateTime,
  endsAt: IsoDateTime,
  joinCode: z.string().optional(),
});
export type Event = z.infer<typeof Event>;

export const Room = z.object({
  id: Id,
  eventId: Id,
  name: z.string(),
  capacity: z.number().int().nonnegative(),
  floor: z.number().int(),
  x: z.number(),
  y: z.number(),
  accessibility: Accessibility,
});
export type Room = z.infer<typeof Room>;

export const SessionStatus = z.enum(['scheduled', 'live', 'ended']);
export type SessionStatus = z.infer<typeof SessionStatus>;

export const Session = z.object({
  id: Id,
  eventId: Id,
  roomId: Id,
  title: z.string(),
  abstract: z.string(),
  track: z.string(),
  level: z.string(),
  tags: z.array(z.string()),
  speakerIds: z.array(Id),
  speakerNames: z.array(z.string()),
  startsAt: IsoDateTime,
  endsAt: IsoDateTime,
  status: SessionStatus,
});
export type Session = z.infer<typeof Session>;

export const Speaker = z.object({
  id: Id,
  name: z.string(),
  title: z.string(),
  company: z.string(),
  bio: z.string(),
});
export type Speaker = z.infer<typeof Speaker>;

export const Role = z.enum(['attendee', 'speaker', 'organizer', 'vendor', 'venue']);
export type Role = z.infer<typeof Role>;

export const CaptionSize = z.enum(['s', 'm', 'l', 'xl', 'xxl']);
export const AccessibilityPrefs = z.object({
  captionSize: CaptionSize.optional(),
  theme: z.enum(['dark', 'light', 'contrast']).optional(),
  readable: z.boolean().optional(),
  reduceMotion: z.boolean().optional(),
  stepFree: z.boolean().optional(),
  hearingLoop: z.boolean().optional(),
  quiet: z.boolean().optional(),
});
export type AccessibilityPrefs = z.infer<typeof AccessibilityPrefs>;

/** No PII ever. `handle` is generated, e.g. "Teal Otter". */
export const Attendee = z.object({
  anonId: Id,
  eventId: Id,
  handle: z.string(),
  interests: z.string().max(500).optional(),
  accessibility: AccessibilityPrefs.optional(),
  language: z.string().optional(),
});
export type Attendee = z.infer<typeof Attendee>;

export const PresenceKind = z.enum(['join', 'leave', 'checkin']);
export const Presence = z.object({
  anonId: Id,
  eventId: Id,
  roomId: Id.optional(),
  sessionId: Id.optional(),
  kind: PresenceKind,
  at: IsoDateTime,
});
export type Presence = z.infer<typeof Presence>;

export const TranscriptChunk = z.object({
  id: Id,
  sessionId: Id,
  eventId: Id.optional(),
  seq: z.number().int().nonnegative(),
  text: z.string(),
  startedAt: IsoDateTime,
  endedAt: IsoDateTime,
  lang: z.string(),
  source: z.enum(['speech', 'typed']),
});
export type TranscriptChunk = z.infer<typeof TranscriptChunk>;

export const QuestionStatus = z.enum(['open', 'answered', 'hidden']);
export type QuestionStatus = z.infer<typeof QuestionStatus>;

/** `text` never goes into logs, spans or metric labels. */
export const Question = z.object({
  id: Id,
  sessionId: Id,
  eventId: Id.optional(),
  anonId: Id,
  text: z.string(),
  clusterId: Id,
  votes: z.number().int().nonnegative(),
  status: QuestionStatus,
  at: IsoDateTime,
});
export type Question = z.infer<typeof Question>;

export const QuestionCluster = z.object({
  id: Id,
  sessionId: Id,
  label: z.string(),
  size: z.number().int().nonnegative(),
  votes: z.number().int().nonnegative(),
  representativeQuestionId: Id,
});
export type QuestionCluster = z.infer<typeof QuestionCluster>;

export const SignalType = z.enum([
  'slower',
  'louder',
  'cant_see',
  'lost',
  'thumbs_up',
  'too_cold',
  'too_hot',
]);
export type SignalType = z.infer<typeof SignalType>;

export const Signal = z.object({
  sessionId: Id,
  roomId: Id.optional(),
  eventId: Id.optional(),
  anonId: Id,
  type: SignalType,
  at: IsoDateTime,
});
export type Signal = z.infer<typeof Signal>;

export const AlertKind = z.enum(['overflow', 'signal_spike', 'facilities']);
export const Severity = z.enum(['info', 'warn', 'crit']);
export const Alert = z.object({
  id: Id,
  eventId: Id,
  roomId: Id,
  kind: AlertKind,
  severity: Severity,
  openedAt: IsoDateTime,
  resolvedAt: IsoDateTime.optional(),
  actionTaken: z.string().optional(),
});
export type Alert = z.infer<typeof Alert>;

export const Recommendation = z.object({
  suggestionId: Id.optional(), // WS4 reroute recommendations include this for acceptance
  anonId: Id,
  sessionId: Id,
  reason: z.string(),
});
export type Recommendation = z.infer<typeof Recommendation>;

export const Booth = z.object({
  id: Id,
  eventId: Id,
  vendorName: z.string(),
  description: z.string(),
  tags: z.array(z.string()),
});
export type Booth = z.infer<typeof Booth>;

export const Match = z.object({
  anonId: Id,
  boothId: Id.optional(),
  otherAnonId: Id.optional(),
  score: z.number(),
  consented: z.boolean(),
});
export type Match = z.infer<typeof Match>;

/** Opted-in attendee profile stored in cnh-people. Never log these text fields. */
export const NetworkingProfile = z.object({
  anonId: Id,
  eventId: Id,
  handle: z.string(),
  linkedinUrl: z.string().url().regex(/^https:\/\/(?:www\.)?linkedin\.com\/in\/[A-Za-z0-9-]+$/, {
    message: 'Use a LinkedIn profile URL in the form https://www.linkedin.com/in/your-slug',
  }),
  needs: z.string().trim().min(1).max(240),
  offers: z.string().trim().min(1).max(240),
  interests: z.string().trim().min(1).max(500),
  consented: z.literal(true),
});
export type NetworkingProfile = z.infer<typeof NetworkingProfile>;
