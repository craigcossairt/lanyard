import { createHash } from 'node:crypto';
import { metrics } from '@opentelemetry/api';
import {
  ES_INDICES,
  Id,
  METRICS,
  MyNetworkingResponse,
  NetworkingProfile,
  NetworkingProfileRequest,
  NetworkingSuggestionsResponse,
} from '@lanyard/contracts';
import type { estypes } from '@elastic/elasticsearch';
import { authOf, requireRole } from '../../core/auth';
import { cached, es } from '../../core/es';
import { HttpError, parse } from '../../core/errors';
import { defineModule } from '../../core/module';
import { llm } from '../../core/llm';

const suggestionCounter = metrics.getMeter('lanyard').createCounter(METRICS.matchesSuggested);
const SUGGESTION_LIMIT = 8;
const REASON_TIMEOUT_MS = 1_200;
const isProfileNotFound = (error: unknown): boolean =>
  error instanceof HttpError && error.status === 404;

function profileId(eventId: string, anonId: string): string {
  return `${eventId}:${anonId}`;
}

async function readProfile(eventId: string, anonId: string) {
  try {
    const response = await es(ES_INDICES.people, 'get', (client, opts) =>
      client.get<NetworkingProfile>({ index: ES_INDICES.people, id: profileId(eventId, anonId) }, opts),
    );
    return NetworkingProfile.parse(response._source);
  } catch (error) {
    if (isProfileNotFound(error)) return undefined;
    throw error;
  }
}

function fallbackReason(): string {
  return 'Your goals and interests look aligned.';
}

async function matchReason(me: NetworkingProfile, other: NetworkingProfile): Promise<string> {
  const input = [me.needs, me.offers, me.interests, other.needs, other.offers, other.interests];
  const cacheKey = createHash('sha256').update(JSON.stringify(input)).digest('hex');
  try {
    const reason = cached(
      `networking-reason:${cacheKey}`,
      () =>
        llm({
          purpose: 'networking_match_reason',
          model: 'fast',
          timeoutMs: REASON_TIMEOUT_MS,
          maxTokens: 70,
          temperature: 0.2,
          json: true,
          messages: [
            {
              role: 'system',
              content:
                'Write one friendly, factual sentence explaining why two conference attendees may want to meet. Use only the supplied needs, offers, and interests. Return JSON with a reason string, at most 18 words.',
            },
            {
              role: 'user',
              content: JSON.stringify({
                attendee: { needs: me.needs, offers: me.offers, interests: me.interests },
                suggestion: { needs: other.needs, offers: other.offers, interests: other.interests },
              }),
            },
          ],
        }),
      10 * 60_000,
    );
    const result = await Promise.race([
      reason,
      new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), 250)),
    ]);
    if (!result) return fallbackReason();
    const { text } = result;
    const value = JSON.parse(text) as { reason?: unknown };
    if (typeof value.reason === 'string' && value.reason.trim())
      return value.reason.trim().replace(/\s+/g, ' ').slice(0, 240);
  } catch {
    // Suggestions remain useful when the optional reason service is slow or unavailable.
  }
  return fallbackReason();
}

function suggestionsRequest(eventId: string, me: NetworkingProfile): estypes.SearchRequest {
  const queryText = `Needs: ${me.needs}. Offers: ${me.offers}. Interests: ${me.interests}.`;
  const filter: estypes.QueryDslQueryContainer[] = [
    { term: { eventId } },
    { term: { consented: true } },
  ];
  const mustNot: estypes.QueryDslQueryContainer[] = [{ term: { anonId: me.anonId } }];
  return {
    index: ES_INDICES.people,
    size: SUGGESTION_LIMIT,
    _source: { excludes: ['semantic'] },
    retriever: {
      rrf: {
        rank_window_size: 40,
        rank_constant: 60,
        retrievers: [
          {
            standard: {
              query: {
                bool: {
                  filter,
                  must_not: mustNot,
                  must: {
                    multi_match: {
                      query: queryText,
                      fields: ['needs^2', 'offers^2', 'interests'],
                    },
                  },
                },
              },
            },
          },
          {
            standard: {
              query: {
                bool: {
                  filter,
                  must_not: mustNot,
                  must: { semantic: { field: 'semantic', query: queryText } },
                },
              },
            },
          },
        ],
      },
    },
  };
}

export default defineModule({
  name: 'people',
  register(app) {
    app.get('/me/networking', { preHandler: requireRole('attendee') }, async (req) => {
      const claims = authOf(req);
      if (claims.role !== 'attendee') throw new HttpError(403, 'forbidden', 'Attendee role required');
      const profile = await readProfile(claims.eventId, claims.sub);
      if (!profile) return MyNetworkingResponse.parse({ optedIn: false });
      return MyNetworkingResponse.parse({
        optedIn: true,
        profile: {
          linkedinUrl: profile.linkedinUrl,
          needs: profile.needs,
          offers: profile.offers,
          interests: profile.interests,
        },
      });
    });

    app.put('/me/networking', { preHandler: requireRole('attendee') }, async (req) => {
      const claims = authOf(req);
      if (claims.role !== 'attendee') throw new HttpError(403, 'forbidden', 'Attendee role required');
      const input = parse(NetworkingProfileRequest, req.body);
      const profile = NetworkingProfile.parse({
        ...input,
        anonId: claims.sub,
        eventId: claims.eventId,
        handle: claims.handle ?? 'Attendee',
        consented: true,
      });
      await es(ES_INDICES.people, 'index', (client, opts) =>
        client.index(
          {
            index: ES_INDICES.people,
            id: profileId(claims.eventId, claims.sub),
            document: profile,
          },
          opts,
        ),
      );
      return { saved: true };
    });

    app.delete('/me/networking', { preHandler: requireRole('attendee') }, async (req) => {
      const claims = authOf(req);
      if (claims.role !== 'attendee') throw new HttpError(403, 'forbidden', 'Attendee role required');
      try {
        await es(ES_INDICES.people, 'delete', (client, opts) =>
          client.delete(
            { index: ES_INDICES.people, id: profileId(claims.eventId, claims.sub) },
            opts,
          ),
        );
      } catch (error) {
        if (!isProfileNotFound(error)) throw error;
      }
      return { removed: true };
    });

    app.get<{ Params: { eventId: string } }>(
      '/events/:eventId/networking/suggestions',
      { preHandler: requireRole('attendee') },
      async (req) => {
        const claims = authOf(req);
        if (claims.role !== 'attendee') throw new HttpError(403, 'forbidden', 'Attendee role required');
        const eventId = parse(Id, req.params.eventId);
        if (claims.eventId !== eventId)
          throw new HttpError(403, 'forbidden', 'Token is for another event');
        const me = await readProfile(claims.eventId, claims.sub);
        if (!me) return { matches: [] };

        const result = await es(ES_INDICES.people, 'search', (client, opts) =>
          client.search<NetworkingProfile>(suggestionsRequest(eventId, me), opts),
        );
        const candidates = result.hits.hits.flatMap((hit) => {
          const parsed = NetworkingProfile.safeParse(hit._source);
          return parsed.success && parsed.data.consented && parsed.data.anonId !== claims.sub
            ? [parsed.data]
            : [];
        });
        const matches = await Promise.all(
          candidates.map(async (other) => ({
            handle: other.handle,
            linkedinUrl: other.linkedinUrl,
            reason: await matchReason(me, other),
          })),
        );
        suggestionCounter.add(matches.length, { event: claims.eventId });
        return NetworkingSuggestionsResponse.parse({ matches });
      },
    );
  },
});
