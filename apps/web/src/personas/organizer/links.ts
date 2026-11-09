export const LINK_LABELS = {
  dashboard: 'Conference Ops dashboard',
  slo: 'Occupancy SLO',
  agent0: 'Investigate with Agent0',
};
export type OpsLinks = Record<keyof typeof LINK_LABELS, string>;
export const DEFAULT_LINKS: OpsLinks = { dashboard: '', slo: '', agent0: '' };
export const LINKS_STORAGE_KEY = 'lanyard.ops.links';

/** Only public HTTPS destinations; reject executable URLs and embedded credentials. */
export function safeOpsLink(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return '';
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : '';
  } catch {
    return '';
  }
}

export function readOpsLinks(): OpsLinks {
  try {
    const saved = JSON.parse(localStorage.getItem(LINKS_STORAGE_KEY) ?? '{}');
    return Object.fromEntries(
      Object.keys(DEFAULT_LINKS).map((key) => [
        key,
        safeOpsLink(saved[key] ?? DEFAULT_LINKS[key as keyof OpsLinks]),
      ]),
    ) as OpsLinks;
  } catch {
    return { ...DEFAULT_LINKS };
  }
}
