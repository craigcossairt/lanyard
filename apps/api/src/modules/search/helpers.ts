import { ES_INDICES, Id, TranscriptChunk } from '@lanyard/contracts';
import { HttpError } from '../../core/errors';
import { es } from '../../core/es';

// Conservative provisional Jina cosine-based score; calibrated pairs follow next slice.
export const QUESTION_CLUSTER_THRESHOLD = 0.85;

export async function findQuestionCluster(input: {
  eventId: string;
  sessionId: string;
  questionId: string;
  text: string;
}): Promise<{ clusterId: string | null; score: number }> {
  const { eventId, sessionId, questionId, text } = input;
  if (
    !Id.safeParse(eventId).success ||
    !Id.safeParse(sessionId).success ||
    !Id.safeParse(questionId).success ||
    !text.trim() ||
    text.length > 500
  ) {
    throw new HttpError(400, 'invalid_question', 'Invalid duplicate-question input');
  }
  const result = await es(ES_INDICES.questions, 'search', (client, opts) =>
    client.search<{ clusterId: string }>(
      {
        index: ES_INDICES.questions,
        size: 1,
        _source: ['clusterId'],
        query: {
          bool: {
            filter: [{ term: { eventId } }, { term: { sessionId } }],
            must_not: [{ ids: { values: [questionId] } }, { term: { status: 'hidden' } }],
            must: { semantic: { field: 'semantic', query: text } },
          },
        },
      },
      opts,
    ),
  );
  if (result.timed_out || (result._shards?.failed ?? 0) > 0)
    throw new HttpError(503, 'search_incomplete', 'Duplicate search incomplete');
  const hit = result.hits.hits[0];
  const score = hit?._score ?? 0;
  const cluster = Id.safeParse(hit?._source?.clusterId);
  return {
    clusterId: score >= QUESTION_CLUSTER_THRESHOLD && cluster.success ? cluster.data : null,
    score,
  };
}

/** Latest bounded window, returned in ascending seq order for summaries. */
export async function lastTranscriptChunks(
  sessionId: string,
  minutes: number,
): Promise<TranscriptChunk[]> {
  if (
    !Id.safeParse(sessionId).success ||
    !Number.isFinite(minutes) ||
    minutes < 1 ||
    minutes > 30
  ) {
    throw new HttpError(400, 'invalid_window', 'Transcript window must be 1–30 minutes');
  }
  const now = Date.now();
  const result = await es(ES_INDICES.transcripts, 'search', (client, opts) =>
    client.search<TranscriptChunk>(
      {
        index: ES_INDICES.transcripts,
        size: 200,
        _source: { excludes: ['semantic'] },
        query: {
          bool: {
            filter: [
              { term: { sessionId } },
              {
                range: {
                  endedAt: {
                    gte: new Date(now - minutes * 60_000).toISOString(),
                    lte: new Date(now).toISOString(),
                  },
                },
              },
            ],
          },
        },
        sort: [{ seq: 'desc' }],
      },
      opts,
    ),
  );
  if (result.timed_out || (result._shards?.failed ?? 0) > 0)
    throw new HttpError(503, 'search_incomplete', 'Transcript search incomplete');
  return result.hits.hits
    .flatMap((hit) => {
      const chunk = TranscriptChunk.safeParse({ ...hit._source, id: hit._id });
      return chunk.success ? [chunk.data] : [];
    })
    .sort((a, b) => a.seq - b.seq);
}
