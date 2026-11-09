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
import type { LiveSnapshot } from '../../attendee/lib/live';
import { useSse, type SseStatus, type StreamEvent } from '../../attendee/lib/sse';

export type SignalCounts = Partial<Record<SignalType, number>>;

interface State {
  ready: boolean;
  questions: Question[];
  clusters: QuestionCluster[];
  signals: SignalCounts;
  attendance: { count: number; capacity: number } | null;
  captionCount: number;
  ended: boolean;
}

type Action =
  | { type: 'event'; e: StreamEvent }
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
  const e = action.e;
  if (e.type === 'snapshot') {
    const p = (e as LiveSnapshot).payload;
    return {
      ready: true,
      questions: p.questions,
      clusters: p.clusters,
      signals: (p.signals?.counts ?? {}) as SignalCounts,
      attendance: p.attendance ?? state.attendance,
      captionCount: p.captions.length,
      ended: p.status === 'ended',
    };
  }
  const m = e as RealtimeMessage;
  const sid = state.questions[0]?.sessionId ?? state.clusters[0]?.sessionId ?? '';
  switch (m.type) {
    case 'caption.appended':
      return { ...state, captionCount: state.captionCount + 1 };
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
  captionCount: 0,
  ended: false,
};

export interface ConsoleApi extends State {
  stream: SseStatus;
  /** Mark every question in a cluster answered (or reopen). PATCH /questions/:id, speaker role. */
  setAnswered: (clusterId: string, answered: boolean) => Promise<void>;
}

export function useSpeakerConsole(sessionId: string): ConsoleApi {
  const [state, dispatch] = useReducer(reducer, initial);
  const onEvent = useCallback((e: StreamEvent) => dispatch({ type: 'event', e }), []);
  const stream = useSse(`/sessions/${encodeURIComponent(sessionId)}/stream`, onEvent);

  const setAnswered = useCallback(
    async (clusterId: string, answered: boolean) => {
      const status: QuestionStatus = answered ? 'answered' : 'open';
      const ids = state.questions
        .filter((q) => q.clusterId === clusterId && q.status !== 'hidden')
        .map((q) => q.id);
      // Optimistic; the stream's question.updated confirms.
      ids.forEach((id) => dispatch({ type: 'status', questionId: id, status }));
      await Promise.all(
        ids.map((id) => api.patch(`/questions/${encodeURIComponent(id)}`, { status })),
      );
    },
    [state.questions],
  );

  return { ...state, stream, setAnswered };
}
