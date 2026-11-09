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
  esUrl: string | undefined;
  esApiKey: string | undefined;
  valkeyUrl: string | undefined;
  openaiApiKey: string | undefined;
  typesafeApiKey: string | undefined;
  llmModelChat: string;
  llmModelFast: string;
  tokenSigningKey: string | undefined;
  workerUrl: string | undefined;
  rum: { endpoint: string; authToken: string; serviceName: string } | undefined;
}

export function loadConfig(): Config {
  const rumToken = str('DASH0_RUM_AUTH_TOKEN');
  return {
    port: Number(str('PORT') ?? 8080),
    host: str('HOST') ?? '0.0.0.0',
    role: str('ROLE') === 'worker' ? 'worker' : 'app',
    version: str('APP_VERSION') ?? 'dev',
    publicBaseUrl: str('PUBLIC_BASE_URL') ?? 'http://localhost:5173',
    eventTz: str('EVENT_TZ') ?? 'America/Denver',
    webDistDir: str('WEB_DIST_DIR'),
    esUrl: str('ES_URL'),
    esApiKey: str('ES_API_KEY'),
    valkeyUrl: str('VALKEY_URL'),
    openaiApiKey: str('OPENAI_API_KEY'),
    typesafeApiKey: str('TYPESAFE_API_KEY'),
    llmModelChat: str('LLM_MODEL_CHAT') ?? 'gpt-6.1-sol',
    llmModelFast: str('LLM_MODEL_FAST') ?? 'gpt-5.4-mini',
    tokenSigningKey: str('TOKEN_SIGNING_KEY'),
    workerUrl: str('WORKER_URL'),
    // The RUM token is a public, browser-side ingest token by design; it's served to the SPA.
    rum: rumToken
      ? {
          endpoint: str('DASH0_RUM_ENDPOINT') ?? 'https://ingress.us-west-2.aws.dash0.com',
          authToken: rumToken,
          serviceName: 'lanyard-web',
        }
      : undefined,
  };
}
