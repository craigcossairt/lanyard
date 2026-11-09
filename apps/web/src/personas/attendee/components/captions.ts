export interface CaptionChunk {
  chunkId: string;
  text: string;
  /** Set when a chunk names the person speaking. Absent today: the session list is the fallback. */
  speaker?: string;
  lang?: string;
}

export interface CaptionGroup {
  speaker: string;
  lines: CaptionChunk[];
}

/**
 * A new group (and a visible speaker marker) starts when the speaker label changes.
 * Chunks without their own speaker inherit `fallback`, so a single-speaker session
 * shows the name once. Per-utterance changes work as soon as a chunk carries `speaker`.
 */
export function groupCaptionLines(
  lines: readonly CaptionChunk[],
  fallback: string,
): CaptionGroup[] {
  const groups: CaptionGroup[] = [];
  for (const line of lines) {
    const speaker = line.speaker?.trim() || fallback;
    const last = groups[groups.length - 1];
    if (!last || last.speaker !== speaker) groups.push({ speaker, lines: [line] });
    else last.lines.push(line);
  }
  return groups;
}

export function speakerLabel(names: readonly string[]): string {
  return names
    .map((name) => name.trim())
    .filter(Boolean)
    .join(', ');
}
