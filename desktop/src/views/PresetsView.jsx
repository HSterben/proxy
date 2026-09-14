import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { ConvexClient } from "convex/browser";
import { api as convexApi } from "../../../backend/convex/_generated/api";
import TitleBar from "../components/TitleBar";
import { convexUrl } from "../lib/convexUrls";
import { userFacingError } from "../lib/userFacingError";
import { clampOutputTokens } from "../lib/contextBudget";
import "./SettingsView.css";
import "./PresetsView.css";
import "../components/AppShell.css";

const api = typeof window !== "undefined" ? window.electronAPI : null;

function sanitizePresetsForCloud(presets) {
  const out = {};
  for (const [name, raw] of Object.entries(presets || {})) {
    if (!name || !raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const o = {};
    if (typeof raw.description === "string") o.description = raw.description;
    else if (typeof raw.desc === "string") o.description = raw.desc;
    if (typeof raw.systemInstruction === "string") o.systemInstruction = raw.systemInstruction;
    else if (typeof raw.system_instruction === "string") o.systemInstruction = raw.system_instruction;
    if (typeof raw.temperature === "number") o.temperature = raw.temperature;
    if (typeof raw.maxTokens === "number") o.maxTokens = raw.maxTokens;
    if (typeof raw.topP === "number") o.topP = raw.topP;
    if (typeof raw.frequencyPenalty === "number") o.frequencyPenalty = raw.frequencyPenalty;
    if (typeof raw.presencePenalty === "number") o.presencePenalty = raw.presencePenalty;
    if (typeof raw.stop === "string") o.stop = raw.stop;
    else if (Array.isArray(raw.stop) && raw.stop.every((s) => typeof s === "string")) o.stop = raw.stop;
    o.visibility = raw.visibility === "public" ? "public" : "private";
    out[name] = o;
  }
  return out;
}

function rowId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function emptyEntry() {
  return {
    id: rowId(),
    name: "",
    description: "",
    systemInstruction: "",
    temperature: "",
    maxTokens: "",
    topP: "",
    frequencyPenalty: "",
    presencePenalty: "",
    stopLines: "",
    visibility: "private",
    isOwner: true,
    isOfficial: false,
    stateId: null,
  };
}

function canEditVisibility(entry) {
  return Boolean(entry?.isOwner) && !entry?.isOfficial;
}

function fromRawPreset(name, raw, meta = {}) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...emptyEntry(), name, ...meta };
  }
  const stop = raw.stop;
  let stopLines = "";
  if (Array.isArray(stop)) stopLines = stop.join("\n");
  else if (stop != null && String(stop).trim() !== "") stopLines = String(stop);

  const num = (v) => (v != null && v !== "" && !Number.isNaN(Number(v)) ? String(v) : "");

  const isOfficial = meta.isOfficial ?? Boolean(raw.isOfficial);
  const isOwner =
    meta.isOwner != null ? Boolean(meta.isOwner) : raw.isOwner != null ? Boolean(raw.isOwner) : true;

  return {
    id: rowId(),
    name,
    description: raw.description != null ? String(raw.description) : raw.desc != null ? String(raw.desc) : "",
    systemInstruction:
      raw.systemInstruction != null
        ? String(raw.systemInstruction)
        : raw.system_instruction != null
          ? String(raw.system_instruction)
          : "",
    temperature: num(raw.temperature),
    maxTokens: raw.maxTokens != null && raw.maxTokens !== "" ? String(raw.maxTokens) : "",
    topP: num(raw.topP),
    frequencyPenalty: num(raw.frequencyPenalty),
    presencePenalty: num(raw.presencePenalty),
    stopLines,
    visibility: raw.visibility === "public" ? "public" : "private",
    isOwner,
    isOfficial,
    stateId: meta.stateId ?? raw.stateId ?? null,
  };
}

function parseOptionalNumber(str, allowIntOnly) {
  const s = String(str ?? "").trim();
  if (s === "") return undefined;
  const n = allowIntOnly ? parseInt(s, 10) : parseFloat(s);
  return Number.isFinite(n) ? n : NaN;
}

function parseStopLines(text) {
  const lines = String(text || "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  if (lines.length === 0) return undefined;
  if (lines.length === 1) return lines[0];
  return lines;
}

function entryToPresetObject(e) {
  const o = {};
  const desc = e.description.trim();
  if (desc) o.description = desc;
  const sys = e.systemInstruction.trim();
  if (sys) o.systemInstruction = sys;

  const t = parseOptionalNumber(e.temperature, false);
  if (!Number.isNaN(t)) o.temperature = t;

  const mt = parseOptionalNumber(e.maxTokens, true);
  if (!Number.isNaN(mt)) o.maxTokens = clampOutputTokens(mt);

  const tp = parseOptionalNumber(e.topP, false);
  if (!Number.isNaN(tp)) o.topP = tp;

  const fp = parseOptionalNumber(e.frequencyPenalty, false);
  if (!Number.isNaN(fp)) o.frequencyPenalty = fp;

  const pp = parseOptionalNumber(e.presencePenalty, false);
  if (!Number.isNaN(pp)) o.presencePenalty = pp;

  const stop = parseStopLines(e.stopLines);
  if (stop !== undefined) o.stop = stop;

  o.visibility = e.visibility === "public" ? "public" : "private";

  return o;
}

function entriesToPresetsObject(entries) {
  const out = {};
  for (const e of entries) {
    const name = e.name.trim();
    if (!name) continue;
    out[name] = entryToPresetObject(e);
  }
  return out;
}

function snapshotEntries(entries) {
  return JSON.stringify(
    entries.map((e) => ({
      id: e.id,
      name: e.name,
      description: e.description,
      systemInstruction: e.systemInstruction,
      temperature: e.temperature,
      maxTokens: e.maxTokens,
      topP: e.topP,
      frequencyPenalty: e.frequencyPenalty,
      presencePenalty: e.presencePenalty,
      stopLines: e.stopLines,
      visibility: e.visibility === "public" ? "public" : "private",
      isOwner: Boolean(e.isOwner),
      isOfficial: Boolean(e.isOfficial),
      stateId: e.stateId || null,
    }))
  );
}

function uniqueNewName(existing) {
  const lower = new Set(existing.map((n) => n.trim().toLowerCase()).filter(Boolean));
  let base = "NewState";
  let n = base;
  let i = 2;
  while (lower.has(n.toLowerCase())) {
    n = `${base}${i}`;
    i += 1;
  }
  return n;
}

function contentFingerprint(presets) {
  return JSON.stringify(sanitizePresetsForCloud(presets));
}

function presetsToEntries(presets, previousEntries = [], library = null) {
  const prevByLower = new Map(
    (previousEntries || []).map((e) => [e.name.trim().toLowerCase(), e])
  );
  const metaByLower = new Map();
  if (Array.isArray(library)) {
    for (const item of library) {
      if (!item?.name) continue;
      metaByLower.set(String(item.name).trim().toLowerCase(), {
        isOwner: Boolean(item.isOwner),
        isOfficial: Boolean(item.isOfficial),
        stateId: item.id || null,
        visibility: item.visibility === "public" ? "public" : "private",
      });
    }
  }

  return Object.entries(presets || {})
    .filter(([, v]) => v && typeof v === "object" && !Array.isArray(v))
    .map(([name, v]) => {
      const lower = name.toLowerCase();
      const prev = prevByLower.get(lower);
      const fromLib = metaByLower.get(lower);
      const meta = fromLib
        ? {
            isOwner: fromLib.isOwner,
            isOfficial: fromLib.isOfficial,
            stateId: fromLib.stateId,
          }
        : prev
          ? {
              isOwner: prev.isOwner,
              isOfficial: prev.isOfficial,
              stateId: prev.stateId,
            }
          : { isOwner: true, isOfficial: false, stateId: null };
      const row = fromRawPreset(name, v, meta);
      if (fromLib?.visibility) row.visibility = fromLib.visibility;
      if (prev) row.id = prev.id;
      return row;
    })
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

export default function PresetsView() {
  const convex = useRef(new ConvexClient(convexUrl));
  const scrollRef = useRef(null);
  const dirtyRef = useRef(false);
  const loadingRef = useRef(false);
  const fingerprintRef = useRef("");
  const [entries, setEntries] = useState([]);
  const [baselineSnapshot, setBaselineSnapshot] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState(null);
  const [saving, setSaving] = useState(false);
  const [signedIn, setSignedIn] = useState(null);
  const [signingIn, setSigningIn] = useState(false);
  const [canCreateStates, setCanCreateStates] = useState(true);
  const [canPublishStates, setCanPublishStates] = useState(true);

  const showMessage = useCallback((text, isError = false) => {
    setMessage({ text, isError });
    setTimeout(() => setMessage(null), 4000);
  }, []);

  const loadPresets = useCallback(async ({
    source = "init",
    showSpinner = source === "init",
    force = false,
  } = {}) => {
    if (!api) return;
    if (loadingRef.current && !force) return;
    if (dirtyRef.current && source !== "manual" && source !== "init" && !force) {
      return;
    }
    if (dirtyRef.current && source === "manual") {
      const ok = window.confirm(
        "You have unsaved edits. Refresh from your account and discard them?"
      );
      if (!ok) return;
    }

    loadingRef.current = true;
    if (showSpinner) setLoading(true);
    else setRefreshing(true);

    const scrollEl = scrollRef.current;
    const savedScroll = scrollEl ? scrollEl.scrollTop : 0;

    try {
      let presets = {};
      let cloudLoaded = false;
      let libraryMeta = null;

      try {
        const token = await api.getAuthToken?.();
        setSignedIn(Boolean(token));
        if (token) {
          convex.current.setAuth(async () => (await api.getAuthToken?.()) ?? token);
          try {
            const account = await convex.current.query(convexApi.account.getMyAccount, {});
            setCanCreateStates(Boolean(account?.canCreateStates));
            setCanPublishStates(Boolean(account?.canPublishStates));
          } catch (accountErr) {
            console.warn("Account entitlements unavailable:", accountErr);
          }
          if (source === "manual" || source === "init" || source === "auth") {
            try {
              await convex.current.mutation(convexApi.states.ensureMyLibrary, {});
            } catch (migrateErr) {
              console.warn("Library migrate skipped:", migrateErr);
            }
            const cloud = await convex.current.query(convexApi.states.getMyStates, {});
            if (cloud?.states && Object.keys(cloud.states).length > 0) {
              presets = cloud.states;
              libraryMeta = cloud.library || null;
              cloudLoaded = true;
              await api.writePresets?.(presets, { broadcast: true });
              const subject = (() => {
                try {
                  const parts = String(token).split('.');
                  if (parts.length < 2) return null;
                  const json = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
                  const payload = JSON.parse(json);
                  return typeof payload.sub === 'string' ? payload.sub : null;
                } catch {
                  return null;
                }
              })();
              if (subject) await api.setPresetsOwner?.(subject);
            }
          }
        }

        if (!cloudLoaded) {
          const readResult = await api.readPresets();
          presets =
            readResult?.success && readResult.presets ? readResult.presets : {};
          if (
            token &&
            (source === "manual" || source === "init" || source === "auth") &&
            Object.keys(presets).length > 0
          ) {
            await convex.current.mutation(convexApi.states.saveMyStates, {
              states: sanitizePresetsForCloud(presets),
            });
          }
        }
      } catch (cloudErr) {
        console.error("Cloud states load failed, using local:", cloudErr);
        const readResult = await api.readPresets();
        presets =
          readResult?.success && readResult.presets ? readResult.presets : {};
        if (source === "manual") {
          showMessage(userFacingError(cloudErr, "Couldn’t refresh states from your account."), true);
        }
      }

      setEntries((prev) => {
        const list = presetsToEntries(presets, prev, libraryMeta);
        fingerprintRef.current = contentFingerprint(presets);
        setBaselineSnapshot(snapshotEntries(list));
        return list;
      });

      if (source === "manual") {
        const tokenNow = await api.getAuthToken?.();
        showMessage(
          tokenNow
            ? "States updated from your PROXY account."
            : "Loaded states from this device. Sign in to sync with your account."
        );
      }
    } catch (e) {
      console.error(e);
      showMessage(userFacingError(e, "Couldn’t load states."), true);
    } finally {
      loadingRef.current = false;
      setLoading(false);
      setRefreshing(false);
      requestAnimationFrame(() => {
        if (scrollRef.current && savedScroll > 0) {
          scrollRef.current.scrollTop = savedScroll;
        }
      });
    }
  }, [showMessage]);

  useEffect(() => {
    void loadPresets({ source: "init", showSpinner: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount once
  }, []);

  useEffect(() => {
    if (!api?.onPresetsUpdated) return undefined;
    // External changes only (import/other window). Never full cloud reload.
    return api.onPresetsUpdated(() => {
      if (dirtyRef.current || loadingRef.current) return;
      void (async () => {
        const readResult = await api.readPresets();
        if (!readResult?.success || !readResult.presets) return;
        const fp = contentFingerprint(readResult.presets);
        if (fp === fingerprintRef.current) return;
        const scrollEl = scrollRef.current;
        const savedScroll = scrollEl ? scrollEl.scrollTop : 0;
        setEntries((prev) => {
          const list = presetsToEntries(readResult.presets, prev);
          fingerprintRef.current = fp;
          setBaselineSnapshot(snapshotEntries(list));
          return list;
        });
        requestAnimationFrame(() => {
          if (scrollRef.current) scrollRef.current.scrollTop = savedScroll;
        });
      })();
    });
  }, []);

  useEffect(() => {
    const unsubSuccess = api?.onAuthSuccess?.(() => {
      setSignedIn(true);
      setSigningIn(false);
      void loadPresets({ source: "auth", showSpinner: false, force: true });
      showMessage("Signed in. States synced from your PROXY account.");
    });
    const unsubLogout = api?.onAuthLogout?.(() => {
      setSignedIn(false);
      setSigningIn(false);
      convex.current.setAuth(async () => null);
    });
    const unsubError = api?.onAuthError?.(() => {
      setSigningIn(false);
      showMessage("Sign-in didn’t finish. Try again.", true);
    });
    return () => {
      unsubSuccess?.();
      unsubLogout?.();
      unsubError?.();
    };
  }, [loadPresets, showMessage]);

  useEffect(() => {
    void (async () => {
      try {
        const token = await api?.getAuthToken?.();
        setSignedIn(Boolean(token));
      } catch {
        setSignedIn(false);
      }
    })();
  }, []);

  const handleClose = () => api?.closeWindow?.();

  const dirty = useMemo(() => snapshotEntries(entries) !== baselineSnapshot, [entries, baselineSnapshot]);
  dirtyRef.current = dirty;

  const handleSignIn = async () => {
    setSigningIn(true);
    showMessage("Finish signing in in your browser…");
    try {
      await api?.openLogin?.();
    } catch (e) {
      setSigningIn(false);
      showMessage(userFacingError(e, "Couldn’t open the sign-in page."), true);
    }
  };

  const handleSignOut = async () => {
    try {
      await api?.logout?.();
      setSignedIn(false);
      convex.current.setAuth(async () => null);
      showMessage("Signed out. States on this device are unchanged.");
    } catch (e) {
      showMessage(userFacingError(e, "Couldn’t sign out."), true);
    }
  };

  const handleRefresh = () => {
    void loadPresets({ source: "manual", showSpinner: false, force: true });
  };

  const updateEntry = (index, patch) => {
    setEntries((prev) => {
      const next = [...prev];
      const current = next[index];
      if (!current) return prev;
      const safePatch = { ...patch };
      if ("visibility" in safePatch && !canEditVisibility(current)) {
        delete safePatch.visibility;
      }
      next[index] = { ...current, ...safePatch };
      return next;
    });
  };

  const removeEntry = (index) => {
    setEntries((prev) => {
      const target = prev[index];
      if (target?.isOfficial) return prev;
      return prev.filter((_, i) => i !== index);
    });
  };

  const addEntry = () => {
    if (!canCreateStates) {
      showMessage("Subscribe to PROXY to create custom states.", true);
      return;
    }
    const names = entries.map((e) => e.name);
    setEntries((prev) => [...prev, { ...emptyEntry(), name: uniqueNewName(names) }]);
  };

  const validateBeforeSave = () => {
    const names = entries.map((e) => e.name.trim()).filter(Boolean);
    if (names.length !== entries.filter((e) => e.name.trim()).length) {
      return "Give every state a trigger word, or remove empty ones.";
    }
    const seen = new Set();
    for (const n of names) {
      const k = n.toLowerCase();
      if (seen.has(k)) return `Two states use the same trigger word: "${n}" (case doesn’t matter).`;
      seen.add(k);
    }
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      const fields = [
        ["Temperature", e.temperature],
        ["Max tokens", e.maxTokens],
        ["Top P", e.topP],
        ["Frequency penalty", e.frequencyPenalty],
        ["Presence penalty", e.presencePenalty],
      ];
      for (const [label, val] of fields) {
        const s = String(val ?? "").trim();
        if (s === "") continue;
        const num = label === "Max tokens" ? parseInt(s, 10) : parseFloat(s);
        if (!Number.isFinite(num)) {
          return `State "${e.name.trim() || "(unnamed)"}": ${label} must be a number.`;
        }
      }
    }
    return null;
  };

  const handleSave = async () => {
    if (!api?.writePresets) return;
    const err = validateBeforeSave();
    if (err) {
      showMessage(userFacingError(err, "Couldn’t save states."), true);
      return;
    }
    const payload = entriesToPresetsObject(entries);
    setSaving(true);
    try {
      const result = await api.writePresets(payload);
      if (!result?.success) {
        showMessage(result?.error || "Couldn’t save states.", true);
        return;
      }

      let synced = result.presets ?? payload;
      let libraryMeta = null;
      try {
        const token = await api.getAuthToken?.();
        if (token) {
          convex.current.setAuth(async () => token);
          const cloud = await convex.current.mutation(convexApi.states.saveMyStates, {
            states: sanitizePresetsForCloud(synced),
          });
          if (cloud?.states) {
            synced = cloud.states;
            await api.writePresets?.(cloud.states, { broadcast: true });
          }
          libraryMeta = cloud?.library || null;
        } else {
          showMessage("Saved on this device. Sign in to sync states to your account.", true);
        }
      } catch (cloudErr) {
        console.error(cloudErr);
        showMessage("Saved on this device, but account sync failed. Sign in and try Save again.", true);
      }

      const list = presetsToEntries(synced, entries, libraryMeta);
      setEntries(list);
      setBaselineSnapshot(snapshotEntries(list));
      fingerprintRef.current = contentFingerprint(synced);
      showMessage("States saved.");
    } catch (e) {
      showMessage(userFacingError(e, "Couldn’t save states."), true);
    } finally {
      setSaving(false);
    }
  };

  const handleRevert = () => {
    try {
      const parsed = JSON.parse(baselineSnapshot || "[]");
      setEntries(
        Array.isArray(parsed)
          ? parsed.map((e) => ({ ...emptyEntry(), ...e, id: e.id || rowId() }))
          : []
      );
    } catch {
      void loadPresets({ source: "manual", showSpinner: false, force: true });
    }
    showMessage("Discarded unsaved edits.");
  };

  if (!api) {
    return (
      <div className="settings-view">
        <p>Open States from the PROXY desktop app.</p>
      </div>
    );
  }

  return (
    <div className="settings-view">
      <TitleBar title="States" onClose={handleClose} />
      <div className="presets-layout">
      <div className="settings-scroll presets-scroll" ref={scrollRef}>
        {message && (
          <div className={`settings-message ${message.isError ? "error" : ""}`}>{message.text}</div>
        )}

        <section className="settings-section presets-intro">
          <div className="presets-intro-head">
            <div>
              <h2>Your states</h2>
              <p className="settings-hint">
                {dirty ? "Unsaved edits · " : ""}
                In chat, put the trigger word first, for example <code>Simplify hello</code>.
                {canPublishStates
                  ? " New states stay private until you turn on Make public."
                  : " Free accounts can use Simplify, List, and Critique. Subscribe to create or publish states."}
              </p>
            </div>
          </div>

          <div className="presets-account-bar">
            <div className="presets-account-status">
              {signedIn === null ? (
                <span className="presets-account-label">Checking whether you’re signed in…</span>
              ) : signedIn ? (
                <span className="presets-account-label presets-account-label-on">
                  Signed in · states sync to your PROXY account
                </span>
              ) : (
                <span className="presets-account-label">
                  Signed out · states stay on this device until you sign in
                </span>
              )}
            </div>
            <div className="presets-account-actions">
              <button
                type="button"
                className="btn-secondary btn-sm"
                onClick={handleRefresh}
                disabled={refreshing || loading}
                title={
                  signedIn
                    ? "Download the latest states from your PROXY account"
                    : "Reload states saved on this device"
                }
              >
                {refreshing ? "Refreshing…" : "Refresh"}
              </button>
              {signedIn ? (
                <button
                  type="button"
                  className="btn-danger btn-sm"
                  onClick={() => void handleSignOut()}
                >
                  Sign out
                </button>
              ) : (
                <button
                  type="button"
                  className="btn-primary btn-sm"
                  onClick={() => void handleSignIn()}
                  disabled={signingIn}
                >
                  {signingIn ? "Waiting for browser…" : "Sign in"}
                </button>
              )}
            </div>
          </div>
        </section>

        {loading ? (
          <p className="settings-hint presets-loading">Loading states…</p>
        ) : entries.length === 0 ? (
          <p className="settings-hint">No states yet. Add a state to create a chat trigger word.</p>
        ) : (
          entries.map((entry, index) => (
            <section key={entry.id} className="preset-card">
              <div className="preset-card-head">
                <input
                  type="text"
                  className="preset-input preset-name-input"
                  value={entry.name}
                  onChange={(e) => updateEntry(index, { name: e.target.value })}
                  placeholder="Trigger word"
                  spellCheck={false}
                  aria-label="Trigger word"
                />
                {!entry.isOfficial && (
                  <button
                    type="button"
                    className="btn-danger btn-sm preset-remove"
                    onClick={() => removeEntry(index)}
                  >
                    Remove
                  </button>
                )}
              </div>

              <input
                type="text"
                className="preset-input"
                value={entry.description}
                onChange={(e) => updateEntry(index, { description: e.target.value })}
                placeholder="Short description shown in chat"
                aria-label="Description"
              />

              <textarea
                className="preset-textarea"
                value={entry.systemInstruction}
                onChange={(e) => updateEntry(index, { systemInstruction: e.target.value })}
                placeholder="How PROXY should behave for this trigger"
                rows={4}
                spellCheck={false}
                aria-label="Instructions"
              />

              {canEditVisibility(entry) && canPublishStates ? (
                <label className="preset-visibility">
                  <input
                    type="checkbox"
                    checked={entry.visibility === "public"}
                    onChange={(e) =>
                      updateEntry(index, {
                        visibility: e.target.checked ? "public" : "private",
                      })
                    }
                  />
                  <span>
                    <span className="preset-visibility-title">Make public</span>
                    <span className="preset-visibility-hint">
                      Lists this state in the website gallery. Leave off to keep it private.
                    </span>
                  </span>
                </label>
              ) : (
                <div className="preset-visibility preset-visibility-readonly">
                  <span>
                    <span className="preset-visibility-title">
                      {entry.isOfficial
                        ? "Official PROXY state"
                        : !canPublishStates
                          ? "Publishing requires a subscription"
                        : entry.visibility === "public"
                          ? "Public (from gallery)"
                          : "Private"}
                    </span>
                    <span className="preset-visibility-hint">
                      {entry.isOfficial
                        ? "Built-in PROXY states stay public. You can’t change visibility."
                        : !canPublishStates
                          ? "Free accounts can use Simplify, List, and Critique. Subscribe to publish."
                        : "Only the owner can change public or private for this state."}
                    </span>
                  </span>
                </div>
              )}

              <details className="preset-advanced">
                <summary>Advanced</summary>
                <div className="preset-number-grid">
                  <label className="preset-field preset-field-compact">
                    <span className="preset-label">Temperature</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      className="preset-input"
                      value={entry.temperature}
                      onChange={(e) => updateEntry(index, { temperature: e.target.value })}
                      placeholder="0.7"
                    />
                  </label>
                  <label className="preset-field preset-field-compact">
                    <span className="preset-label">Max tokens (output, 2K to 4K)</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      className="preset-input"
                      value={entry.maxTokens}
                      onChange={(e) => updateEntry(index, { maxTokens: e.target.value })}
                      placeholder="4096"
                    />
                  </label>
                  <label className="preset-field preset-field-compact">
                    <span className="preset-label">Top P</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      className="preset-input"
                      value={entry.topP}
                      onChange={(e) => updateEntry(index, { topP: e.target.value })}
                      placeholder="0.95"
                    />
                  </label>
                  <label className="preset-field preset-field-compact">
                    <span className="preset-label">Frequency penalty</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      className="preset-input"
                      value={entry.frequencyPenalty}
                      onChange={(e) => updateEntry(index, { frequencyPenalty: e.target.value })}
                      placeholder="0"
                    />
                  </label>
                  <label className="preset-field preset-field-compact">
                    <span className="preset-label">Presence penalty</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      className="preset-input"
                      value={entry.presencePenalty}
                      onChange={(e) => updateEntry(index, { presencePenalty: e.target.value })}
                      placeholder="0.3"
                    />
                  </label>
                </div>
                <textarea
                  className="preset-textarea preset-textarea-sm"
                  value={entry.stopLines}
                  onChange={(e) => updateEntry(index, { stopLines: e.target.value })}
                  placeholder="Stop sequences, one per line (optional)"
                  rows={2}
                  spellCheck={false}
                  aria-label="Stop sequences"
                />
              </details>
            </section>
          ))
        )}
      </div>

      {!loading && (
        <div className="presets-footer">
          <button
            type="button"
            className="btn-secondary"
            onClick={addEntry}
            disabled={!canCreateStates}
            title={canCreateStates ? undefined : "Subscribe to create custom states"}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M12 5v14M5 12h14" />
            </svg>
            Add state
          </button>
          <div className="presets-footer-right">
            <button type="button" className="btn-secondary" onClick={handleRevert} disabled={!dirty}>
              Discard edits
            </button>
            <button
              type="button"
              className="btn-success"
              onClick={handleSave}
              disabled={saving || !dirty}
            >
              {saving ? "Saving…" : "Save all"}
            </button>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
