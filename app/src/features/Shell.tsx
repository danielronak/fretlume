import { Navigate, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useSettings } from '@/state/settings';
import { APP_NAME } from '@/config';
import { t } from '@i18n/index';
import { Icon } from '@ui/icons';
import { IconButton } from '@ui/index';
import { useTheme } from '@ui/useTheme';
import { destinations, settingsDestination } from './routes';
import './shell.css';

/** App frame: a left rail on wide screens, a bottom bar on phones. */
export function Shell() {
  const [theme, toggleTheme] = useTheme();
  const onboarded = useSettings((s) => s.onboarded);
  const location = useLocation();

  // First visit: show the welcome flow (developer routes stay reachable for tests and review).
  if (!onboarded && !location.pathname.startsWith('/dev')) {
    return <Navigate to="/welcome" replace />;
  }

  return (
    <div className="shell">
      <nav className="shell__nav" aria-label={t('navLabel')}>
        <div className="shell__brand" aria-hidden="true">
          <img src={`${import.meta.env.BASE_URL}icons/mark.svg`} alt="" width="36" height="36" />
        </div>
        <ul className="shell__links">
          {destinations.map((d) => (
            <li key={d.path}>
              <NavLink to={d.path} className="shell__link">
                <Icon name={d.icon} />
                <span>{t(d.nav)}</span>
              </NavLink>
            </li>
          ))}
        </ul>
        <div className="shell__footer">
          <NavLink
            to={settingsDestination.path}
            className="shell__link shell__link--icon"
            aria-label={t(settingsDestination.nav)}
            title={t(settingsDestination.nav)}
          >
            <Icon name="settings" />
          </NavLink>
          <IconButton
            label={theme === 'dark' ? t('themeToLight') : t('themeToDark')}
            onClick={toggleTheme}
            data-testid="theme-toggle"
          >
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
          </IconButton>
        </div>
      </nav>
      <header className="shell__topbar">
        <span className="shell__wordmark">{APP_NAME}</span>
        <span className="shell__topbar-actions">
          <NavLink
            to={settingsDestination.path}
            className="icon-btn"
            aria-label={t(settingsDestination.nav)}
          >
            <Icon name="settings" />
          </NavLink>
          <IconButton
            label={theme === 'dark' ? t('themeToLight') : t('themeToDark')}
            onClick={toggleTheme}
          >
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
          </IconButton>
        </span>
      </header>
      <main className="shell__main" id="main">
        <Outlet />
      </main>
    </div>
  );
}
