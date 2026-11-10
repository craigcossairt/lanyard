import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import type { estypes } from '@elastic/elasticsearch';
import { SearchResponse, type Session } from '@lanyard/contracts';
import { loadConfig } from '../../core/config';
import { esClient } from '../../core/es';
import { buildServer } from '../../core/server';
import { signToken } from '../../core/tokens';
import { findQuestionCluster, lastTranscriptChunks } from './helpers';
import search from './index';

test('search route and retrieval helpers smoke', async (t) => {
  const key = 'search-smoke-signing-key-not-a-real-secret';
  const app = await buildServer(
    {
      ...loadConfig(),
      tokenSigningKey: key,
      esUrl: 'https://smoke.es.example.test',
      esApiKey: 'fixture-only',
      webDistDir: '/nonexistent',
    },
    [search],
  );
  t.after(() => app.close());
  const session: Session = {
    id: 'talk',
    eventId: 'event',
    roomId: 'room',
    title: 'Kernel incident response',
    abstract: 'Investigate runtime threats',
    track: 'Security',
    level: 'Beginner',
    tags: [],
    speakerIds: [],
    speakerNames: [],
    startsAt: '2026-11-09T18:00:00Z',
    endsAt: '2026-11-09T19:00:00Z',
    status: 'scheduled',
  };
  const requests: estypes.SearchRequest[] = [];
  let partial = false;
  let expireAsk = false;
  let expirePlan = false;
  let restoreClock: (() => void) | undefined;
  t.after(() => restoreClock?.());
  const mocked = mock.method(
    esClient(),
    'search',
    async (request: estypes.SearchRequest, opts: { requestTimeout: number }) => {
      assert.equal(opts.requestTimeout, request.index === 'cnh-questions' ? 4000 : 2000);
      requests.push(request);
      if (request.index === 'cnh-events') return { hits: { hits: [{ _id: 'event', _source: {
        id: 'event', name: 'Fixture', timezone: 'America/Denver', venueName: 'Fixture',
        startsAt: '2026-11-09T00:00:00Z', endsAt: '2026-11-11T00:00:00Z',
      } }] } };
      if (request.index === 'cnh-rooms') return { hits: { hits: [{ _id: 'room', _source: {
        id: 'room', eventId: 'event', name: 'Main Stage', capacity: 30, floor: 1, x: 0, y: 0,
        accessibility: { stepFree: true, hearingLoop: false, quiet: false },
      } }] } };
      if (Array.isArray(request.index)) {
        if (expireAsk) {
          const now = Date.now();
          const clock = mock.method(Date, 'now', () => now + 8_000);
          restoreClock = () => clock.mock.restore();
        }
        return {
          hits: {
            hits: [
              {
                _index: 'cnh-transcripts',
                _id: 'evidence',
                _source: { sessionId: 'talk', eventId: 'event', text: 'Runtime evidence' },
              },
            ],
          },
        };
      }
      if (request.index === 'cnh-questions')
        return { hits: { hits: [{ _source: { clusterId: 'existing' }, _score: 0.95 }] } };
      if (request.index === 'cnh-transcripts')
        return {
          hits: {
            hits: [2, 1].map((seq) => ({
              _id: `chunk-${seq}`,
              _source: {
                sessionId: 'talk',
                seq,
                text: 'fixture',
                startedAt: session.startsAt,
                endedAt: session.endsAt,
                lang: 'en',
                source: 'typed',
              },
            })),
          },
        };
      if (expirePlan) {
        const now = Date.now();
        const clock = mock.method(Date, 'now', () => now + 8_000);
        restoreClock = () => clock.mock.restore();
      }
      return {
        timed_out: partial,
        hits: {
          hits: [
            {
              _id: 'talk',
              _source: session,
              _score: 0.03,
              highlight: { abstract: ['runtime threats'] },
            },
          ],
        },
      };
    },
  );
  t.after(() => mocked.mock.restore());
  const token = signToken(
    key,
    { sub: 'anonymous-fixture', role: 'attendee', eventId: 'event' },
    60,
  ).token;
  const headers = { authorization: `Bearer ${token}` };
  assert.equal(
    (
      await app.inject({
        method: 'POST',
        url: '/api/events/event/ask',
        headers,
        payload: { question: 'What was discussed?' },
      })
    ).statusCode,
    403,
  );
  assert.equal(
    (
      await app.inject({
        method: 'POST',
        url: '/api/events/event/plan-my-day',
        payload: { interests: 'kernel' },
      })
    ).statusCode,
    401,
  );
  assert.equal(
    (
      await app.inject({
        method: 'POST',
        url: '/api/events/other/plan-my-day',
        headers,
        payload: { interests: 'kernel' },
      })
    ).statusCode,
    403,
  );
  assert.equal((await app.inject('/api/events/event/search?q=kernel')).statusCode, 401);
  assert.equal(
    (await app.inject({ url: '/api/events/other/search?q=kernel', headers })).statusCode,
    403,
  );
  assert.equal(
    (await app.inject({ url: '/api/events/event/search?q=%20', headers })).statusCode,
    400,
  );
  const response = await app.inject({
    url: '/api/events/event/search?q=kernel&track=Security&from=2026-11-09T18%3A00%3A00Z&to=2026-11-09T19%3A00%3A00Z',
    headers,
  });
  assert.equal(response.statusCode, 200);
  assert.equal(SearchResponse.parse(response.json()).hits[0]?.highlights?.[0], 'runtime threats');
  const rrf = requests[0]?.retriever?.rrf;
  assert.equal(rrf?.retrievers?.length, 2);
  for (const retriever of rrf?.retrievers ?? []) {
    assert.ok(retriever && 'standard' in retriever);
    assert.deepEqual(retriever.standard?.query?.bool?.filter, [
      { term: { eventId: 'event' } },
      { term: { track: 'Security' } },
      { range: { endsAt: { gt: '2026-11-09T18:00:00Z' } } },
      { range: { startsAt: { lt: '2026-11-09T19:00:00Z' } } },
    ]);
  }
  assert.deepEqual(
    await findQuestionCluster({
      eventId: 'event',
      sessionId: 'talk',
      questionId: 'new',
      text: 'Is this kernel hook safe?',
    }),
    { clusterId: 'existing', score: 0.95 },
  );
  assert.deepEqual(
    (await lastTranscriptChunks('talk', 10)).map((chunk) => chunk.seq),
    [1, 2],
  );
  partial = true;
  assert.equal(
    (await app.inject({ url: '/api/events/event/search?q=kernel', headers })).statusCode,
    503,
  );
  partial = false;
  expirePlan = true;
  const pendingPlan = await app.inject({
    method: 'POST', url: '/api/events/event/plan-my-day', headers,
    payload: { interests: 'kernel', date: '2026-11-09' },
  });
  restoreClock?.();
  expirePlan = false;
  assert.equal(pendingPlan.statusCode, 202);
  assert.equal(pendingPlan.headers['retry-after'], '2');
  assert.deepEqual(pendingPlan.json().plan, []);
  assert.deepEqual(pendingPlan.json().sessions, []);
  expireAsk = true;
  const organizer = signToken(
    key,
    { sub: 'organizer-fixture', role: 'organizer', eventId: 'event' },
    60,
  ).token;
  const accepted = await app.inject({
    method: 'POST',
    url: '/api/events/event/ask',
    headers: { authorization: `Bearer ${organizer}` },
    payload: { question: 'What was discussed?' },
  });
  restoreClock?.();
  assert.equal(accepted.statusCode, 202);
  assert.equal(accepted.headers['retry-after'], '2');
});
