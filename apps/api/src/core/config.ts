// Config loader: every setting comes from env (02-contracts section 7).
// Optional integrations (ES, Valkey, OTel, LLMs) are undefined when unset, and the
// app must keep serving /healthz and /readyz without them.

function str(name: string): string | undefined {
  const v = process.env[name];
  return v === undefined || v.trim() === '' ? undefined : v.trim();
}

export interface Config {
  port: number;
  host: string;
  role: 'app' | 'worker';
  version: string;
  publicBaseUrl: string;
  eventTz: string;
  webDistDir: string | undefined;
}

export function loadConfig(): Config {
  return {
    port: Number(str('PORT') ?? 8080),
    host: str('HOST') ?? '0.0.0.0',
    role: str('ROLE') === 'worker' ? 'worker' : 'app',
    version: str('APP_VERSION') ?? 'dev',
    publicBaseUrl: str('PUBLIC_BASE_URL') ?? 'http://localhost:5173',
    eventTz: str('EVENT_TZ') ?? 'America/Denver',
    webDistDir: str('WEB_DIST_DIR'),
  };
}
