// Typed mock of the routes the attendee screens use, behind a flag, so the UI never
// blocks on a backend that hasn't merged. Remove before G3 (15:30).
// Enable: VITE_LANYARD_MOCK=1 (dev) or localStorage.setItem('lanyard.mock', '1').
import type {
  AskQuestionResponse,
  CatchUpResponse,
  EventView,
  PlanMyDayResponse,
  Question,
  QuestionCluster,
  Room,
  SearchResponse,
  Session,
} from '@lanyard/contracts';

export function isMock(): boolean {
  if (import.meta.env.VITE_LANYARD_MOCK === '1') return true;
  try {
    return localStorage.getItem('lanyard.mock') === '1';
  } catch {
    return false;
  }
}

const EVENT_ID = 'cnh-demos';
const at = (h: number, m = 0) => {
  const d = new Date();
  d.setUTCHours(h, m, 0, 0);
  return d.toISOString();
};

const rooms: Room[] = [
  {
    id: 'main-stage',
    eventId: EVENT_ID,
    name: 'Main Stage',
    capacity: 30,
    floor: 1,
    x: 0.2,
    y: 0.4,
    accessibility: { stepFree: true, hearingLoop: true, quiet: false },
  },
  {
    id: 'side-stage',
    eventId: EVENT_ID,
    name: 'Side Stage',
    capacity: 100,
    floor: 1,
    x: 0.7,
    y: 0.4,
    accessibility: { stepFree: true, hearingLoop: false, quiet: true },
  },
];

const now = new Date();
const sessions: Session[] = [
  {
    id: 's-lanyard',
    eventId: EVENT_ID,
    roomId: 'main-stage',
    title: 'Lanyard: the conference as a distributed system',
    abstract:
      'Rooms are services, attendees are traffic. Live captions, anonymous Q&A merged by Elasticsearch, and OpenTelemetry for the event itself.',
    track: 'Observability',
    level: 'Intermediate',
    tags: ['otel', 'elasticsearch', 'accessibility'],
    speakerIds: ['sp-craig'],
    speakerNames: ['Craig Cossairt'],
    startsAt: new Date(now.getTime() - 5 * 60_000).toISOString(),
    endsAt: new Date(now.getTime() + 25 * 60_000).toISOString(),
    status: 'live',
  },
  {
    id: 's-hallway',
    eventId: EVENT_ID,
    roomId: 'side-stage',
    title: 'Hallway Track: open Q&A',
    abstract: 'Bring your questions about anything cloud native. Seats available.',
    track: 'Community',
    level: 'Any',
    tags: ['q&a'],
    speakerIds: [],
    speakerNames: ['Hosts'],
    startsAt: new Date(now.getTime() - 5 * 60_000).toISOString(),
    endsAt: new Date(now.getTime() + 55 * 60_000).toISOString(),
    status: 'live',
  },
  {
    id: 's-ebpf',
    eventId: EVENT_ID,
    roomId: 'main-stage',
    title: 'eBPF for security teams: from packets to policy',
    abstract:
      'How runtime security tooling uses eBPF to observe syscalls and enforce policy without sidecars.',
    track: 'Security',
    level: 'Intermediate',
    tags: ['ebpf', 'security'],
    speakerIds: ['sp-ana'],
    speakerNames: ['Ana Ruiz'],
    startsAt: at(23, 0),
    endsAt: at(23, 35),
    status: 'scheduled',
  },
  {
    id: 's-gitops',
    eventId: EVENT_ID,
    roomId: 'side-stage',
    title: 'Progressive delivery with Argo Rollouts and real SLOs',
    abstract:
      'Canary analysis driven by Prometheus and OpenTelemetry metrics, with honest rollbacks.',
    track: 'GitOps',
    level: 'Beginner',
    tags: ['argo', 'slo'],
    speakerIds: ['sp-lee'],
    speakerNames: ['Lee Park'],
    startsAt: at(23, 0),
    endsAt: at(23, 35),
    status: 'scheduled',
  },
];

const questions: Question[] = [
  {
    id: 'q1',
    sessionId: 's-lanyard',
    anonId: 'a_other',
    text: 'How does the duplicate detection pick a threshold?',
    clusterId: 'c1',
    votes: 13,
    status: 'open',
    at: new Date(now.getTime() - 3 * 60_000).toISOString(),
  },
  {
    id: 'q2',
    sessionId: 's-lanyard',
    anonId: 'a_other2',
    text: 'Does this work without Chrome for captions?',
    clusterId: 'c2',
    votes: 4,
    status: 'open',
    at: new Date(now.getTime() - 2 * 60_000).toISOString(),
  },
];
const clusters: QuestionCluster[] = [
  {
    id: 'c1',
    sessionId: 's-lanyard',
    label: 'Duplicate threshold',
    size: 14,
    votes: 13,
    representativeQuestionId: 'q1',
  },
  {
    id: 'c2',
    sessionId: 's-lanyard',
    label: 'Browser support',
    size: 2,
    votes: 4,
    representativeQuestionId: 'q2',
  },
];

function emphasise(text: string, q: string): string {
  const terms = q
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 2);
  if (terms.length === 0) return text;
  const re = new RegExp(
    `(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`,
    'ig',
  );
  return text.replace(re, '<em>$1</em>');
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function mockRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
  await delay(150);
  const url = new URL(path, 'http://mock');
  const p = url.pathname;
  const b = (body ?? {}) as Record<string, unknown>;

  if (method === 'GET' && /^\/events\/[^/]+$/.test(p)) {
    const live = sessions.filter((s) => s.status === 'live');
    const next = sessions.filter((s) => s.status === 'scheduled');
    const view: EventView = {
      event: {
        id: EVENT_ID,
        name: 'CNH Demos',
        timezone: 'America/Denver',
        venueName: 'Salt Palace',
        startsAt: at(16),
        endsAt: at(24),
        joinCode: 'CNH',
      },
      rooms,
      now: live,
      next,
    };
    return view as T;
  }
  if (method === 'GET' && /^\/events\/[^/]+\/search$/.test(p)) {
    const q = url.searchParams.get('q') ?? '';
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    const hits = sessions
      .map((s) => {
        const hay =
          `${s.title} ${s.abstract} ${s.track} ${s.tags.join(' ')} ${s.speakerNames.join(' ')}`.toLowerCase();
        const score = terms.reduce((n, t) => n + (hay.includes(t) ? 1 : 0), 0) + 0.3;
        return { session: s, score, highlights: [emphasise(s.abstract, q)] };
      })
      .filter((h) => terms.length === 0 || h.score > 0.3)
      .sort((a, b) => b.score - a.score);
    return { hits } satisfies SearchResponse as T;
  }
  if (method === 'POST' && /^\/events\/[^/]+\/plan-my-day$/.test(p)) {
    await delay(900);
    const res: PlanMyDayResponse = {
      summary: `Based on "${String(b.interests ?? '')}", here are three talks that fit together without overlapping.`,
      plan: [
        { sessionId: 's-ebpf', reason: 'Security angle on eBPF, matches your interests directly.' },
        { sessionId: 's-gitops', reason: 'SLO-driven delivery pairs well with observability.' },
        { sessionId: 's-hallway', reason: 'Open Q&A to follow up with speakers.' },
      ],
    };
    return res as T;
  }
  if (method === 'POST' && /^\/sessions\/[^/]+\/questions$/.test(p)) {
    const text = String(b.text ?? '');
    const merged = /threshold|duplicate|merge/i.test(text);
    const cluster = merged
      ? { ...clusters[0]!, size: clusters[0]!.size + 1 }
      : {
          id: `c${Date.now()}`,
          sessionId: 's-lanyard',
          label: text.slice(0, 40),
          size: 1,
          votes: 0,
          representativeQuestionId: `q${Date.now()}`,
        };
    const question: Question = {
      id: cluster.representativeQuestionId,
      sessionId: 's-lanyard',
      anonId: 'me',
      text,
      clusterId: cluster.id,
      votes: 0,
      status: 'open',
      at: new Date().toISOString(),
    };
    return { question, cluster, merged } satisfies AskQuestionResponse as T;
  }
  if (method === 'POST' && /^\/questions\/[^/]+\/vote$/.test(p)) {
    return { questionId: p.split('/')[2], votes: 1 } as T;
  }
  if (method === 'POST' && /^\/sessions\/[^/]+\/(signals|presence)$/.test(p)) {
    return { accepted: true, count: 27, capacity: 30 } as T;
  }
  if (method === 'POST' && /^\/sessions\/[^/]+\/catch-up$/.test(p)) {
    await delay(1200);
    const res: CatchUpResponse = {
      summary:
        'The speaker framed a conference as a distributed system: rooms are services and attendees are traffic. Captions come from browser speech recognition, questions are merged semantically in Elasticsearch, and every signal becomes OpenTelemetry metrics in Dash0.',
      fromSeq: 12,
      toSeq: 31,
    };
    return res as T;
  }
  if (method === 'PUT' && p.startsWith('/me/')) return {} as T;
  throw new Error(`mock: no handler for ${method} ${path}`);
}

/** The stream's first event: WS2's `snapshot` shape (see lib/live.ts LiveSnapshot). */
export function mockSnapshot(sessionId: string) {
  const live = sessionId === 's-lanyard';
  return {
    type: 'snapshot' as const,
    at: new Date().toISOString(),
    payload: {
      sessionId,
      roomId: live ? 'main-stage' : 'side-stage',
      status: 'live',
      captions: [] as Array<{ chunkId: string; seq: number; text: string; lang: string }>,
      questions: live ? questions : [],
      clusters: live ? clusters : [],
      signals: { counts: {} as Record<string, number> },
      attendance: { count: live ? 27 : 12, capacity: live ? 30 : 100 },
    },
  };
}

/** Fake caption lines for the mock stream. */
export const MOCK_CAPTIONS = [
  'So before I say anything, scan the QR on the screen.',
  'You are now attendees of this talk, anonymously.',
  'A conference is a distributed system. Rooms are services.',
  'Attendees are traffic, and a full room is a saturation incident.',
  'Ask me anything in the app, and tell me if I am going too fast.',
  'Similar questions merge live, so I answer the one fourteen of you asked.',
];
