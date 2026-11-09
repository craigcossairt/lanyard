import type { ReactNode } from 'react';
import { Icon } from './Icon';
import { StatusPill } from './StatusPill';
import { cx } from './cx';

export interface QuestionItemProps {
  /** Cluster label: the merged question as the room asked it. */
  label: string;
  /** Representative question text, shown under the label. */
  text?: string;
  votes: number;
  /** How many people asked something in this cluster (QuestionCluster.size). */
  askers: number;
  /** The viewer asked a question in this cluster: shows "You + N others". */
  mine?: boolean;
  /** Attendee: the viewer's upvote state. Omit onVote to show rank instead (speaker). */
  voted?: boolean;
  onVote?: () => void;
  /** Speaker: position in the ranking, shown where the vote button would be. */
  rank?: number;
  answered?: boolean;
  /** Speaker actions, e.g. an "Answered" toggle. */
  actions?: ReactNode;
  /** stage: projector size. */
  size?: 'default' | 'stage';
}

/** One merged question cluster. Render inside <QuestionList>. */
export function QuestionItem({
  label,
  text,
  votes,
  askers,
  mine,
  voted,
  onVote,
  rank,
  answered,
  actions,
  size = 'default',
}: QuestionItemProps) {
  const others = Math.max(0, askers - 1);
  return (
    <li
      className={cx(
        'ly-q',
        mine && 'ly-q--mine',
        answered && 'ly-q--answered',
        size === 'stage' && 'ly-q--stage',
      )}
    >
      {onVote ? (
        <button
          type="button"
          className="ly-q__vote"
          aria-pressed={!!voted}
          aria-label={`Upvote: ${label}. ${votes} ${votes === 1 ? 'vote' : 'votes'}`}
          onClick={onVote}
        >
          <Icon name="up" />
          <span className="ly-num">{votes}</span>
        </button>
      ) : (
        <span className="ly-q__rank ly-num" aria-label={rank ? `Rank ${rank}` : undefined}>
          {rank ?? votes}
        </span>
      )}
      <div>
        <p className="ly-q__label">{label}</p>
        {text && <p className="ly-q__text">{text}</p>}
        <div className="ly-q__meta">
          {mine ? (
            <StatusPill tone="info">
              You{others > 0 ? ` + ${others} ${others === 1 ? 'other' : 'others'}` : ''}
            </StatusPill>
          ) : (
            <span className="ly-muted">
              {askers} {askers === 1 ? 'person' : 'people'} asked
            </span>
          )}
          {!onVote && (
            <span className="ly-muted ly-num">
              {votes} {votes === 1 ? 'vote' : 'votes'}
            </span>
          )}
          {answered && <StatusPill tone="ok">Answered</StatusPill>}
          {actions}
        </div>
      </div>
    </li>
  );
}

export function QuestionList({
  label = 'Questions, most votes first',
  children,
}: {
  label?: string;
  children: ReactNode;
}) {
  return (
    <ul className="ly-qlist" aria-label={label}>
      {children}
    </ul>
  );
}
