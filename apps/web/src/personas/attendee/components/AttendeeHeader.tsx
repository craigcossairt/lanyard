import { Link, useLocation } from 'react-router';

interface Props {
  eventName?: string;
  handle?: string;
  /** Page title shown instead of the event name on inner pages. */
  title?: string;
  back?: boolean;
}

export function AttendeeHeader({ eventName, handle, title, back }: Props) {
  const { pathname } = useLocation();
  const isHome = pathname === '/a' || pathname === '/a/';
  return (
    <div className="at-header">
      {/* The shell's app bar above carries the brand and the skip link. */}
      <div className="at-header__row">
        {back && !isHome ? (
          <Link to="/a" className="at-back" aria-label="Back to home">
            <span aria-hidden="true">‹</span> Home
          </Link>
        ) : (
          <span />
        )}
        {handle && (
          <span className="at-handle" title="Your anonymous handle for this event">
            <span className="at-sr-only">You are </span>
            {handle}
          </span>
        )}
      </div>
      <h1 className="at-title">{title ?? (eventName ? 'Today’s sessions' : ' ')}</h1>
    </div>
  );
}
