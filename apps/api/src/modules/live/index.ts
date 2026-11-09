// WS2 live module: session stream (SSE), captions, presence, questions, signals, catch-up.
// Valkey key schema: see store.ts `keys`.
import { defineModule } from '../../core/module';
import { registerPresence } from './presence';
import { registerStream } from './stream';
import { registerTranscript } from './transcript';

export default defineModule({
  name: 'live',
  register(app) {
    registerStream(app);
    registerTranscript(app);
    registerPresence(app);
  },
});
