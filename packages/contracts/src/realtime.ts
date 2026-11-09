// Realtime messages (02-contracts section 5), fanned out over Valkey and delivered as SSE.
import { z } from 'zod';
import {
  Alert,
  Id,
  IsoDateTime,
  QuestionStatus,
  Recommendation,
  SessionStatus,
  SignalType,
} from './entities';

export type ChannelKind = 'session' | 'ops' | 'user';
export const channels = {
  session: (sessionId: string) => `session:${sessionId}` as const,
  ops: (eventId: string) => `ops:${eventId}` as const,
  user: (anonId: string) => `user:${anonId}` as const,
};
export type Channel = ReturnType<(typeof channels)[ChannelKind]>;

export function channelKind(channel: string): ChannelKind {
  const kind = channel.split(':', 1)[0];
  if (kind === 'session' || kind === 'ops' || kind === 'user') return kind;
  throw new Error(`unknown channel kind: ${kind}`);
}

const msg = <T extends string, P extends z.ZodType>(type: T, payload: P) =>
  z.object({ type: z.literal(type), at: IsoDateTime, payload });

export const SignalCounts = z.partialRecord(SignalType, z.number().int().nonnegative());

export const RealtimeMessage = z.discriminatedUnion('type', [
  msg(
    'caption.appended',
    z.object({ chunkId: Id, seq: z.number().int(), text: z.string(), lang: z.string() }),
  ),
  msg(
    'question.created',
    z.object({
      questionId: Id,
      clusterId: Id,
      votes: z.number().int(),
      status: QuestionStatus,
      text: z.string().optional(), // session channels only
    }),
  ),
  msg(
    'question.updated',
    z.object({
      questionId: Id,
      clusterId: Id,
      votes: z.number().int(),
      status: QuestionStatus,
      text: z.string().optional(),
    }),
  ),
  msg(
    'cluster.updated',
    z.object({ clusterId: Id, label: z.string(), size: z.number().int(), votes: z.number().int() }),
  ),
  msg(
    'signals.window',
    z.object({ sessionId: Id, roomId: Id.optional(), windowSec: z.number(), counts: SignalCounts }),
  ),
  msg(
    'attendance.updated',
    z.object({ sessionId: Id, roomId: Id, count: z.number().int(), capacity: z.number().int() }),
  ),
  msg('alert.opened', Alert),
  msg('alert.resolved', Alert),
  msg('reroute.suggested', Recommendation),
  msg('session.status', z.object({ sessionId: Id, status: SessionStatus })),
]);
export type RealtimeMessage = z.infer<typeof RealtimeMessage>;
export type RealtimeType = RealtimeMessage['type'];
export type RealtimePayload<T extends RealtimeType> = Extract<
  RealtimeMessage,
  { type: T }
>['payload'];

/** Build a message with `at` set to now (UTC). */
export function realtime<T extends RealtimeType>(
  type: T,
  payload: RealtimePayload<T>,
): Extract<RealtimeMessage, { type: T }> {
  return { type, at: new Date().toISOString(), payload } as Extract<RealtimeMessage, { type: T }>;
}
