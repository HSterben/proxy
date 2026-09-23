import { useState, useEffect, useRef } from "react";
import TitleBar from "../components/TitleBar";
import AccountAvatar from "../components/AccountAvatar";
import { useTheme } from "../hooks/useTheme";
import { useMyProfile } from "../hooks/useMyProfile";
import { userFacingError } from "../lib/userFacingError";
import { convexSiteUrl } from "../lib/convexUrls";
import {
  isSpeechToTextSupported,
  listMicrophones,
  requestMicrophoneAccess,
  getStoredMicDeviceId,
  setStoredMicDeviceId,
} from "../lib/speechToText";
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
  { id: "audio", label: "Audio" },
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
  const {
    loading: profileLoading,
    signedIn: profileSignedIn,
    displayName,
    avatarUrl,
    refresh: refreshProfile,
  } = useMyProfile();
  const [section, setSection] = useState("general");
  const [keybind, setKeybind] = useState("");
  const [voiceKeybind, setVoiceKeybind] = useState("");
  const [keybindEditing, setKeybindEditing] = useState(null); // null | 'show' | 'voice'
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
  const [micDeviceId, setMicDeviceId] = useState("");
  const [micEnabled, setMicEnabled] = useState(true);
  const [microphones, setMicrophones] = useState([]);
  const [micPermission, setMicPermission] = useState("unknown");
  const [micBusy, setMicBusy] = useState(false);
  const [speechStatus, setSpeechStatus] = useState(null);
  const keybindInputRef = useRef(null);
  const voiceKeybindInputRef = useRef(null);

  const loadSettings = async () => {
    if (!api) return;
    try {
      const [kb, voiceKb, size, pos, path, startup, token, version, typedOverrides, notifications, micId, micOn] =
        await Promise.all([
          api.getKeybind(),
          api.getVoiceKeybind?.() ?? Promise.resolve(""),
          api.getWindowSize(),
          api.getWindowPosition(),
          api.getPresetsPath(),
          api.getRunOnStartup?.() ?? Promise.resolve(false),
          api.getAuthToken?.() ?? Promise.resolve(null),
          api.getAppVersion?.() ?? Promise.resolve(""),
          api.getTypedStateOverrides?.() ?? Promise.resolve(true),
          api.getNotificationsEnabled?.() ?? Promise.resolve(true),
          api.getMicDeviceId?.() ?? Promise.resolve(""),
          api.getMicEnabled?.() ?? Promise.resolve(true),
        ]);
      setKeybind(kb || "");
      setVoiceKeybind(voiceKb || "");
      setWindowSize(size || "Regular");
      setWindowPosition(pos || "bottom-right");
      setPresetsPath(path || "");
      setRunOnStartup(Boolean(startup));
      setSignedIn(Boolean(token));
      setAppVersion(version || "");
      setTypedStateOverrides(typedOverrides !== false);
      setNotificationsEnabled(notifications !== false);
      setMicEnabled(micOn !== false);
      setMicDeviceId(
        (typeof micId === "string" && micId) || getStoredMicDeviceId() || "",
      );
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
      if (!accel) return;
      const save =
        keybindEditing === "voice"
          ? api?.setVoiceKeybind?.(accel)
          : api?.setKeybind(accel);
      Promise.resolve(save).then((r) => {
        if (r?.success) {
          if (keybindEditing === "voice") setVoiceKeybind(accel);
          else setKeybind(accel);
        } else if (r?.error) {
          showMessage(r.error, true);
        }
        setKeybindEditing(null);
      });
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [keybindEditing]);

  const handleKeybindClick = (which = "show") => {
    setKeybindEditing(which);
    setTimeout(() => {
      if (which === "voice") voiceKeybindInputRef.current?.focus();
      else keybindInputRef.current?.focus();
    }, 0);
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
      void refreshProfile();
      setMessage({ text: "Signed in to PROXY.", isError: false });
      setTimeout(() => setMessage(null), 3000);
    });
    const unsubLogout = api?.onAuthLogout?.(() => {
      setSignedIn(false);
      setSigningIn(false);
      void refreshProfile();
    });
    const unsubError = api?.onAuthError?.(() => {
      setSigningIn(false);
      setMessage({ text: "Sign-in didn’t finish. Try again from Settings.", isError: true });
      setTimeout(() => setMessage(null), 3000);
    });
    return () => {
      unsubSuccess?.();
      unsubLogout?.();
      unsubError?.();
    };
  }, [refreshProfile]);

  const handleSignIn = async () => {
    setSigningIn(true);
    showMessage("Complete sign-in in your browser…");
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
      showMessage("Signed out.");
    } catch (e) {
      showMessage(userFacingError(e, "Couldn’t sign out"), true);
    }
  };

  const handleExport = async () => {
    const result = await api?.exportPresets();
    if (result?.canceled) return;
    if (result?.success) showMessage("States exported.");
    else showMessage(result?.error || "Export failed", true);
  };

  const handleImport = async () => {
    const result = await api?.importPresets();
    if (result?.canceled) return;
    if (result?.success) showMessage("States imported.");
    else showMessage(result?.error || "Import failed", true);
  };

  const handleDefaultPreset = async () => {
    const result = await api?.setPresetsPathToDefault();
    if (result?.success) {
      const path = await api?.getBundledPresetsPath();
      setPresetsPath(path || "Built-in states file");
      showMessage("Using the built-in states file again.");
    } else showMessage("Couldn’t switch back to the built-in states file.", true);
  };

  const handleRunOnStartupChange = (e) => {
    const enabled = e.target.checked;
    setRunOnStartup(enabled);
    api?.setRunOnStartup?.(enabled).then((result) => {
      if (result && !result.success) showMessage(result.error || "Couldn’t change the startup setting", true);
    });
  };

  const handleNotificationsChange = (e) => {
    const enabled = e.target.checked;
    setNotificationsEnabled(enabled);
    api?.setNotificationsEnabled?.(enabled).then((result) => {
      if (result && !result.success) {
        showMessage(result.error || "Couldn’t change notifications", true);
      }
    });
  };

  const refreshMicrophones = async ({ requestAccess = false, preferredId = micDeviceId } = {}) => {
    setMicBusy(true);
    try {
      if (requestAccess) {
        await requestMicrophoneAccess(preferredId);
        setMicPermission("granted");
      }
      const list = await listMicrophones();
      setMicrophones(list);
      if (list.some((m) => m.label && !m.label.startsWith("Microphone "))) {
        setMicPermission("granted");
      }
      return list;
    } catch (err) {
      setMicPermission("denied");
      setMicrophones([]);
      throw err;
    } finally {
      setMicBusy(false);
    }
  };

  const checkSpeechBackend = async () => {
    try {
      const res = await fetch(`${convexSiteUrl}/openrouter/transcribe/status`);
      const data = await res.json().catch(() => ({}));
      const next = {
        ok: Boolean(data.ok),
        provider: data.provider || "none",
        hint: data.hint || (res.ok ? "Status unknown." : `Couldn’t check speech status (HTTP ${res.status})`),
      };
      setSpeechStatus(next);
      return next;
    } catch (err) {
      const next = {
        ok: false,
        provider: "none",
        hint: userFacingError(err, "Couldn’t reach PROXY’s speech status"),
      };
      setSpeechStatus(next);
      return next;
    }
  };

  useEffect(() => {
    if (section !== "audio" || !micEnabled) return;
    void (async () => {
      try {
        await refreshMicrophones({ requestAccess: true });
      } catch (err) {
        showMessage(userFacingError(err, "Allow the microphone when Windows asks"), true);
      }
      await checkSpeechBackend();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, micEnabled]);

  const handleMicDeviceChange = async (e) => {
    const next = e.target.value;
    setMicDeviceId(next);
    setStoredMicDeviceId(next);
    try {
      await refreshMicrophones({ requestAccess: true, preferredId: next });
      showMessage(next ? "Microphone saved." : "Using the Windows default microphone.");
    } catch (err) {
      showMessage(userFacingError(err, "Couldn’t use that microphone"), true);
    }
    try {
      if (api?.setMicDeviceId) await api.setMicDeviceId(next);
    } catch (err) {
      console.warn("setMicDeviceId IPC unavailable:", err);
    }
  };

  const handleTypedStateOverridesChange = (e) => {
    const enabled = e.target.checked;
    setTypedStateOverrides(enabled);
    api?.setTypedStateOverrides?.(enabled).then((result) => {
      if (result && !result.success) {
        showMessage(result.error || "Couldn’t change the typed-state setting", true);
      }
    });
  };

  const handleClose = () => api?.closeWindow?.();

  if (!api) {
    return (
      <div className="settings-view">
        <p>Open Settings from the PROXY tray menu.</p>
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
                label="Launch PROXY when Windows starts"
                hint="PROXY opens in the tray after you sign in to Windows"
                checked={runOnStartup}
                onChange={handleRunOnStartupChange}
              />
              <ToggleRow
                label="Typed state wins over dropdown"
                hint="If your message starts with a state name like Simplify, that state is used instead of the one selected in the bubble"
                checked={typedStateOverrides}
                onChange={handleTypedStateOverridesChange}
              />
              <div className="settings-row">
                <div>
                  <div className="settings-row-label">States</div>
                  <div className="settings-row-hint">
                    Edit trigger words and instructions in the States window
                  </div>
                </div>
                <button type="button" className="btn-secondary" onClick={() => api?.openPresetsWindow?.()}>
                  Open States
                </button>
              </div>
              <div className="settings-row">
                <div>
                  <div className="settings-row-label">States file on this PC</div>
                  <div className="settings-row-hint">{presetsPath || "Using the built-in file"}</div>
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
                  <div className="settings-row-hint">
                    System follows your Windows light or dark setting
                  </div>
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

          {section === "audio" && (
            <>
              <h2>Audio</h2>
              <ToggleRow
                label="Microphone"
                hint="Turns speech-to-text off and removes the mic button from the bubble and chat windows"
                checked={micEnabled}
                onChange={(e) => {
                  const enabled = e.target.checked;
                  setMicEnabled(enabled);
                  api?.setMicEnabled?.(enabled).then((result) => {
                    if (result && !result.success) {
                      setMicEnabled(!enabled);
                      showMessage(result.error || "Couldn’t update the microphone setting", true);
                    }
                  });
                }}
              />
              {!micEnabled ? (
                <p className="settings-hint">
                  Turn the microphone on to pick an input device and dictate into the bubble or chat.
                </p>
              ) : !isSpeechToTextSupported() ? (
                <p className="settings-hint">
                  This PC can’t record from a microphone in PROXY.
                </p>
              ) : (
                <>
                  <div className="settings-row settings-row-stack">
                    <div>
                      <div className="settings-row-label">Input device</div>
                      <div className="settings-row-hint">
                        {micBusy
                          ? "Waiting for Windows microphone permission…"
                          : micPermission === "denied"
                            ? "Windows blocked the mic. Allow PROXY in the permission prompt, or enable microphone access in Windows Privacy settings."
                            : micPermission === "granted"
                              ? "Used by the mic button in the bubble and in chat windows"
                              : "Choosing a device asks Windows for microphone access so the list can show real names"}
                      </div>
                    </div>
                    <select
                      className="select-field"
                      value={micDeviceId}
                      onChange={(e) => void handleMicDeviceChange(e)}
                      disabled={micBusy}
                    >
                      <option value="">Windows default</option>
                      {microphones.map((mic) => (
                        <option key={mic.deviceId} value={mic.deviceId}>
                          {mic.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="settings-row settings-row-stack">
                    <div>
                      <div className="settings-row-label">Transcription service</div>
                      <div className="settings-row-hint">
                        {speechStatus == null
                          ? "Checking…"
                          : speechStatus.ok
                            ? `Connected (${speechStatus.provider})`
                            : speechStatus.hint || "PROXY’s speech endpoint isn’t available right now"}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => void checkSpeechBackend()}
                    >
                      Check again
                    </button>
                  </div>
                  <p className="settings-hint">
                    Click the mic once to record, again to turn speech into text. The voice shortcut
                    opens the bubble with the mic already on; press it again to close.
                  </p>
                </>
              )}
            </>
          )}

          {section === "shortcuts" && (
            <>
              <h2>Shortcuts</h2>
              <div className="settings-row settings-row-stack">
                <div>
                  <div className="settings-row-label">Show or hide bubble</div>
                  <div className="settings-row-hint">
                    Works while PROXY is running, even when the bubble is hidden
                  </div>
                </div>
                <div className="settings-keybind-row">
                  <input
                    ref={keybindInputRef}
                    type="text"
                    className="input-field settings-keybind-input"
                    value={keybindEditing === "show" ? "Press keys now…" : formatKeybind(keybind)}
                    readOnly
                    onFocus={() => handleKeybindClick("show")}
                    aria-label="Show or hide bubble shortcut"
                  />
                  <button type="button" className="btn-secondary" onClick={() => handleKeybindClick("show")}>
                    Change shortcut
                  </button>
                </div>
              </div>
              <div className="settings-row settings-row-stack">
                <div>
                  <div className="settings-row-label">Bubble with microphone</div>
                  <div className="settings-row-hint">
                    Opens the bubble and starts dictation; press again to close
                  </div>
                </div>
                <div className="settings-keybind-row">
                  <input
                    ref={voiceKeybindInputRef}
                    type="text"
                    className="input-field settings-keybind-input"
                    value={
                      keybindEditing === "voice"
                        ? "Press keys now…"
                        : formatKeybind(voiceKeybind)
                    }
                    readOnly
                    onFocus={() => handleKeybindClick("voice")}
                    aria-label="Voice dictation shortcut"
                  />
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => handleKeybindClick("voice")}
                  >
                    Change shortcut
                  </button>
                </div>
              </div>
              <div className="settings-row">
                <div>
                  <div className="settings-row-label">Bubble size</div>
                  <div className="settings-row-hint">
                    Currently {windowSize}. Controls how wide the quick-ask bubble is
                  </div>
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
                <div>
                  <div className="settings-row-label">Bubble corner</div>
                  <div className="settings-row-hint">Which corner of the screen the bubble sits in</div>
                </div>
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
                <div className="settings-account-identity">
                  <AccountAvatar
                    name={displayName || (signedIn ? "Account" : "Sign in")}
                    src={profileSignedIn ? avatarUrl : null}
                    size={48}
                  />
                  <div className="settings-account-identity-text">
                    <div className="settings-account-name">
                      {profileLoading && signedIn !== false
                        ? "Loading…"
                        : signedIn
                          ? displayName || "PROXY account"
                          : "Not signed in"}
                    </div>
                    <p className="settings-row-hint">
                      {signedIn === null
                        ? "Checking sign-in…"
                        : signedIn
                          ? "States sync and chat messages use this PROXY account."
                          : "Sign in to send chat messages and sync states across devices."}
                    </p>
                  </div>
                </div>
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
                  Open billing on getproxy.ca
                </button>
                <div className="settings-version">PROXY {appVersion || "…"}</div>
              </div>
            </>
          )}
          {section === "notifications" && (
            <>
              <h2>Notifications</h2>
              <ToggleRow
                label="Ready toast on launch"
                hint="Shows a Windows notification with your open shortcut when PROXY starts"
                checked={notificationsEnabled}
                onChange={handleNotificationsChange}
              />
            </>
          )}

          {section === "privacy" && (
            <>
              <h2>Privacy</h2>
              <ToggleRow
                label="Allow anonymous diagnostics"
                hint="Local preference only for now. Chat text is never included in diagnostics"
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
