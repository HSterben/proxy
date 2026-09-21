import { useState, useEffect, useRef } from "react";
import TitleBar from "../components/TitleBar";
import { useTheme } from "../hooks/useTheme";
import { userFacingError } from "../lib/userFacingError";
import "./SettingsView.css";

const api = typeof window !== "undefined" ? window.electronAPI : null;

function formatKeybind(accel) {
  if (!accel) return "";
  return accel
    .replace("CommandOrControl", "Ctrl")
    .replace("+", " + ")
    .replace(/([A-Z])/g, " $1")
    .trim();
}

const KEY_TO_ACCEL = {
  " ": "Space",
  Tab: "Tab",
  Enter: "Return",
  Escape: "Escape",
  Backspace: "Backspace",
  Delete: "Delete",
  Insert: "Insert",
  Home: "Home",
  End: "End",
  PageUp: "PageUp",
  PageDown: "PageDown",
  ArrowUp: "Up",
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
  F1: "F1", F2: "F2", F3: "F3", F4: "F4", F5: "F5", F6: "F6",
  F7: "F7", F8: "F8", F9: "F9", F10: "F10", F11: "F11", F12: "F12",
};

function keyToAcceleratorKey(e) {
  const fromMap = KEY_TO_ACCEL[e.key];
  if (fromMap) return fromMap;
  if (e.code && e.code.startsWith("Key")) return e.code.slice(3).toUpperCase();
  if (e.code && e.code.startsWith("Digit")) return e.code.slice(5);
  if (e.key.length === 1) return e.key.toUpperCase();
  return e.key;
}

function buildAccelerator(e) {
  e.preventDefault();
  e.stopPropagation();
  const parts = [];
  if (e.ctrlKey || e.metaKey) parts.push("CommandOrControl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  const key = keyToAcceleratorKey(e);
  const isModifier = /^(Control|Alt|Shift|Meta)$/i.test(e.key);
  if (!key || isModifier) return null;
  parts.push(key);
  return parts.join("+");
}

const SIZE_LABELS = ["XSmall", "Small", "Regular", "Large", "XLarge"];
const POSITION_LABELS = [
  { value: "bottom-right", label: "Bottom Right" },
  { value: "bottom-left", label: "Bottom Left" },
  { value: "top-right", label: "Top Right" },
  { value: "top-left", label: "Top Left" },
];

const NAV = [
  { id: "general", label: "General" },
  { id: "appearance", label: "Appearance" },
  { id: "shortcuts", label: "Shortcuts" },
  { id: "notifications", label: "Notifications" },
  { id: "privacy", label: "Privacy" },
  { id: "account", label: "Account" },
];

function ToggleRow({ label, hint, checked, onChange }) {
  return (
    <div className="settings-row">
      <div>
        <div className="settings-row-label">{label}</div>
        {hint ? <div className="settings-row-hint">{hint}</div> : null}
      </div>
      <label className="settings-toggle">
        <input type="checkbox" checked={checked} onChange={onChange} />
        <span className="settings-toggle-slider" />
      </label>
    </div>
  );
}

export default function SettingsView() {
  const { preference, setTheme } = useTheme();
  const [section, setSection] = useState("general");
  const [keybind, setKeybind] = useState("");
  const [keybindEditing, setKeybindEditing] = useState(false);
  const [windowSize, setWindowSize] = useState("Regular");
  const [windowPosition, setWindowPosition] = useState("bottom-right");
  const [presetsPath, setPresetsPath] = useState("");
  const [runOnStartup, setRunOnStartup] = useState(false);
  const [typedStateOverrides, setTypedStateOverrides] = useState(true);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [usageDataEnabled, setUsageDataEnabled] = useState(false);
  const [message, setMessage] = useState(null);
  const [signedIn, setSignedIn] = useState(null);
  const [signingIn, setSigningIn] = useState(false);
  const [appVersion, setAppVersion] = useState("");
  const keybindInputRef = useRef(null);

  const loadSettings = async () => {
    if (!api) return;
    try {
      const [kb, size, pos, path, startup, token, version, typedOverrides] = await Promise.all([
        api.getKeybind(),
        api.getWindowSize(),
        api.getWindowPosition(),
        api.getPresetsPath(),
        api.getRunOnStartup?.() ?? Promise.resolve(false),
        api.getAuthToken?.() ?? Promise.resolve(null),
        api.getAppVersion?.() ?? Promise.resolve(""),
        api.getTypedStateOverrides?.() ?? Promise.resolve(true),
      ]);
      setKeybind(kb || "");
      setWindowSize(size || "Regular");
      setWindowPosition(pos || "bottom-right");
      setPresetsPath(path || "");
      setRunOnStartup(Boolean(startup));
      setSignedIn(Boolean(token));
      setAppVersion(version || "");
      setTypedStateOverrides(typedOverrides !== false);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  useEffect(() => {
    if (!keybindEditing) return;
    const onKeyDown = (e) => {
      const accel = buildAccelerator(e);
      if (accel) {
        api?.setKeybind(accel).then((r) => {
          if (r?.success) setKeybind(accel);
          setKeybindEditing(false);
        });
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [keybindEditing]);

  const handleKeybindClick = () => {
    setKeybindEditing(true);
    setTimeout(() => keybindInputRef.current?.focus(), 0);
  };

  const handleSizeChange = (e) => {
    const v = e.target.value;
    setWindowSize(v);
    api?.setWindowSize(v);
  };

  const handlePositionChange = (value) => {
    setWindowPosition(value);
    api?.setWindowPosition(value);
  };

  const showMessage = (text, isError = false) => {
    setMessage({ text, isError });
    setTimeout(() => setMessage(null), 3000);
  };

  useEffect(() => {
    const unsubSuccess = api?.onAuthSuccess?.(() => {
      setSignedIn(true);
      setSigningIn(false);
      setMessage({ text: "Signed in.", isError: false });
      setTimeout(() => setMessage(null), 3000);
    });
    const unsubLogout = api?.onAuthLogout?.(() => {
      setSignedIn(false);
      setSigningIn(false);
    });
    const unsubError = api?.onAuthError?.(() => {
      setSigningIn(false);
      setMessage({ text: "Sign-in didn’t finish. Try again.", isError: true });
      setTimeout(() => setMessage(null), 3000);
    });
    return () => {
      unsubSuccess?.();
      unsubLogout?.();
      unsubError?.();
    };
  }, []);

  const handleSignIn = async () => {
    setSigningIn(true);
    showMessage("Finish signing in in your browser…");
    try {
      await api?.openLogin?.();
    } catch (e) {
      setSigningIn(false);
      showMessage(userFacingError(e, "Couldn’t open the sign-in page"), true);
    }
  };

  const handleSignOut = async () => {
    try {
      await api?.logout?.();
      setSignedIn(false);
      showMessage("Signed out of PROXY.");
    } catch (e) {
      showMessage(userFacingError(e, "Couldn’t sign out"), true);
    }
  };

  const handleExport = async () => {
    const result = await api?.exportPresets();
    if (result?.canceled) return;
    if (result?.success) showMessage("States file exported.");
    else showMessage(result?.error || "Export failed", true);
  };

  const handleImport = async () => {
    const result = await api?.importPresets();
    if (result?.canceled) return;
    if (result?.success) showMessage("States file imported.");
    else showMessage(result?.error || "Import failed", true);
  };

  const handleDefaultPreset = async () => {
    const result = await api?.setPresetsPathToDefault();
    if (result?.success) {
      const path = await api?.getBundledPresetsPath();
      setPresetsPath(path || "Built-in states file");
      showMessage("Switched back to the built-in states file.");
    } else showMessage("Couldn’t reset the states file.", true);
  };

  const handleRunOnStartupChange = (e) => {
    const enabled = e.target.checked;
    setRunOnStartup(enabled);
    api?.setRunOnStartup?.(enabled).then((result) => {
      if (result && !result.success) showMessage(result.error || "Couldn’t update startup setting", true);
    });
  };

  const handleTypedStateOverridesChange = (e) => {
    const enabled = e.target.checked;
    setTypedStateOverrides(enabled);
    api?.setTypedStateOverrides?.(enabled).then((result) => {
      if (result && !result.success) {
        showMessage(result.error || "Couldn’t update state override setting", true);
      }
    });
  };

  const handleClose = () => api?.closeWindow?.();

  if (!api) {
    return (
      <div className="settings-view">
        <p>Open Settings from the PROXY desktop app.</p>
      </div>
    );
  }

  return (
    <div className="settings-view">
      <TitleBar title="Settings" onClose={handleClose} />
      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Settings sections">
          {NAV.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              className={`settings-nav-btn${section === id ? " is-active" : ""}`}
              onClick={() => setSection(id)}
            >
              {label}
            </button>
          ))}
        </nav>

        <div className="settings-panel">
          {message && (
            <div className={`settings-message ${message.isError ? "error" : ""}`}>{message.text}</div>
          )}

          {section === "general" && (
            <>
              <h2>General</h2>
              <ToggleRow
                label="Open PROXY at Windows sign-in"
                hint="Starts PROXY in the background when you log into Windows"
                checked={runOnStartup}
                onChange={handleRunOnStartupChange}
              />
              <ToggleRow
                label="Typed state overrides dropdown"
                hint="If you type a state word first (e.g. Summarize), use that instead of the selected dropdown state"
                checked={typedStateOverrides}
                onChange={handleTypedStateOverridesChange}
              />
              <div className="settings-row">
                <div>
                  <div className="settings-row-label">States</div>
                  <div className="settings-row-hint">Create and edit chat trigger words in the States window</div>
                </div>
                <button type="button" className="btn-secondary" onClick={() => api?.openPresetsWindow?.()}>
                  Open States
                </button>
              </div>
              <div className="settings-row">
                <div>
                  <div className="settings-row-label">States file path</div>
                  <div className="settings-row-hint">{presetsPath || "Not set"}</div>
                </div>
              </div>
              <div className="settings-actions-row">
                <button type="button" className="btn-secondary" onClick={handleExport}>Export states</button>
                <button type="button" className="btn-secondary" onClick={handleImport}>Import states</button>
                <button type="button" className="btn-secondary" onClick={handleDefaultPreset}>Use built-in file</button>
              </div>
            </>
          )}

          {section === "appearance" && (
            <>
              <h2>Appearance</h2>
              <div className="settings-row">
                <div>
                  <div className="settings-row-label">Theme</div>
                  <div className="settings-row-hint">Light, dark, or follow Windows</div>
                </div>
                <div className="theme-segment" role="group" aria-label="Theme">
                  {[
                    { id: "light", label: "Light" },
                    { id: "dark", label: "Dark" },
                    { id: "system", label: "System" },
                  ].map(({ id, label }) => (
                    <button
                      key={id}
                      type="button"
                      className={`theme-segment-btn${preference === id ? " is-active" : ""}`}
                      onClick={() => setTheme(id)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {section === "shortcuts" && (
            <>
              <h2>Shortcuts</h2>
              <div className="settings-row settings-row-stack">
                <div>
                  <div className="settings-row-label">Show or hide bubble</div>
                  <div className="settings-row-hint">Global shortcut while PROXY is running</div>
                </div>
                <div className="settings-keybind-row">
                  <input
                    ref={keybindInputRef}
                    type="text"
                    className="input-field settings-keybind-input"
                    value={keybindEditing ? "Press a key combo…" : formatKeybind(keybind)}
                    readOnly
                    onFocus={handleKeybindClick}
                    aria-label="Global keybind"
                  />
                  <button type="button" className="btn-secondary" onClick={handleKeybindClick}>
                    Change shortcut
                  </button>
                </div>
              </div>
              <div className="settings-row">
                <div>
                  <div className="settings-row-label">Bubble size</div>
                  <div className="settings-row-hint">{windowSize}</div>
                </div>
                <input
                  type="range"
                  min={0}
                  max={4}
                  value={Math.max(0, SIZE_LABELS.indexOf(windowSize))}
                  onChange={(e) => handleSizeChange({ target: { value: SIZE_LABELS[Number(e.target.value)] } })}
                  className="settings-slider"
                  aria-label="Bubble size"
                />
              </div>
              <div className="settings-row settings-row-stack">
                <div className="settings-row-label">Bubble corner</div>
                <div className="settings-position-grid">
                  {POSITION_LABELS.map(({ value, label }) => (
                    <button
                      key={value}
                      type="button"
                      className={`settings-position-btn ${windowPosition === value ? "active" : ""}`}
                      onClick={() => handlePositionChange(value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {section === "account" && (
            <>
              <h2>Account</h2>
              <div className="settings-account-card">
                <p className="settings-row-hint">
                  {signedIn === null
                    ? "Checking whether you’re signed in…"
                    : signedIn
                      ? "Signed in. Chat history sync, states, and usage use this PROXY account."
                      : "Sign in to sync states across devices and send chat messages."}
                </p>
                <div className="settings-account-actions">
                  {signedIn ? (
                    <button type="button" className="btn-danger" onClick={() => void handleSignOut()}>
                      Sign out
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => void handleSignIn()}
                      disabled={signingIn}
                    >
                      {signingIn ? "Waiting for browser…" : "Sign in"}
                    </button>
                  )}
                  <button type="button" className="btn-secondary" onClick={() => api?.openSubscriptionWindow?.()}>
                    Plan and usage
                  </button>
                </div>
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ marginTop: 10 }}
                  onClick={() => api?.openExternal?.("https://getproxy.ca/account/billing")}
                >
                  Open billing on the website
                </button>
                <div className="settings-version">PROXY {appVersion || "…"}</div>
              </div>
            </>
          )}
          {section === "notifications" && (
            <>
              <h2>Notifications</h2>
              <ToggleRow
                label="Windows notifications"
                hint="Show a notification when PROXY needs your attention"
                checked={notificationsEnabled}
                onChange={(e) => setNotificationsEnabled(e.target.checked)}
              />
            </>
          )}

          {section === "privacy" && (
            <>
              <h2>Privacy</h2>
              <ToggleRow
                label="Share anonymous diagnostics"
                hint="Sends crash and usage signals without chat contents"
                checked={usageDataEnabled}
                onChange={(e) => setUsageDataEnabled(e.target.checked)}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
