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
    <header className="at-header">
      <a href="#main" className="at-skip">
        Skip to content
      </a>
      <div className="at-header__row">
        {back && !isHome ? (
          <Link to="/a" className="at-back" aria-label="Back to home">
            <span aria-hidden="true">‹</span> Home
          </Link>
        ) : (
          <span className="at-brand">Lanyard</span>
        )}
        {handle && (
          <span className="at-handle" title="Your anonymous handle for this event">
            <span className="ly-sr-only">You are </span>
            {handle}
          </span>
        )}
      </div>
      <h1 className="at-title">{title ?? eventName ?? ' '}</h1>
    </header>
  );
}
