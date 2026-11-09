import type { ReactNode } from 'react';
import { IconButton } from './Button';
import { Icon } from './Icon';
import { LivePill } from './StatusPill';

export interface CaptionStageProps {
  title: string;
  live?: boolean;
  /** People in the room. */
  count?: number | string;
  onDisplaySettings?: () => void;
  /** A <Banner>, e.g. while reconnecting. */
  banner?: ReactNode;
  /** The <CaptionStream>. */
  captions: ReactNode;
  /** Desktop only (900px and wider): questions and signals, always visible beside the captions. */
  side?: ReactNode;
  /** Buttons for the bottom dock (Button with `stacked`). Mark ones the side panel covers with data-dock-desktop="hide". */
  dock: ReactNode;
}

/**
 * Direction A, "Caption stage": the attendee live-session layout.
 * Captions own the screen; everything else is one thumb away in the dock, and opens in a Sheet.
 * On a laptop, a side panel shows questions and signals next to the captions.
 */
export function CaptionStage({
  title,
  live = true,
  count,
  onDisplaySettings,
  banner,
  captions,
  side,
  dock,
}: CaptionStageProps) {
  return (
    <div className="ly-stage">
      {banner}
      <header className="ly-stage__head">
        {live && <LivePill />}
        <h1 className="ly-stage__title" title={title}>
          {title}
        </h1>
        {count !== undefined && (
          <span className="ly-stage__count">
            <Icon name="people" />
            <span className="ly-num">{count}</span>
            <span className="ly-sr-only">people here</span>
          </span>
        )}
        {onDisplaySettings && (
          <IconButton icon="display" label="Display settings" onClick={onDisplaySettings} />
        )}
      </header>
      <main className="ly-stage__main">{captions}</main>
      {side && (
        <aside className="ly-stage__side" aria-label="Questions and reactions">
          {side}
        </aside>
      )}
      <nav className="ly-stage__dock" aria-label="Session actions">
        {dock}
      </nav>
    </div>
  );
}
