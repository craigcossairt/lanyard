// Example job and smoke check: `runJob('ping', { echo: 'x' })` from the API returns the echo.
import { defineJob } from '../../../../api/src/core/jobs';

export default defineJob<{ echo?: string }, { pong: true; echo?: string; at: string }>({
  name: 'ping',
  async run(payload) {
    return { pong: true, echo: payload.echo, at: new Date().toISOString() };
  },
});
