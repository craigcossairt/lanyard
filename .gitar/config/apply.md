Auto-apply fixes for:
- CI failures in typecheck, lint, formatting, or build caused by the pull request's own changes
- missing imports, type mismatches against `packages/contracts`, and unused variables

Do not auto-apply changes to:
- `deploy/`, `argocd/`, `.github/workflows/`, `.gitar/`, `docs/plan/`
- anything involving secrets or environment configuration

Prefer the smallest fix that makes CI green, and explain the root cause in the commit message.
