export const LINK_LABELS = {
  dashboard: 'Conference Ops dashboard',
  slo: 'Rooms below 90% SLO',
  questionFanout: 'Question fanout under 1 s SLO',
  agent0: 'Investigate with Agent0',
};
export type OpsLinks = Record<keyof typeof LINK_LABELS, string>;
export const DEFAULT_LINKS: OpsLinks = {
  dashboard: 'https://app.dash0.com/goto/dashboards?dashboard_id=ddc340ad-572f-488f-ab26-0904862c8d32&dataset=default&org=a9f9b2dc-887f-4d05-afc5-e89af87f1f9f',
  slo: 'https://app.dash0.com/goto/alerting/slos/details?slo_id=slo_01m70z1vepf5zr31vkzkjahe2k&dataset=default&org=a9f9b2dc-887f-4d05-afc5-e89af87f1f9f',
  questionFanout: 'https://app.dash0.com/goto/alerting/slos/details?slo_id=slo_01m70z1v61e1tvvedxyjh3jppm&dataset=default&org=a9f9b2dc-887f-4d05-afc5-e89af87f1f9f',
  agent0: 'https://app.dash0.com/goto/agent0?initial_prompt=Lanyard+Conference+Ops%3A+which+rooms+are+at+or+above+90%25+capacity+right+now%2C+is+question+fanout+p95+under+1+s%2C+and+what+is+driving+any+SLO+burn%3F+Services+lanyard-app+and+lanyard-worker.&org=a9f9b2dc-887f-4d05-afc5-e89af87f1f9f',
};
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
