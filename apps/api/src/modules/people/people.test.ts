import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import type { estypes } from '@elastic/elasticsearch';
import { NetworkingProfile, type NetworkingProfile as Profile } from '@lanyard/contracts';
import { loadConfig } from '../../core/config';
import { esClient } from '../../core/es';
import { buildServer } from '../../core/server';
import { signToken } from '../../core/tokens';
import people from './index';

test('people routes require consent, isolate events, and remove searchable profiles', async (t) => {
  const key = 'people-smoke-signing-key-not-a-real-secret';
  const app = await buildServer(
    {
      ...loadConfig(),
      tokenSigningKey: key,
      esUrl: 'https://smoke.es.example.test',
      esApiKey: 'fixture-only',
      webDistDir: '/nonexistent',
    },
    [people],
  );
  t.after(() => app.close());

  const profile: Profile = {
    anonId: 'attendee-one',
    eventId: 'event-one',
    handle: 'Teal Otter',
    linkedinUrl: 'https://www.linkedin.com/in/example-one',
    needs: 'Meet observability teams',
    offers: 'Share OpenTelemetry lessons',
    interests: 'Tracing, Kubernetes',
    consented: true,
  };
  const other = NetworkingProfile.parse({
    ...profile,
    anonId: 'attendee-two',
    handle: 'Moss Finch',
    linkedinUrl: 'https://www.linkedin.com/in/example-two',
  });
  const hidden = { ...other, anonId: 'attendee-three', handle: 'Hidden Heron', consented: false };

  const client = esClient();
  const searches: estypes.SearchRequest[] = [];
  let indexed: unknown;
  const getMock = mock.method(
    client,
    'get',
    async (_request: { id?: string }, _opts: { requestTimeout: number }) =>
      ({ _source: profile, found: true }) as never,
  );
  const indexMock = mock.method(
    client,
    'index',
    async (request: { document?: unknown; refresh?: boolean }, _opts: { requestTimeout: number }) => {
      indexed = request.document;
      assert.equal(request.refresh, true);
      return {} as never;
    },
  );
  const deleteMock = mock.method(
    client,
    'delete',
    async (request: { refresh?: boolean }, _opts: { requestTimeout: number }) => {
      assert.equal(request.refresh, true);
      return {} as never;
    },
  );
  const searchMock = mock.method(
    client,
    'search',
    async (request: estypes.SearchRequest, _opts: { requestTimeout: number }) => {
      searches.push(request);
      return {
        hits: {
          hits: [
            { _source: other },
            { _source: profile },
            { _source: hidden },
          ],
        },
      } as never;
    },
  );
  t.after(() => {
    getMock.mock.restore();
    indexMock.mock.restore();
    deleteMock.mock.restore();
    searchMock.mock.restore();
  });

  const token = signToken(key, { sub: profile.anonId, role: 'attendee', eventId: 'event-one' }, 60).token;
  const headers = { authorization: `Bearer ${token}` };
  const saved = await app.inject({
    method: 'PUT',
    url: '/api/me/networking',
    headers,
    payload: {
      linkedinUrl: profile.linkedinUrl,
      needs: profile.needs,
      offers: profile.offers,
      interests: profile.interests,
    },
  });
  assert.equal(saved.statusCode, 200);
  assert.equal((indexed as Profile).anonId, profile.anonId);

  const own = await app.inject({ url: '/api/me/networking', headers });
  assert.equal(own.statusCode, 200);
  assert.equal(own.json().optedIn, true);

  const wrongEvent = await app.inject({
    url: '/api/events/other-event/networking/suggestions',
    headers,
  });
  assert.equal(wrongEvent.statusCode, 403);
  assert.equal(searches.length, 0);

  const suggestions = await app.inject({ url: '/api/events/event-one/networking/suggestions', headers });
  assert.equal(suggestions.statusCode, 200);
  assert.deepEqual(
    suggestions.json().matches.map((match: { handle: string }) => match.handle),
    ['Moss Finch'],
  );
  assert.equal(
    suggestions.json().matches[0]?.reason,
    'Your goals and interests look aligned.',
  );
  const filters = searches[0]?.retriever?.rrf?.retrievers?.flatMap((item) =>
    item && 'standard' in item ? [item.standard?.query?.bool] : [],
  );
  assert.ok(filters?.length === 2);
  for (const filter of filters ?? []) {
    assert.deepEqual(filter?.filter, [
      { term: { eventId: 'event-one' } },
      { term: { consented: true } },
    ]);
    assert.deepEqual(filter?.must_not, [{ term: { anonId: profile.anonId } }]);
  }

  const removed = await app.inject({ method: 'DELETE', url: '/api/me/networking', headers });
  assert.equal(removed.statusCode, 200);
  assert.equal(removed.json().removed, true);
});
