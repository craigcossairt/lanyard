import type { ReactNode } from 'react';
import { Meter } from './Meter';
import { StatusPill } from './StatusPill';
import { cx } from './cx';

export type SloState = 'ok' | 'warn' | 'crit';

const DEFAULT_STATE_LABEL: Record<SloState, string> = {
  ok: 'Healthy',
  warn: 'At risk',
  crit: 'Breached',
};

export interface RoomTileProps {
  name: string;
  state: SloState;
  /** Override the state text, e.g. "Overflow". */
  stateLabel?: string;
  occupancy: number;
  capacity: number;
  /** Current session title. */
  session?: string;
  /** Extra stats shown in mono, e.g. { signals: 8, questions: 23 }. */
  stats?: Record<string, ReactNode>;
  /** Makes the whole tile clickable (open the room's detail). The room name is the button. */
  onSelect?: () => void;
}

/**
 * A room as a "service" on the organizer ops board. State shows three ways:
 * the left edge colour, the pill's icon, and the pill's text.
 */
export function RoomTile({
  name,
  state,
  stateLabel,
  occupancy,
  capacity,
  session,
  stats,
  onSelect,
}: RoomTileProps) {
  return (
    <article className={cx('ly-room', `ly-room--${state}`)} aria-label={name}>
      <div className="ly-room__head">
        {onSelect ? (
          <button type="button" className="ly-room__name ly-room__open" onClick={onSelect}>
            {name}
          </button>
        ) : (
          <p className="ly-room__name">{name}</p>
        )}
        <StatusPill tone={state}>{stateLabel ?? DEFAULT_STATE_LABEL[state]}</StatusPill>
      </div>
      {session && <p className="ly-room__session">{session}</p>}
      <Meter
        label="Occupancy"
        value={occupancy}
        max={capacity}
        valueText={`${occupancy} / ${capacity}`}
        overText="over capacity"
        warnAt={0.75}
        critAt={0.9}
      />
      {stats && (
        <dl className="ly-room__stats">
          {Object.entries(stats).map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      )}
    </article>
  );
}
