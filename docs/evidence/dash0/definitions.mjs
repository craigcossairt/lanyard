// Dash0 assets for Lanyard as code: the "Conference Ops" dashboard (Perses
// format) and two SLOs (OpenSLO v1, Dash0 subset). Applied by apply.mjs.
//
// Query conventions (verified against Dash0 PromQL on 2026-11-09):
// - select OTel metrics by {otel_metric_name="conf.x"}; attribute keys use
//   underscores (event, room, session, type, channel_kind, merged).
// - conf.room.* and conf.session.attendees are emitted by one elected leader
//   per event; a leader change changes the resource identity, so replicated
//   gauge series are combined with max, never sum (WS4).
// - histograms are native (exponential): histogram_quantile / histogram_fraction.

const m = (name, extra = '') => `{otel_metric_name="${name}"${extra}}`;
const APP = ', service_name=~"lanyard-(app|worker)"';

const occ = `max by (event, room) (${m('conf.room.occupancy')})`;
const cap = `max by (event, room) (${m('conf.room.capacity')})`;

// Panel helpers --------------------------------------------------------------
const q = (query) => ({
  kind: 'TimeSeriesQuery',
  spec: { plugin: { kind: 'PrometheusTimeSeriesQuery', spec: { query } } },
});
const ts = (name, description, ...queries) => ({
  kind: 'Panel',
  spec: {
    display: { name, description },
    plugin: { kind: 'TimeSeriesChart', spec: {} },
    queries: queries.map(q),
  },
});
const stat = (name, description, query) => ({
  kind: 'Panel',
  spec: {
    display: { name, description },
    plugin: { kind: 'StatChart', spec: { calculation: 'last-number' } },
    queries: [q(query)],
  },
});

const panels = {
  rooms_over_slo: stat(
    'Rooms at or over 90% capacity',
    'Rooms whose occupancy / capacity >= 0.9 right now (SLO threshold).',
    `count((${occ} / ${cap}) >= 0.9) or vector(0)`,
  ),
  sse_clients: stat(
    'Live SSE clients',
    'Open realtime connections across all app replicas (per-replica gauge, so summed).',
    `sum(${m('conf.sse.clients')})`,
  ),
  fanout_p95_now: stat(
    'Question fanout p95 (ms)',
    'Session channel (what the speaker console reads). SLO: p95 < 1000 ms.',
    `histogram_quantile(0.95, sum(rate(${m('conf.realtime.fanout_ms', ', channel_kind="session"')}[5m])))`,
  ),
  llm_cost_1h: stat(
    'LLM cost, last hour (USD)',
    'From OpenLIT GenAI spans (Dash0 gen_ai metrics).',
    `sum(increase(${m('dash0.gen_ai.usage.cost', APP)}[1h]))`,
  ),
  occupancy: ts(
    'Room occupancy (% of capacity)',
    'Leader-emitted gauges, max-aggregated. Red line in the SLO: 0.9.',
    `${occ} / ${cap}`,
  ),
  attendees: ts(
    'Session attendees',
    'Per session, max-aggregated across leader identities.',
    `max by (event, session) (${m('conf.session.attendees')})`,
  ),
  signals: ts(
    'Audience signals per minute',
    'slower / louder / cant_see / lost / thumbs_up / too_cold / too_hot.',
    `sum by (type) (rate(${m('conf.signals')}[2m])) * 60`,
  ),
  questions: ts(
    'Questions per minute, and dedup merges',
    'Questions asked per session; merged=true means Elasticsearch joined it to an existing cluster.',
    `sum by (session) (rate(${m('conf.questions')}[2m])) * 60`,
    `sum by (merged) (rate(${m('conf.question.dedup')}[2m])) * 60`,
  ),
  fanout: ts(
    'Realtime fanout latency (ms)',
    'p50 / p95 by channel kind. SLO: question fanout p95 < 1000 ms.',
    `histogram_quantile(0.95, sum by (channel_kind) (rate(${m('conf.realtime.fanout_ms')}[5m])))`,
    `histogram_quantile(0.5, sum by (channel_kind) (rate(${m('conf.realtime.fanout_ms')}[5m])))`,
  ),
  caption_lag: ts(
    'Caption lag p95 (ms)',
    'Accessibility target: p95 < 1500 ms.',
    `histogram_quantile(0.95, sum by (session) (rate(${m('conf.caption.lag_ms')}[5m])))`,
  ),
  sse_by_kind: ts(
    'SSE clients by channel kind',
    'Load evidence during the demo.',
    `sum by (channel_kind) (${m('conf.sse.clients')})`,
  ),
  reroute: ts(
    'Reroutes suggested vs accepted (per min)',
    'Outcome of the organizer reroute action.',
    `sum by (room) (rate(${m('conf.reroute.suggested')}[5m])) * 60`,
    `sum by (room) (rate(${m('conf.reroute.accepted')}[5m])) * 60`,
  ),
  llm_tokens: ts(
    'LLM tokens per minute',
    'Input and output tokens from GenAI spans.',
    `sum(rate(${m('dash0.gen_ai.tokens.input', APP)}[5m])) * 60`,
    `sum(rate(${m('dash0.gen_ai.tokens.output', APP)}[5m])) * 60`,
  ),
  http_p95: ts(
    'API latency p95 (s)',
    'http.server.request.duration for lanyard-app.',
    `histogram_quantile(0.95, sum(rate(${m('http.server.request.duration', ', service_name="lanyard-app"')}[5m])))`,
  ),
};

// 24-column grid, rows of stats then charts.
const layout = [
  ['rooms_over_slo', 0, 0, 6, 4], ['sse_clients', 6, 0, 6, 4], ['fanout_p95_now', 12, 0, 6, 4], ['llm_cost_1h', 18, 0, 6, 4],
  ['occupancy', 0, 4, 12, 8], ['attendees', 12, 4, 12, 8],
  ['signals', 0, 12, 12, 8], ['questions', 12, 12, 12, 8],
  ['fanout', 0, 20, 12, 8], ['caption_lag', 12, 20, 12, 8],
  ['sse_by_kind', 0, 28, 8, 8], ['reroute', 8, 28, 8, 8], ['llm_tokens', 16, 28, 8, 8],
  ['http_p95', 0, 36, 24, 7],
];

export const dashboard = {
  kind: 'PersesDashboard',
  apiVersion: 'perses.dev/v1alpha1',
  metadata: { name: 'lanyard-conference-ops' },
  spec: {
    display: {
      name: 'Conference Ops',
      description: 'Lanyard: the conference as a distributed system. Rooms are services, attendees are traffic.',
    },
    duration: '1h',
    refreshInterval: '30s',
    datasources: { default: { name: 'default', plugin: { kind: 'PrometheusDataSource' } } },
    panels,
    layouts: [{
      kind: 'Grid',
      spec: {
        items: layout.map(([ref, x, y, width, height]) => ({ x, y, width, height, content: { $ref: `#/spec/panels/${ref}` } })),
      },
    }],
  },
};

// SLOs -----------------------------------------------------------------------
// Session channel only: the speaker console reads it, so this is "question visible
// to the speaker" (the bus tags fanout by channel kind; session also carries
// captions and attendance, so this is a slight superset of question fanout).
const fanout = m('conf.realtime.fanout_ms', ', channel_kind="session"');
export const slos = {
  'lanyard-question-fanout-p95': {
    apiVersion: 'openslo/v1',
    kind: 'SLO',
    metadata: {
      name: 'lanyard-question-fanout-p95',
      labels: { team: 'lanyard', slo: 'question-fanout' },
      annotations: { 'dash0.com/display-name': 'Lanyard: question fanout under 1 s' },
    },
    spec: {
      description: '95% of session-channel fanouts (questions, plus captions and attendance on the same channel) reach subscribers such as the speaker console within 1000 ms (conf.realtime.fanout_ms, channel_kind=session, native histogram), i.e. p95 < 1 s.',
      service: 'lanyard-app',
      budgetingMethod: 'Occurrences',
      timeWindow: [{ duration: '28d', isRolling: true }],
      indicator: {
        metadata: { name: 'question-fanout-under-1s' },
        spec: {
          ratioMetric: {
            counter: false,
            good: { metricSource: { type: 'Prometheus', spec: { query: `histogram_fraction(0, 1000, increase(${fanout}[5m])) * histogram_count(increase(${fanout}[5m]))` } } },
            total: { metricSource: { type: 'Prometheus', spec: { query: `histogram_count(increase(${fanout}[5m]))` } } },
          },
        },
      },
      objectives: [{ displayName: 'p95 fanout < 1 s', target: 0.95 }],
    },
  },
  'lanyard-room-occupancy': {
    apiVersion: 'openslo/v1',
    kind: 'SLO',
    metadata: {
      name: 'lanyard-room-occupancy',
      labels: { team: 'lanyard', slo: 'room-occupancy' },
      annotations: { 'dash0.com/display-name': 'Lanyard: rooms under 90% capacity' },
    },
    spec: {
      description: 'Room-minutes below 90% of capacity (conf.room.occupancy / conf.room.capacity, leader gauges aggregated with max). Each evaluation counts every room once.',
      service: 'lanyard-app',
      budgetingMethod: 'Occurrences',
      timeWindow: [{ duration: '28d', isRolling: true }],
      indicator: {
        metadata: { name: 'rooms-under-90pct' },
        spec: {
          ratioMetric: {
            counter: false,
            good: { metricSource: { type: 'Prometheus', spec: { query: `count((${occ} / ${cap}) < 0.9) or vector(0)` } } },
            total: { metricSource: { type: 'Prometheus', spec: { query: `count(${cap} > 0)` } } },
          },
        },
      },
      objectives: [{ displayName: '95% of room-time under 90% capacity', target: 0.95 }],
    },
  },
};
