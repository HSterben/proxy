import ProxyMark from './ProxyMark';
import TitleBar from './TitleBar';
import AccountAvatar from './AccountAvatar';
import { useMyProfile } from '../hooks/useMyProfile';
import './AppShell.css';

const api = typeof window !== 'undefined' ? window.electronAPI : null;

function NavButton({ active, label, onClick, children }) {
  return (
    <button
      type="button"
      className={`app-rail-btn${active ? ' is-active' : ''}`}
      onClick={onClick}
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  );
}

export default function AppShell({ active = 'chat', title = 'PROXY', onClose, children }) {
  const { loading, signedIn, displayName, avatarUrl } = useMyProfile();
  const accountLabel = signedIn
    ? displayName || 'Account'
    : loading
      ? 'Account'
      : 'Sign in';

  const openChat = () => {
    if (active !== 'chat') api?.toggleBubble?.();
  };

  return (
    <div className="app-shell">
      <nav className="app-rail" aria-label="Main">
        <div className="app-rail-brand">
          <ProxyMark size={22} />
        </div>
        <div className="app-rail-nav">
          <NavButton active={active === 'chat'} label="Chat" onClick={openChat}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </NavButton>
          <NavButton
            active={active === 'states'}
            label="States"
            onClick={() => api?.openPresetsWindow?.()}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
              <rect x="3" y="3" width="7" height="7" rx="1.5" />
              <rect x="14" y="3" width="7" height="7" rx="1.5" />
              <rect x="3" y="14" width="7" height="7" rx="1.5" />
              <rect x="14" y="14" width="7" height="7" rx="1.5" />
            </svg>
          </NavButton>
          <NavButton
            active={active === 'settings'}
            label="Settings"
            onClick={() => api?.openSettingsWindow?.()}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
              <circle cx="12" cy="12" r="3" />
              <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
            </svg>
          </NavButton>
        </div>
        <div className="app-rail-footer">
          <button
            type="button"
            className="app-rail-account"
            aria-label={accountLabel}
            title={accountLabel}
            onClick={() => api?.openSubscriptionWindow?.()}
          >
            {signedIn ? (
              <AccountAvatar name={displayName || 'Account'} src={avatarUrl} size={36} />
            ) : (
              <span className="app-rail-avatar-placeholder" aria-hidden>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <circle cx="12" cy="8" r="3.5" />
                  <path d="M5 21a7 7 0 0 1 14 0" />
                </svg>
              </span>
            )}
            <span className="app-rail-account-name">
              {loading && !signedIn ? '…' : signedIn ? displayName || 'Account' : 'Sign in'}
            </span>
          </button>
        </div>
      </nav>
      <div className="app-main">
        {onClose ? <TitleBar title={title} onClose={onClose} /> : null}
        <div className="app-main-body">{children}</div>
      </div>
    </div>
  );
}
