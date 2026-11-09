# Security evidence

## Dependabot alerts on `main` (listed 2026-11-09T19:44Z, not fixed yet; G4 security pass)

11 open: 2 high, 8 medium, 1 low. Ten of the eleven come from two runtime dependencies of `apps/api`; the API serves the SPA with `@fastify/static`.

| # | Severity | Package | Where | Advisory | Fixed in | Summary |
|---|---|---|---|---|---|---|
| 3, 8 | **high** | `@fastify/static` | `apps/api/package.json`, `package-lock.json` (runtime) | GHSA-83w8-p2f5-377r | 10.1.1 | Route guard bypass via path traversal |
| 4, 9 | medium | `@fastify/static` | same | GHSA-8pvw-jcv7-9cmj | 10.1.2 | Authorization bypass via non-canonical URL paths |
| 1, 5 | medium | `@fastify/static` | same | GHSA-x428-ghpx-8j92 | 9.1.1 | Route guard bypass via encoded path separators |
| 2, 6 | medium | `@fastify/static` | same | GHSA-pr96-94w5-mx2h | 9.1.1 | Path traversal in directory listing |
| 10 | medium | `glob` | `package-lock.json` (runtime) | GHSA-3g3m-2fjr-6pw4 | 14.0.2 | AbortSignal cancellation bypass allows post-timeout traversal |
| 11 | medium | `minimatch` | `package-lock.json` (runtime) | GHSA-g3hv-75wg-m249 | 11.0.1 | DoS via globparts amplification |
| 7 | low | `esbuild` | `package-lock.json` (development) | GHSA-g7r4-m6w7-qqqr | 0.28.1 | Arbitrary file read from the dev server on Windows (dev only; not in the image) |

**Suggested fix (for WS0, which owns `apps/api`):** bump `@fastify/static` to ≥ 10.1.2 (clears 8 alerts, including both highs), then `npm update glob minimatch` within their ranges and re-check. `esbuild` is dev-only. These are listed only; not fixed in this PR.
