// Live session state: the stream's `snapshot` event plus realtime messages, merged into
// one view model. WS2's `GET /sessions/:id/stream` sends `snapshot` first (and again on
// every reconnect), then live messages; there is no separate snapshot route.
import { useCallback, useEffect, useReducer, useRef } from 'react';
import type {
  AskQuestionResponse,
  Question,
  QuestionCluster,
  RealtimeMessage,
  Recommendation,
  Session,
  SignalType,
} from '@lanyard/contracts';
import { api } from './api';
import { useSse, type SseStatus, type StreamEvent } from './sse';

export interface CaptionLine {
  chunkId: string;
  seq: number;
  text: string;
}

export type SignalCounts = Partial<Record<SignalType, number>>;

/** Body of WS2's `snapshot` SSE event (apps/api/src/modules/live/stream.ts). */
export interface LiveSnapshot {
  type: 'snapshot';
  at: string;
  payload: {
    sessionId: string;
    roomId: string;
    status: string;
    captions: Array<{ chunkId: string; seq: number; text: string; lang: string; endedAt?: string }>;
    questions: Question[];
    clusters: QuestionCluster[];
    signals?: { counts: Record<string, number> };
    attendance?: { count: number; capacity: number };
  };
}

export interface LiveState {
  questions: Question[];
  clusters: QuestionCluster[];
  attendance: { count: number; capacity: number } | null;
  captions: CaptionLine[];
  signals: SignalCounts;
  ended: boolean;
  reroute: Recommendation | null;
  /** True once the first snapshot arrived. */
  ready: boolean;
}

type Action =
  | { type: 'snapshot'; snapshot: LiveSnapshot }
  | { type: 'message'; msg: RealtimeMessage }
  | { type: 'dismissReroute' }
  | { type: 'localQuestion'; res: AskQuestionResponse }
  | { type: 'localVote'; questionId: string; votes: number };

const MAX_CAPTIONS = 300;

function upsertQuestion(list: Question[], q: Partial<Question> & { id: string }): Question[] {
  const i = list.findIndex((x) => x.id === q.id);
  if (i < 0) {
    if (!q.sessionId || !q.clusterId) return list;
    return [
      ...list,
      {
        id: q.id,
        sessionId: q.sessionId,
        anonId: q.anonId ?? '',
        text: q.text ?? '',
        clusterId: q.clusterId,
        votes: q.votes ?? 0,
        status: q.status ?? 'open',
        at: q.at ?? new Date().toISOString(),
      },
    ];
  }
  const next = list.slice();
  next[i] = { ...list[i]!, ...q };
  return next;
}

function upsertCluster(
  list: QuestionCluster[],
  c: Partial<QuestionCluster> & { id: string },
): QuestionCluster[] {
  const i = list.findIndex((x) => x.id === c.id);
  if (i < 0) {
    if (!c.sessionId) return list;
    return [
      ...list,
      {
        id: c.id,
        sessionId: c.sessionId,
        label: c.label ?? '',
        size: c.size ?? 1,
        votes: c.votes ?? 0,
        representativeQuestionId: c.representativeQuestionId ?? '',
      },
    ];
  }
  const next = list.slice();
  next[i] = { ...list[i]!, ...c };
  return next;
}

function reducer(state: LiveState, action: Action): LiveState {
  switch (action.type) {
    case 'snapshot': {
      const p = action.snapshot.payload;
      return {
        ...state,
        ready: true,
        questions: p.questions,
        clusters: p.clusters,
        captions: p.captions
          .map((c) => ({ chunkId: c.chunkId, seq: c.seq, text: c.text }))
          .sort((a, b) => a.seq - b.seq)
          .slice(-MAX_CAPTIONS),
        signals: (p.signals?.counts ?? {}) as SignalCounts,
        attendance: p.attendance ?? state.attendance,
        ended: p.status === 'ended',
      };
    }
    case 'dismissReroute':
      return { ...state, reroute: null };
    case 'localQuestion': {
      const { question, cluster } = action.res;
      return {
        ...state,
        questions: upsertQuestion(state.questions, question),
        clusters: upsertCluster(state.clusters, cluster),
      };
    }
    case 'localVote':
      return {
        ...state,
        questions: upsertQuestion(state.questions, { id: action.questionId, votes: action.votes }),
      };
    case 'message': {
      const m = action.msg;
      switch (m.type) {
        case 'caption.appended': {
          if (state.captions.some((c) => c.chunkId === m.payload.chunkId)) return state;
          const captions = [
            ...state.captions,
            { chunkId: m.payload.chunkId, seq: m.payload.seq, text: m.payload.text },
          ]
            .sort((a, b) => a.seq - b.seq)
            .slice(-MAX_CAPTIONS);
          return { ...state, captions };
        }
        case 'question.created':
        case 'question.updated': {
          const sessionId = state.questions[0]?.sessionId ?? state.clusters[0]?.sessionId ?? '';
          return {
            ...state,
            questions: upsertQuestion(state.questions, {
              id: m.payload.questionId,
              sessionId,
              clusterId: m.payload.clusterId,
              votes: m.payload.votes,
              status: m.payload.status,
              ...(m.payload.text !== undefined ? { text: m.payload.text } : {}),
              at: m.at,
            }),
          };
        }
        case 'cluster.updated':
          return {
            ...state,
            clusters: upsertCluster(state.clusters, {
              id: m.payload.clusterId,
              sessionId: state.clusters[0]?.sessionId ?? state.questions[0]?.sessionId ?? '',
              label: m.payload.label,
              size: m.payload.size,
              votes: m.payload.votes,
            }),
          };
        case 'signals.window':
          return { ...state, signals: m.payload.counts };
        case 'attendance.updated':
          return {
            ...state,
            attendance: { count: m.payload.count, capacity: m.payload.capacity },
          };
        case 'session.status':
          return { ...state, ended: m.payload.status === 'ended' };
        case 'reroute.suggested':
          return { ...state, reroute: m.payload };
        default:
          return state;
      }
    }
  }
}

const initial: LiveState = {
  questions: [],
  clusters: [],
  attendance: null,
  captions: [],
  signals: {},
  ended: false,
  reroute: null,
  ready: false,
};

const VOTES_KEY = 'lanyard.votes';
const MINE_KEY = 'lanyard.my-questions';
function readSet(key: string): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(key) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}
function writeSet(key: string, set: Set<string>) {
  try {
    localStorage.setItem(key, JSON.stringify([...set].slice(-500)));
  } catch {
    // Private mode: this visit only.
  }
}

export interface LiveApi extends LiveState {
  /** Session details, when the device has seen this session (home, search, schedule). */
  session: Session | null;
  stream: SseStatus;
  ask: (text: string) => Promise<AskQuestionResponse>;
  vote: (questionId: string) => Promise<void>;
  voted: (questionId: string) => boolean;
  mine: (clusterId: string) => boolean;
  signal: (type: SignalType) => Promise<void>;
  dismissReroute: () => void;
}

/**
 * Mount one instance per session id (the route keys the component by id), so state
 * never carries over from a previous room after a reroute.
 */
export function useLiveSession(sessionId: string, known: Session | null): LiveApi {
  const [state, dispatch] = useReducer(reducer, initial);
  const votes = useRef(readSet(VOTES_KEY));
  const myClusters = useRef(readSet(MINE_KEY));

  // Explicit presence join/leave; the stream also tracks attendee connections server-side.
  useEffect(() => {
    const path = `/sessions/${encodeURIComponent(sessionId)}/presence`;
    void api.post(path, { kind: 'join' }).catch(() => undefined);
    return () => {
      void api.post(path, { kind: 'leave' }).catch(() => undefined);
    };
  }, [sessionId]);

  const onEvent = useCallback((e: StreamEvent) => {
    if (e.type === 'snapshot') dispatch({ type: 'snapshot', snapshot: e as LiveSnapshot });
    else dispatch({ type: 'message', msg: e });
  }, []);
  const stream = useSse(`/sessions/${encodeURIComponent(sessionId)}/stream`, onEvent);

  const ask = useCallback(
    async (text: string) => {
      const res = await api.post<AskQuestionResponse>(
        `/sessions/${encodeURIComponent(sessionId)}/questions`,
        { text },
      );
      myClusters.current.add(res.cluster.id);
      writeSet(MINE_KEY, myClusters.current);
      dispatch({ type: 'localQuestion', res });
      return res;
    },
    [sessionId],
  );

  const vote = useCallback(async (questionId: string) => {
    if (votes.current.has(questionId)) return;
    votes.current.add(questionId); // guards double taps while in flight
    try {
      const res = await api.post<{ questionId: string; votes: number }>(
        `/questions/${encodeURIComponent(questionId)}/vote`,
      );
      writeSet(VOTES_KEY, votes.current);
      dispatch({ type: 'localVote', questionId, votes: res.votes });
    } catch (err) {
      votes.current.delete(questionId); // roll back so the button works again
      throw err;
    }
  }, []);

  const signal = useCallback(
    async (type: SignalType) => {
      await api.post(`/sessions/${encodeURIComponent(sessionId)}/signals`, { type });
    },
    [sessionId],
  );

  return {
    ...state,
    session: known,
    stream,
    ask,
    vote,
    voted: (id) => votes.current.has(id),
    mine: (clusterId) => myClusters.current.has(clusterId),
    signal,
    dismissReroute: () => dispatch({ type: 'dismissReroute' }),
  };
}
