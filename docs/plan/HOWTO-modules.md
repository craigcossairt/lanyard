# How to add a module, a worker job or a persona

The short version for WS1 to WS8. The types come from `@lanyard/contracts` (`packages/contracts/src`). Change a contract only together with `02-contracts.md`.

## Run it

```sh
npm install
ENV_FILE=/Users/craigcossairt/cnh-2026/lanyard/.env npm run dev   # api :8080, worker :8081, web :5173 (proxies /api)
npm run typecheck && npm run lint && npm test
TOKEN_SIGNING_KEY=… npm run mint-link -- --role organizer --event cnh-demos   # prints /join#t=… link
```

Without `VALKEY_URL` the bus is in-process. Without `ES_URL` the ES routes return 503. `/readyz` stays green either way.

## API module (`apps/api/src/modules/<name>/`)

1. Create `apps/api/src/modules/<name>/index.ts`:

```ts
import { channels, realtime, SignalRequest } from '@lanyard/contracts';
import { authOf, requireRole } from '../../core/auth';
import { parse } from '../../core/errors';
import { defineModule } from '../../core/module';
import { openSse } from '../../core/sse';

export default defineModule({
  name: 'live',
  register(app, ctx) {
    // Mounted under /api. Validate every input with a contracts schema.
    app.post<{ Params: { id: string } }>('/sessions/:id/signals',
      { preHandler: requireRole('attendee') },
      async (req) => {
        const body = parse(SignalRequest, req.body);
        const me = authOf(req); // { sub: anonId, role, eventId, handle }
        await ctx.bus.publish(channels.session(req.params.id), realtime('signals.window', { … }));
        return { accepted: true };
      });
    // SSE: the caller's user:<anonId> channel is multiplexed in automatically.
    app.get<{ Params: { id: string } }>('/sessions/:id/stream', { preHandler: requireRole() },
      (req, reply) => { openSse(req, reply, { channels: [channels.session(req.params.id)] }); });
  },
});
```

2. Add **one line** to `apps/api/src/modules/index.ts` (keep the list sorted): `import live from './live';` and add `live` to the array.

What core gives you (`apps/api/src/core/`):

| Need | Use |
|---|---|
| Auth | `requireRole('speaker')`, `requireRole()` (any token), `authOf(req)`. Organizer passes every role check. Bearer header only |
| Errors | `throw new HttpError(404, 'not_found', '…')`, `parse(schema, input)` gives a 400 |
| Elasticsearch | `es(ES_INDICES.sessions, 'search', (c, o) => c.search({...}, o))` adds a span `es.<index>.<op>` and a hard 2 s cap. `cached(key, fn)` caches for 30 s |
| Events, rooms, now/next | `getEvent(id)`, `getRooms(eventId)`, `getNowNext(eventId)` from `core/events` |
| Realtime | `ctx.bus.publish(channel, realtime(type, payload))`, `ctx.bus.subscribe(channel, fn)` |
| Counters | `ctx.kv` (ioredis, 500 ms timeout). It's `undefined` without Valkey, so keep an in-memory fallback |
| Fast decisions | `moderate(text)` returns allow, hide or review. `decide('intent', { state, question, labels, defaultLabel })` uses Jev (1 s, span `jev.<name>`) |
| Time | `core/time`: store and send UTC ISO (`nowIso()`). Render only through `formatTime` and `formatRange` (event timezone) |
| Metrics | `metrics.getMeter('lanyard')` with names from `METRICS`. Attributes may be event, room, session, type or channel_kind only |
| Logs | `ctx.logger` / `req.log` (pino, trace ids added automatically) |

Rules: never put question text, caption text, prefs or anonIds in logs, spans or metric labels. Every outbound call goes through a core wrapper. LLM calls (20 s, catch-up 8 s) run in the worker or behind a cache.

## Worker job (`apps/worker/src/jobs/<name>/`)

Same owner as the related module. A job is a function registered with the worker runner. It can be triggered over HTTP from the API (`POST $WORKER_URL/jobs/<name>`, trace context propagates) and/or scheduled every N seconds. The full pattern lands with the WS0 worker-core PR. Until then, import API core helpers from the worker by relative path (`../../../api/src/core/es`); tsup bundles them.

## Persona folder (`apps/web/src/personas/<persona>/`)

`attendee` → `/a`, `speaker` → `/s`, `organizer` → `/o`, `vendor` → `/v`, `venue` → `/venue`.

1. Create `apps/web/src/personas/<persona>/index.tsx` with a **default export** of a component that renders that persona's routes (React Router 7, relative paths):

```tsx
import { Route, Routes } from 'react-router';
export default function AttendeeRoutes() {
  return (<Routes><Route index element={<Home />} /><Route path="s/:id" element={<SessionPage />} /></Routes>);
}
```

2. That's it: the shell discovers it (`import.meta.glob`) and lazy-loads it under the persona prefix. No shell edits needed.

The shell (`apps/web/src/app/`) provides:

- `api.get/post/put/patch` with the Bearer token (`api.event(id)`, `api.join(id)`, `ApiError`).
- `useSse(path, onMessage, { onReconnect })`: it streams with fetch plus the Authorization header, uses exponential backoff, and calls `onReconnect` so you can refetch the snapshot. **Never use EventSource or put a token in a URL.**
- `useSession()`: the active claims (role, eventId, handle).
- The `/join` page (join code, or a `#t=` role link) and the dev role switcher.
- Theme variables and root attributes (`data-theme`, `data-caption-size`, `data-readable`, `data-motion`). Use only the CSS variables from the design system (`apps/web/src/ui/`, owned by the design thread).
