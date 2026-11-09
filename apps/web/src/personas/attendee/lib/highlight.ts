// Search highlights arrive as strings with <em>…</em> around matched terms (ES default).
// We never inject HTML; this splits a highlight into plain and emphasised parts.
export interface HighlightPart {
  text: string;
  hit: boolean;
}

const TAG = /<\/?em>/g;

export function parseHighlight(fragment: string): HighlightPart[] {
  const parts: HighlightPart[] = [];
  let hit = false;
  let last = 0;
  for (const m of fragment.matchAll(TAG)) {
    const idx = m.index ?? 0;
    const text = fragment.slice(last, idx);
    if (text) parts.push({ text, hit });
    hit = m[0] === '<em>';
    last = idx + m[0].length;
  }
  const tail = fragment.slice(last);
  if (tail) parts.push({ text: tail, hit });
  // Strip any other tags defensively (plain text only).
  return parts.map((p) => ({ ...p, text: p.text.replace(/<[^>]*>/g, '') })).filter((p) => p.text);
}

/** Plain-text version of a highlight, for aria-labels and tests. */
export function stripHighlight(fragment: string): string {
  return parseHighlight(fragment)
    .map((p) => p.text)
    .join('');
}
