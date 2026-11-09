import { useState, type FormEvent } from 'react';
import { Button, Card, TextInput } from '../../ui';
import { DEFAULT_LINKS, LINK_LABELS, LINKS_STORAGE_KEY, readOpsLinks, safeOpsLink, type OpsLinks } from './links';

export function ObservabilityLinks() {
  const [links, setLinks] = useState(readOpsLinks);
  const [draft, setDraft] = useState(links);
  const [notice, setNotice] = useState('');
  const keys = Object.keys(LINK_LABELS) as (keyof OpsLinks)[];
  const save = (event: FormEvent) => {
    event.preventDefault();
    const cleaned = { ...draft };
    for (const key of keys) {
      cleaned[key] = safeOpsLink(draft[key]);
      if (draft[key].trim() && !cleaned[key]) {
        setNotice('Use a valid HTTPS link without embedded credentials.');
        return;
      }
      cleaned[key] ||= DEFAULT_LINKS[key];
    }
    setLinks(cleaned);
    setDraft(cleaned);
    try {
      localStorage.setItem(LINKS_STORAGE_KEY, JSON.stringify(cleaned));
      setNotice('Observability links saved on this device.');
    } catch {
      setNotice('Links updated for this visit. Browser storage is unavailable.');
    }
  };
  return (
    <Card as="section" className="ops-observability" aria-labelledby="ops-observability-title">
      <div>
        <span className="ops-eyebrow">The same room, through OpenTelemetry</span>
        <h2 id="ops-observability-title">From conference to infrastructure</h2>
        <p>Follow room saturation into the dashboard, check the SLO, or investigate with Agent0.</p>
      </div>
      <nav aria-label="Observability tools">
        {keys.map((key) =>
          links[key] ? (
            <a key={key} href={links[key]} target="_blank" rel="noopener noreferrer">
              {LINK_LABELS[key]} ↗<span className="ops-link-hint">Opens in a new tab</span>
            </a>
          ) : (
            <span key={key} className="ops-link-unset">
              {LINK_LABELS[key]}
              <small>Link not configured</small>
            </span>
          ),
        )}
      </nav>
      <details>
        <summary>Configure observability links</summary>
        <form onSubmit={save}>
          <p>Leave a link blank to use the conference default.</p>
          {keys.map((key) => (
              <TextInput key={key} label={LINK_LABELS[key]}
                id={`ops-link-${key}`}
                type="url"
                value={draft[key]}
                placeholder="https://app.dash0.com/…"
                onChange={(event) => setDraft({ ...draft, [key]: event.target.value })}
              />
          ))}
          <Button type="submit">Save links</Button>
        </form>
        <p role="status" aria-live="polite">
          {notice}
        </p>
      </details>
    </Card>
  );
}
