import { mkdir, writeFile } from 'node:fs/promises';

// Refresh only the public seed fixture; no credentials are needed.
const source = 'https://sessionize.com/api/v2/svi82w6c/view/All';
const response = await fetch(source, { signal: AbortSignal.timeout(20_000) });
if (!response.ok) throw new Error(`Public schedule unavailable (HTTP ${response.status})`);
const raw = await response.json();
const eventId = 'kubecon-na-2026';
const publicTalks = raw.sessions.filter(s => !s.isServiceSession && s.speakers.length && s.description && s.roomId && s.startsAt && s.endsAt);
const usedSpeakers = new Set(publicTalks.flatMap(s => s.speakers));
const usedRooms = new Set(publicTalks.map(s => s.roomId));
const category = new Map(raw.categories.flatMap(c => c.items.map(i => [i.id, { group: c.title, name: i.name }])));
const speakerQuestion = new Map(raw.questions.map(q => [q.id, q.question]));
const speakers = raw.speakers.filter(s => usedSpeakers.has(s.id)).map(s => {
  const answers = new Map(s.questionAnswers.map(a => [speakerQuestion.get(a.questionId), a.answerValue]));
  return { id: `kubecon-speaker-${s.id}`, name: s.fullName, title: answers.get('Job Title') ?? s.tagLine ?? '', company: answers.get('Company') ?? '', bio: s.bio ?? '' };
});
const speakerById = new Map(speakers.map(s => [s.id, s]));
// Sessionize publishes offset-free venue-local times; this event is MST (UTC-7).
const utc = value => {
  if (!/^2026-11-\d\dT\d\d:\d\d:\d\d$/.test(value)) throw new Error('Unexpected schedule timestamp');
  return new Date(`${value}-07:00`).toISOString();
};
const sessions = publicTalks.map(s => {
  const categories = s.categoryItems.map(id => category.get(id)).filter(Boolean);
  const speakerIds = s.speakers.map(id => `kubecon-speaker-${id}`);
  return {
    id: `kubecon-session-${s.id}`, eventId, roomId: `kubecon-room-${s.roomId}`, title: s.title, abstract: s.description,
    track: categories.find(c => c.group === 'All Sessions')?.name ?? 'Cloud Native',
    level: categories.find(c => c.group === 'Audience Level')?.name ?? 'Any Level',
    tags: [...new Set(categories.map(c => c.name))], speakerIds, speakerNames: speakerIds.map(id => speakerById.get(id).name),
    startsAt: utc(s.startsAt), endsAt: utc(s.endsAt), status: 'scheduled',
  };
});
const rooms = raw.rooms.filter(r => usedRooms.has(r.id)).map((r, i) => ({
  id: `kubecon-room-${r.id}`, eventId, name: r.name.trim(), capacity: i === 0 ? 30 : 100,
  floor: Number(r.name.match(/Level (\d+)/)?.[1] ?? 1), x: (i % 5) * 20, y: Math.floor(i / 5) * 20,
  accessibility: { stepFree: false, hearingLoop: false, quiet: false },
}));
const events = [{
  id: eventId, name: 'KubeCon + CloudNativeCon North America 2026', timezone: 'America/Denver',
  venueName: 'Salt Palace Convention Center and Hyatt Regency, Salt Lake City', joinCode: 'KUBECON26',
  startsAt: '2026-11-09T14:00:00.000Z', endsAt: '2026-11-13T01:00:00.000Z',
}, {
  id: 'cnh-demos', name: 'CNH Demos', timezone: 'America/Denver', venueName: 'Cloud Native Hackathon, Salt Lake City',
  joinCode: 'CNH26', startsAt: '2026-11-09T19:00:00.000Z', endsAt: '2026-11-10T02:00:00.000Z',
}];
for (const [id, name, capacity, x] of [['main-stage', 'Main Stage', 30, 0], ['side-stage', 'Side Stage', 100, 20]]) {
  rooms.push({ id: `cnh-${id}`, eventId: 'cnh-demos', name, capacity, floor: 1, x, y: 0, accessibility: { stepFree: false, hearingLoop: false, quiet: false } });
}
sessions.push({
  id: 'cnh-demos-opening', eventId: 'cnh-demos', roomId: 'cnh-main-stage', title: 'CNH Demos: live demos',
  abstract: 'Welcome to the Cloud Native Hackathon demos. Organizers add team presentations live. Join the concurrent Hallway Track for open questions when Main Stage is full.',
  track: 'CNH Demos', level: 'Any Level', tags: ['hackathon', 'demos'], speakerIds: [], speakerNames: [],
  startsAt: events[1].startsAt, endsAt: events[1].endsAt, status: 'live',
}, {
  id: 'cnh-demos-hallway', eventId: 'cnh-demos', roomId: 'cnh-side-stage', title: 'Hallway Track: open Q&A',
  abstract: 'Meet cloud native builders for open Q&A about the hackathon demos, Kubernetes operations, observability, semantic search and accessible conference experiences. Seats are available when Main Stage fills up.',
  track: 'CNH Demos', level: 'Any Level', tags: ['hackathon', 'demos', 'questions'], speakerIds: [], speakerNames: [],
  startsAt: events[1].startsAt, endsAt: events[1].endsAt, status: 'live',
});
const seed = { source, retrievedOn: '2026-11-09', notes: 'Public talk data only. Room capacities and x/y are demo fixtures; accessibility flags are unverified placeholders, not venue guidance. Status is initially scheduled.', events, rooms, speakers, sessions };
await mkdir(new URL('../../data/seed/', import.meta.url), { recursive: true });
await writeFile(new URL('../../data/seed/conference.json', import.meta.url), `${JSON.stringify(seed, null, 2)}\n`);
console.log(JSON.stringify(Object.fromEntries(['events', 'rooms', 'speakers', 'sessions'].map(key => [key, seed[key].length]))));
