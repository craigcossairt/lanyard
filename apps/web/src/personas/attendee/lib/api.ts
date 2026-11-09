// The shell's typed API client (apps/web/src/app/api.ts): Bearer token from storage,
// never in a URL, 10 s timeout, JSON errors as ApiError. Re-exported so persona code has
// one import path.
export { api, ApiError, authHeaders } from '../../../app/api';
