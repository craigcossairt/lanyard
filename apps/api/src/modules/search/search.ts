import type { estypes } from '@elastic/elasticsearch';
import { ES_INDICES, Session, type SearchQuery, type SearchResponse } from '@lanyard/contracts';
import type { z } from 'zod';
import { es } from '../../core/es';
import { completeSearch } from './response';

export type SearchInput = z.infer<typeof SearchQuery>;

export function searchRequest(eventId: string, input: SearchInput): estypes.SearchRequest {
  const filter: estypes.QueryDslQueryContainer[] = [{ term: { eventId } }];
  if (input.track) filter.push({ term: { track: input.track } });
  if (input.level) filter.push({ term: { level: input.level } });
  if (input.from) filter.push({ range: { endsAt: { gt: input.from } } });
  if (input.to) filter.push({ range: { startsAt: { lt: input.to } } });
  const lexical = {
    multi_match: { query: input.q, fields: ['title^3', 'abstract', 'speakerNames'] },
  };
  return {
    index: ES_INDICES.sessions,
    size: input.limit ?? 20,
    _source: { excludes: ['semantic'] },
    retriever: {
      rrf: {
        rank_window_size: 50,
        rank_constant: 60,
        retrievers: [
          { standard: { query: { bool: { filter, must: lexical } } } },
          {
            standard: {
              query: {
                bool: { filter, must: { semantic: { field: 'semantic', query: input.q } } },
              },
            },
          },
        ],
      },
    },
    highlight: {
      pre_tags: [''],
      post_tags: [''],
      fields: { title: {}, abstract: { fragment_size: 180, number_of_fragments: 1 } },
      highlight_query: lexical,
    },
  };
}

export async function searchSessions(eventId: string, input: SearchInput): Promise<SearchResponse> {
  const result = await es(ES_INDICES.sessions, 'search', (client, opts) =>
    client.search<Session>(searchRequest(eventId, input), opts).then(completeSearch),
  );
  return {
    hits: result.hits.hits.flatMap((hit) => {
      const parsed = Session.safeParse({ ...hit._source, id: hit._id });
      if (!parsed.success) return [];
      const fragments = Object.values(hit.highlight ?? {}).flat();
      return [
        {
          session: parsed.data,
          score: hit._score ?? 0,
          // Plain text only: callers render these with their normal text component.
          highlights: fragments.length ? fragments : [parsed.data.abstract.slice(0, 180)],
        },
      ];
    }),
  };
}
