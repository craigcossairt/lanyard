/** Recording script. All times are offsets from the run's UTC start. */
export const DEMO_DURATION_MS = 150_000;
export const TALK = [
  'Welcome to Lanyard. Conferences are distributed systems made of people.',
  'Rooms behave like services, and attendees are the traffic between them.',
  'A popular talk creates a burst of demand at one endpoint.',
  'An empty room nearby may have plenty of spare capacity.',
  'Today we make that physical system observable, using cloud native tools.',
  'Each arrival updates presence through the same authenticated application route.',
  'OpenTelemetry turns room occupancy and capacity into useful operational signals.',
  'The organizer sees healthy rooms, rising pressure, and actionable alerts.',
  'Meanwhile, captions bring this conversation to every attendee phone.',
  'They help people follow along without depending on perfect room audio.',
  'Someone joining late can ask for a grounded session catch-up.',
  'Questions travel through moderation before reaching the shared discussion.',
  'Elasticsearch finds related questions, even when people use different words.',
  'Instead of repeating ourselves, we join an existing question cluster.',
  'Votes help the speaker see which topics deserve attention next.',
  'Notice how several questions about crowded rooms become one conversation.',
  'Now more attendees are arriving at our Main Stage session.',
  'When occupancy reaches ninety percent, the organizer sees an overflow alert.',
  'This is the moment where observability becomes a useful product action.',
  'The organizer can suggest another session with seats available nearby.',
  'Attendees receive that suggestion and choose whether to accept it.',
  'Accepted suggestions move presence through the normal application workflow.',
  'We measure both suggestions and acceptances to understand the outcome.',
  'The same dashboard also shows question delivery latency and room health.',
  'A louder signal can reveal an audio problem before people leave.',
  'Once that burst passes, the alert resolves as its window clears.',
  'This recording uses clearly labelled simulated people and scripted captions.',
  'The application routes, search, realtime delivery, and telemetry are real.',
  'After the scenario, we remove only the synthetic records it created.',
  'Lanyard makes conferences observable, accessible, and easier to navigate together.',
];

const QUESTIONS = [
  ['How do you handle a thousand people in one room?', 'What happens when a room fills up?', 'How does overflow handling work?'],
  ['Can I catch up if I arrive late to a talk?', 'How can a late arrival get a summary?', 'Can you summarize what I missed in this session?'],
  ['How are similar audience questions grouped together?', 'Can differently worded questions become one cluster?', 'How do you deduplicate audience questions?'],
  ['How do captions help attendees follow a session?', 'Can I read the talk on my phone?', 'Are live captions available for people who cannot hear the speaker?'],
];

export type DemoAction = { id: string; at: number; actor: number } & (
  | { kind: 'join'; stage: 0 | 1 }
  | { kind: 'caption' | 'question'; text: string }
  | { kind: 'signal' }
);

export function demoActions(): DemoAction[] {
  const actions: DemoAction[] = [];
  for (let actor = 0; actor < 40; actor++) actions.push({
    id: `join-${actor}`, actor, kind: 'join', stage: actor < 34 ? 0 : 1,
    at: actor < 20 || actor >= 34 ? Math.floor(actor % 20 / 5) * 1000 : 60_000 + Math.floor((actor - 20) / 5) * 1000,
  });
  TALK.forEach((text, index) => actions.push({ id: `caption-${index}`, actor: 0,
    kind: 'caption', at: (index + 1) * 4000, text: `SIMULATED: ${text}` }));
  QUESTIONS.forEach((group, index) => group.forEach((text, wave) => actions.push({
    id: `question-${index}-${wave}`, actor: index * 3 + wave, kind: 'question',
    at: [8000, 32000, 48000][wave]! + index * (wave === 2 ? 3500 : 4000), text: `SIMULATED: ${text}`,
  })));
  for (let actor = 0; actor < 5; actor++) actions.push({ id: `louder-${actor}`, actor, kind: 'signal', at: 35_000 });
  return actions.sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
}
