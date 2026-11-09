import { Link, useLocation } from 'react-router';
import { LanguageSelect, useI18n } from '../../../i18n/useI18n';

interface Props {
  eventName?: string;
  handle?: string;
  /** Page title shown instead of the event name on inner pages. */
  title?: string;
  back?: boolean;
}

export function AttendeeHeader({ eventName, handle, title, back }: Props) {
  const { pathname } = useLocation();
  const { t } = useI18n();
  const isHome = pathname === '/a' || pathname === '/a/';
  return (
    <header className="at-header">
      <a href="#main" className="at-skip">
        {t('skip')}
      </a>
      <div className="at-header__row">
        {back && !isHome ? (
          <Link to="/a" className="at-back" aria-label={t('backHome')}>
            <span aria-hidden="true">‹</span> {t('home')}
          </Link>
        ) : (
          <span className="at-brand">{t('brand')}</span>
        )}
        <span className="at-header__tools">
          <LanguageSelect id="attendee-lang" compact />
          {handle && (
            <span className="at-handle">
              <span className="at-sr-only">{t('youAre')} </span>
              {handle}
            </span>
          )}
        </span>
      </div>
      <h1 className="at-title">{title ?? eventName ?? ' '}</h1>
    </header>
  );
}
