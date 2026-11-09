// Live session state: snapshot + realtime messages merged into one view model.
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import type {
  AskQuestionResponse,
  Question,
  QuestionCluster,
  RealtimeMessage,
  Recommendation,
  Session,
  SessionSnapshot,
  SignalType,
} from '@lanyard/contracts';
import { api, ApiError } from './api';
import { useSse, type SseStatus } from './sse';

// Snapshot route: 02-contracts names `SessionSnapshot` ("used after SSE reconnect") but
// section 4 has no path yet. WS2 owns it; this is the one place to change.
export const snapshotPath = (id: string) => `/sessions/${encodeURIComponent(id)}`;

export interface CaptionLine {
  chunkId: string;
  seq: number;
  text: string;
}

export type SignalCounts = Partial<Record<SignalType, number>>;

export interface LiveState {
  session: Session | null;
  questions: Question[];
  clusters: QuestionCluster[];
  attendance: { count: number; capacity: number } | null;
  captions: CaptionLine[];
  signals: SignalCounts;
  ended: boolean;
  reroute: Recommendation | null;
  error: string | null;
}

type Action =
  | { type: 'snapshot'; snapshot: SessionSnapshot }
  | { type: 'error'; message: string }
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
      const s = action.snapshot;
      return {
        ...state,
        session: s.session,
        questions: s.questions,
        clusters: s.clusters,
        attendance: s.attendance ?? state.attendance,
        ended: s.session.status === 'ended',
        error: null,
      };
    }
    case 'error':
      return { ...state, error: action.message };
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
          const sessionId = state.session?.id ?? '';
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
              sessionId: state.session?.id ?? '',
              label: m.payload.label,
              size: m.payload.size,
              votes: m.payload.votes,
            }),
          };
        case 'signals.window':
          return { ...state, signals: m.payload.counts };
        case 'attendance.updated':
          return { ...state, attendance: { count: m.payload.count, capacity: m.payload.capacity } };
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
  session: null,
  questions: [],
  clusters: [],
  attendance: null,
  captions: [],
  signals: {},
  ended: false,
  reroute: null,
  error: null,
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
  stream: SseStatus;
  reload: () => void;
  ask: (text: string) => Promise<AskQuestionResponse>;
  vote: (questionId: string) => Promise<void>;
  voted: (questionId: string) => boolean;
  mine: (clusterId: string) => boolean;
  signal: (type: SignalType) => Promise<void>;
  dismissReroute: () => void;
}

export function useLiveSession(sessionId: string): LiveApi {
  const [state, dispatch] = useReducer(reducer, initial);
  const [tick, setTick] = useState(0);
  const votes = useRef(readSet(VOTES_KEY));
  const myClusters = useRef(readSet(MINE_KEY));

  const load = useCallback(async () => {
    try {
      const snap = await api.get<SessionSnapshot>(snapshotPath(sessionId));
      dispatch({ type: 'snapshot', snapshot: snap });
    } catch (e) {
      dispatch({
        type: 'error',
        message: e instanceof ApiError ? e.message : 'Could not load this session',
      });
    }
  }, [sessionId]);

  useEffect(() => {
    void load();
  }, [load, tick]);

  // Presence: drives occupancy (and therefore the organizer's overflow alert).
  useEffect(() => {
    const path = `/sessions/${encodeURIComponent(sessionId)}/presence`;
    void api.post(path, { kind: 'join' }).catch(() => undefined);
    return () => {
      void api.post(path, { kind: 'leave' }).catch(() => undefined);
    };
  }, [sessionId]);

  const onMessage = useCallback((msg: RealtimeMessage) => dispatch({ type: 'message', msg }), []);
  const stream = useSse(`/sessions/${encodeURIComponent(sessionId)}/stream`, onMessage, {
    onReconnect: () => void load(),
  });

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
    votes.current.add(questionId);
    writeSet(VOTES_KEY, votes.current);
    const res = await api.post<{ questionId: string; votes: number }>(
      `/questions/${encodeURIComponent(questionId)}/vote`,
    );
    dispatch({ type: 'localVote', questionId, votes: res.votes });
  }, []);

  const signal = useCallback(
    async (type: SignalType) => {
      await api.post(`/sessions/${encodeURIComponent(sessionId)}/signals`, { type });
    },
    [sessionId],
  );

  return {
    ...state,
    stream,
    reload: () => setTick((t) => t + 1),
    ask,
    vote,
    voted: (id) => votes.current.has(id),
    mine: (clusterId) => myClusters.current.has(clusterId),
    signal,
    dismissReroute: () => dispatch({ type: 'dismissReroute' }),
  };
}
