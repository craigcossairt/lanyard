// Dash0 RUM, initialised from runtime config served by the API (/api/config), so no
// token is baked into the bundle. Same-origin /api calls get W3C trace headers, linking
// browser spans to lanyard-app traces. Token-like URL parts are scrubbed as a backstop.
import { init, type UrlAttributeRecord } from '@dash0/sdk-web';
import type { RuntimeConfig } from '@lanyard/contracts';

const SENSITIVE = /(^|[?&#])(t|token|access_token|key)=[^&#]*/gi;
const scrub = (v: string | undefined) => v?.replace(SENSITIVE, '$1$2=REDACTED');

export function startRum(config: RuntimeConfig): void {
  if (!config.rum) return;
  try {
    init({
      serviceName: config.rum.serviceName,
      serviceVersion: config.version,
      environment: 'hackathon',
      endpoint: { url: config.rum.endpoint, authToken: config.rum.authToken },
      urlAttributeScrubber: (attr: UrlAttributeRecord) => {
        const out: Record<string, string | undefined> = { ...attr };
        for (const k of Object.keys(out)) out[k] = scrub(out[k]);
        return out as UrlAttributeRecord;
      },
    });
  } catch (err) {
    console.warn('RUM init failed', err);
  }
}
