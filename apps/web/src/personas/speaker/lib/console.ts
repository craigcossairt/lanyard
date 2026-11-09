// Speaker console state from the session stream: clusters, votes, signals, attendance.
import { useCallback, useReducer } from 'react';
import type {
  Question,
  QuestionCluster,
  QuestionStatus,
  RealtimeMessage,
  SignalType,
} from '@lanyard/contracts';
import { api } from '../../attendee/lib/api';
import type { CaptionLine, LiveSnapshot } from '../../attendee/lib/live';
import { useSse, type SseStatus } from '../../../app/sse';

export type SignalCounts = Partial<Record<SignalType, number>>;

interface State {
  ready: boolean;
  questions: Question[];
  clusters: QuestionCluster[];
  signals: SignalCounts;
  attendance: { count: number; capacity: number } | null;
  /** What attendees see: the snapshot tail plus every caption.appended, from any source. */
  captions: CaptionLine[];
  ended: boolean;
}

const MAX_CAPTIONS = 300;
function addCaption(list: CaptionLine[], c: CaptionLine): CaptionLine[] {
  // Our own POSTs come back on the stream too: one entry per chunk id.
  if (list.some((x) => x.chunkId === c.chunkId)) return list;
  return [...list, c].sort((a, b) => a.seq - b.seq).slice(-MAX_CAPTIONS);
}

type Action =
  | { type: 'snapshot'; snapshot: LiveSnapshot }
  | { type: 'message'; m: RealtimeMessage }
  | { type: 'status'; questionId: string; status: QuestionStatus };

function upsert<T extends { id: string }>(
  list: T[],
  item: Partial<T> & { id: string },
  create: () => T,
): T[] {
  const i = list.findIndex((x) => x.id === item.id);
  if (i < 0) return [...list, { ...create(), ...item }];
  const next = list.slice();
  next[i] = { ...list[i]!, ...item };
  return next;
}

function reducer(state: State, action: Action): State {
  if (action.type === 'status') {
    return {
      ...state,
      questions: state.questions.map((q) =>
        q.id === action.questionId ? { ...q, status: action.status } : q,
      ),
    };
  }
  if (action.type === 'snapshot') {
    const p = action.snapshot.payload;
    return {
      ready: true,
      questions: p.questions,
      clusters: p.clusters,
      signals: (p.signals?.counts ?? {}) as SignalCounts,
      attendance: p.attendance ?? state.attendance,
      captions: p.captions
        .map((c) => ({ chunkId: c.chunkId, seq: c.seq, text: c.text }))
        .sort((a, b) => a.seq - b.seq)
        .slice(-MAX_CAPTIONS),
      ended: p.status === 'ended',
    };
  }
  const m = action.m;
  const sid = state.questions[0]?.sessionId ?? state.clusters[0]?.sessionId ?? '';
  switch (m.type) {
    case 'caption.appended':
      return {
        ...state,
        captions: addCaption(state.captions, {
          chunkId: m.payload.chunkId,
          seq: m.payload.seq,
          text: m.payload.text,
        }),
      };
    case 'question.created':
    case 'question.updated':
      return {
        ...state,
        questions: upsert(
          state.questions,
          {
            id: m.payload.questionId,
            clusterId: m.payload.clusterId,
            votes: m.payload.votes,
            status: m.payload.status,
            ...(m.payload.text !== undefined ? { text: m.payload.text } : {}),
          },
          () => ({
            id: m.payload.questionId,
            sessionId: sid,
            anonId: '',
            text: '',
            clusterId: m.payload.clusterId,
            votes: 0,
            status: 'open',
            at: m.at,
          }),
        ),
      };
    case 'cluster.updated':
      return {
        ...state,
        clusters: upsert(
          state.clusters,
          {
            id: m.payload.clusterId,
            label: m.payload.label,
            size: m.payload.size,
            votes: m.payload.votes,
          },
          () => ({
            id: m.payload.clusterId,
            sessionId: sid,
            label: '',
            size: 1,
            votes: 0,
            representativeQuestionId: '',
          }),
        ),
      };
    case 'signals.window':
      return { ...state, signals: m.payload.counts };
    case 'attendance.updated':
      return { ...state, attendance: { count: m.payload.count, capacity: m.payload.capacity } };
    case 'session.status':
      return { ...state, ended: m.payload.status === 'ended' };
    default:
      return state;
  }
}

const initial: State = {
  ready: false,
  questions: [],
  clusters: [],
  signals: {},
  attendance: null,
  captions: [],
  ended: false,
};

export interface ConsoleApi extends State {
  stream: SseStatus;
  /** Mark every question in a cluster answered (or reopen). PATCH /questions/:id, speaker role. */
  setAnswered: (clusterId: string, answered: boolean) => Promise<void>;
}

export function useSpeakerConsole(sessionId: string): ConsoleApi {
  const [state, dispatch] = useReducer(reducer, initial);
  const onMessage = useCallback((m: RealtimeMessage) => dispatch({ type: 'message', m }), []);
  const onEvent = useCallback((event: string, data: unknown) => {
    if (event === 'snapshot') dispatch({ type: 'snapshot', snapshot: data as LiveSnapshot });
  }, []);
  const stream = useSse(`/sessions/${encodeURIComponent(sessionId)}/stream`, onMessage, {
    onEvent,
  });

  const setAnswered = useCallback(
    async (clusterId: string, answered: boolean) => {
      const status: QuestionStatus = answered ? 'answered' : 'open';
      const targets = state.questions.filter(
        (q) => q.clusterId === clusterId && q.status !== 'hidden',
      );
      // Optimistic; the stream's question.updated confirms. Each failure rolls back its own
      // question, so a partial failure never leaves a phantom "answered" row.
      targets.forEach((q) => dispatch({ type: 'status', questionId: q.id, status }));
      const results = await Promise.allSettled(
        targets.map((q) => api.patch(`/questions/${encodeURIComponent(q.id)}`, { status })),
      );
      const failed = results.filter((r) => r.status === 'rejected').length;
      results.forEach((r, i) => {
        const q = targets[i];
        if (r.status === 'rejected' && q) {
          dispatch({ type: 'status', questionId: q.id, status: q.status });
        }
      });
      if (failed > 0) {
        throw new Error(
          failed === targets.length
            ? 'Could not update that question. Check the connection and try again.'
            : `${failed} of ${targets.length} merged questions could not be updated. Try again.`,
        );
      }
    },
    [state.questions],
  );

  return { ...state, stream, setAnswered };
}
