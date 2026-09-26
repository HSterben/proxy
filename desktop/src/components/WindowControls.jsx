export default function WindowControls({ onClose }) {
  const api = typeof window !== 'undefined' ? window.electronAPI : null;
  if (api?.isMac) return null;

  return (
    <div className="app-window-controls">
      <button
        type="button"
        className="app-caption-btn"
        onClick={() => api?.minimizeWindow?.()}
        aria-label="Minimize"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
          <path d="M2 6h8" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      </button>
      <button
        type="button"
        className="app-caption-btn"
        onClick={() => api?.maximizeWindow?.()}
        aria-label="Maximize"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
          <rect x="2.25" y="2.25" width="7.5" height="7.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      </button>
      <button
        type="button"
        className="app-caption-btn app-caption-btn-close"
        onClick={onClose}
        aria-label="Close"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
          <path d="M3 3l6 6M9 3L3 9" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      </button>
    </div>
  );
}
