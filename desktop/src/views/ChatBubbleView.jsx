// View: Quick launch shortcut bubble
import { useState, useEffect, useRef, useCallback } from 'react';
import ProxyMark from '../components/ProxyMark';
import {
  FREE_DEFAULT_PRESETS,
  pullCloudStatesToDisk,
  resetLocalStatesToFreeDefaults,
  subjectFromAccessToken,
} from '../lib/syncCloudStates';
import { useSpeechToText } from '../hooks/useSpeechToText';
import { getStoredMicDeviceId } from '../lib/speechToText';
import { convexSiteUrl } from '../lib/convexUrls';
import { VoiceBeam, getAudioContext } from 'voice-glow';
import '../index.css';

const api = typeof window !== 'undefined' ? window.electronAPI : null;
const CLOUD_SYNC_MIN_MS = 8_000;

function BubbleControls({ onHide }) {
  const hide = () => {
    onHide?.();
    api?.hideWindow?.();
  };
  return (
    <div className="bubble-controls">
      <button type="button" className="bubble-control-btn" onClick={hide} aria-label="Hide bubble">
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
          <path d="M2 6h8" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      </button>
      <button type="button" className="bubble-control-btn bubble-control-close" onClick={hide} aria-label="Hide bubble">
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
          <path d="M3 3l6 6M9 3L3 9" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      </button>
    </div>
  );
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const ChatBubbleView = () => {
  const [message, setMessage] = useState('');
  const [attachedFiles, setAttachedFiles] = useState([]);
  const [presets, setPresets] = useState({});
  const [activePreset, setActivePreset] = useState('');
  const [typedStateOverrides, setTypedStateOverrides] = useState(true);
  const [stateMenuOpen, setStateMenuOpen] = useState(false);
  const [micDeviceId, setMicDeviceId] = useState(() => getStoredMicDeviceId());
  const [micEnabled, setMicEnabled] = useState(true);
  const [speechNotice, setSpeechNotice] = useState('');
  const messageRef = useRef('');
  const dictationPrefixRef = useRef(null);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const syncingRef = useRef(false);
  const lastCloudSyncRef = useRef(0);
  const presetsRef = useRef({});

  const applyPresets = useCallback((next) => {
    if (!next || typeof next !== 'object') return;
    presetsRef.current = next;
    setPresets(next);
    setActivePreset((prev) => (prev && next[prev] ? prev : ''));
  }, []);

  useEffect(() => {
    messageRef.current = message;
  }, [message]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api?.getMicDeviceId?.() ?? Promise.resolve(''),
      api?.getMicEnabled?.() ?? Promise.resolve(true),
    ])
      .then(([id, enabled]) => {
        if (cancelled) return;
        if (typeof id === 'string' && id) setMicDeviceId(id);
        setMicEnabled(enabled !== false);
      })
      .catch(() => {});
    const unsub = api?.onMicEnabledChanged?.((enabled) => {
      setMicEnabled(enabled !== false);
    });
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, []);

  const speechApplyEnabledRef = useRef(true);

  const applySpeechTranscript = useCallback((transcript) => {
    if (!speechApplyEnabledRef.current) return;
    setSpeechNotice('');
    const prefix = String(dictationPrefixRef.current ?? '').trimEnd();
    setMessage(prefix ? `${prefix} ${transcript}` : transcript);
  }, []);

  const {
    supported: speechSupported,
    listening,
    transcribing,
    stream: micStream,
    start: startSpeech,
    cancel: cancelSpeech,
    toggle: toggleSpeech,
  } = useSpeechToText({
    deviceId: micDeviceId,
    enabled: micEnabled,
    getAuthToken: async () => (await api?.getAuthToken?.()) ?? null,
    transcribeUrl: `${convexSiteUrl}/openrouter/transcribe`,
    onPartial: applySpeechTranscript,
    onResult: (transcript) => {
      applySpeechTranscript(transcript);
      dictationPrefixRef.current = null;
    },
    onError: (msg) => {
      if (!speechApplyEnabledRef.current) return;
      dictationPrefixRef.current = null;
      setSpeechNotice(String(msg || 'Speech failed.'));
    },
  });

  const voiceTheme =
    typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'light'
      ? 'light'
      : 'dark';

  const handleMicClick = () => {
    if (!micEnabled) return;
    speechApplyEnabledRef.current = true;
    try {
      getAudioContext();
    } catch {
      /* ignore */
    }
    toggleSpeech();
  };

  const clearSpeechSession = useCallback(() => {
    speechApplyEnabledRef.current = false;
    dictationPrefixRef.current = null;
    cancelSpeech();
    setSpeechNotice('');
  }, [cancelSpeech]);

  useEffect(() => {
    if (!micEnabled && (listening || transcribing)) {
      cancelSpeech();
    }
  }, [micEnabled, listening, transcribing, cancelSpeech]);

  const listeningRef = useRef(listening);
  const transcribingRef = useRef(transcribing);
  listeningRef.current = listening;
  transcribingRef.current = transcribing;

  useEffect(() => {
    const unsubStart = api?.onStartVoiceDictation?.(() => {
      if (!micEnabled || !speechSupported || listeningRef.current || transcribingRef.current) {
        return;
      }
      speechApplyEnabledRef.current = true;
      try {
        getAudioContext();
      } catch {
        /* ignore */
      }
      void startSpeech();
    });
    const unsubStop = api?.onStopVoiceDictation?.(() => {
      clearSpeechSession();
    });
    return () => {
      unsubStart?.();
      unsubStop?.();
    };
  }, [micEnabled, speechSupported, startSpeech, clearSpeechSession]);

  useEffect(() => {
    if (listening) {
      dictationPrefixRef.current = messageRef.current;
      setSpeechNotice('');
    }
  }, [listening]);

  const syncFromCloud = useCallback(async ({ force = false } = {}) => {
    if (!api?.getAuthToken) return presetsRef.current;
    if (syncingRef.current) return presetsRef.current;

    const now = Date.now();
    let mustForce = force;
    try {
      const token = await api.getAuthToken();
      if (!token) {
        const local = await api.readPresets?.();
        if (local?.success && local.presets) applyPresets(local.presets);
        return presetsRef.current;
      }

      const subject = subjectFromAccessToken(token);
      const owner = await api.getPresetsOwner?.();
      if (subject && owner && subject !== owner) mustForce = true;
      if (!mustForce && now - lastCloudSyncRef.current < CLOUD_SYNC_MIN_MS) {
        return presetsRef.current;
      }

      syncingRef.current = true;
      const cloud = await pullCloudStatesToDisk({
        token,
        writePresets: api.writePresets,
        setPresetsOwner: api.setPresetsOwner,
      });
      lastCloudSyncRef.current = Date.now();
      if (cloud) {
        applyPresets(cloud);
      } else {
        const local = await api.readPresets?.();
        if (local?.success && local.presets) applyPresets(local.presets);
      }
      return presetsRef.current;
    } catch (err) {
      console.error('Bubble cloud state sync failed:', err);
      return presetsRef.current;
    } finally {
      syncingRef.current = false;
    }
  }, [applyPresets]);

  useEffect(() => {
    api?.readPresets?.().then((result) => {
      if (result?.success && result.presets) applyPresets(result.presets);
    });
    void syncFromCloud({ force: true });

    const unsubPresets = api?.onPresetsUpdated?.(() => {
      api?.readPresets?.().then((result) => {
        if (result?.success && result.presets) applyPresets(result.presets);
      });
    });
    const unsubAuth = api?.onAuthSuccess?.((data) => {
      if (data?.token) void syncFromCloud({ force: true });
      else {
        void resetLocalStatesToFreeDefaults({
          writePresets: api.writePresets,
          setPresetsOwner: api.setPresetsOwner,
        }).then((defaults) => applyPresets(defaults || FREE_DEFAULT_PRESETS));
      }
    });
    const unsubLogout = api?.onAuthLogout?.(() => {
      void resetLocalStatesToFreeDefaults({
        writePresets: api.writePresets,
        setPresetsOwner: api.setPresetsOwner,
      }).then((defaults) => applyPresets(defaults || FREE_DEFAULT_PRESETS));
    });

    return () => {
      unsubPresets?.();
      unsubAuth?.();
      unsubLogout?.();
    };
  }, [applyPresets, syncFromCloud]);

  useEffect(() => {
    const onFocus = () => {
      void syncFromCloud({ force: false });
      requestAnimationFrame(() => textareaRef.current?.focus());
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void syncFromCloud({ force: false });
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [syncFromCloud]);

  useEffect(() => {
    api?.getTypedStateOverrides?.()
      .then((value) => setTypedStateOverrides(value !== false))
      .catch(() => {});
    const unsub = api?.onTypedStateOverridesChanged?.((value) => {
      setTypedStateOverrides(value !== false);
    });
    return typeof unsub === 'function' ? unsub : undefined;
  }, []);

  useEffect(() => {
    const handlePaste = async (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const imageItems = Array.from(items).filter((item) => item.type.startsWith('image/'));
      if (imageItems.length === 0) return;
      e.preventDefault();
      for (const item of imageItems) {
        const file = item.getAsFile();
        if (!file) continue;
        try {
          const dataUrl = await fileToDataUrl(file);
          setAttachedFiles((prev) => [
            ...prev,
            {
              dataUrl,
              type: file.type,
              name: `pasted-image-${Date.now()}.${file.type.split('/')[1] || 'png'}`,
            },
          ]);
        } catch (error) {
          console.error('Error pasting image:', error);
        }
      }
    };
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, []);

  const handleFileSelect = async (e) => {
    const files = Array.from(e.target.files || []).filter(
      (file) => file.type.startsWith('image/') || file.type === 'application/pdf',
    );
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (files.length === 0) return;

    const next = [];
    for (const file of files) {
      try {
        const dataUrl = await fileToDataUrl(file);
        next.push({
          dataUrl,
          type: file.type.startsWith('image/') ? file.type : 'image/png',
          name: file.name,
        });
      } catch (err) {
        console.error('Error reading file:', err);
      }
    }
    if (next.length) setAttachedFiles((prev) => [...prev, ...next]);
  };

  const presetNames = Object.keys(presets).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  const stateLabel = activePreset || 'Default';

  const clearComposer = useCallback(() => {
    clearSpeechSession();
    setMessage('');
    setAttachedFiles([]);
  }, [clearSpeechSession]);

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    const messageText = message.trim();
    if (!messageText && attachedFiles.length === 0) return;

    // Snapshot before clearing; drop in-flight dictation so it can't refill the bubble.
    const filesToSend = [...attachedFiles];
    clearComposer();

    // Ensure trigger matching uses the account library, not a stale disk copy.
    const latestPresets = (await syncFromCloud({ force: false })) || presets;

    let text = messageText;
    const firstWord = (messageText.split(/\s+/)[0] || '').replace(/\W/g, '');
    const typedIsState = Boolean(
      firstWord &&
        Object.keys(latestPresets).some((name) => name.toLowerCase() === firstWord.toLowerCase()),
    );
    const shouldPrependDropdown =
      Boolean(activePreset) && !(typedStateOverrides && typedIsState);

    if (shouldPrependDropdown && messageText) {
      text = `${activePreset} ${messageText}`;
    } else if (activePreset && !messageText) {
      text = activePreset;
    }

    if (!api?.sendMessage) {
      console.warn('IPC not available');
      return;
    }

    try {
      await api.sendMessage({
        message: text,
        images: filesToSend.map(({ dataUrl, type, name }) => ({ dataUrl, type, name })),
      });
    } catch (error) {
      console.error('Error sending message:', error);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
    if (e.key === 'Escape') {
      clearComposer();
      api?.hideWindow?.();
    }
  };

  return (
    <div className="bubble-window">
      <header className="bubble-titlebar">
        <div className="bubble-brand">
          <ProxyMark size={18} />
          <span className="bubble-brand-name">PROXY</span>
        </div>
        <BubbleControls onHide={clearSpeechSession} />
      </header>

      <form className="bubble-composer-form" onSubmit={handleSubmit}>
        <VoiceBeam
          className="bubble-voice-beam"
          type="default"
          stream={micStream}
          processing={transcribing}
          colorVariant="ocean"
          theme={voiceTheme}
          active={Boolean(micStream) || transcribing}
          strength={0.9}
        >
          <div className="bubble-input-box">
        {attachedFiles.length > 0 && (
          <div className="bubble-attachments">
            {attachedFiles.map((file, idx) => (
              <div key={`${file.name}-${idx}`} className="bubble-attachment-item">
                <img src={file.dataUrl} alt={file.name} className="bubble-attachment-thumb" />
                <button
                  type="button"
                  className="bubble-attachment-remove"
                  aria-label="Remove attachment"
                  onClick={() => setAttachedFiles((prev) => prev.filter((_, i) => i !== idx))}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        <textarea
          ref={textareaRef}
          className="bubble-textarea"
          placeholder="Ask PROXY…"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={3}
          spellCheck
          autoComplete="off"
          autoCorrect="off"
        />

        <div className="bubble-input-footer">
          <div className="bubble-state-menu">
            <button
              type="button"
              className="bubble-state-pill"
              onClick={() => setStateMenuOpen((open) => !open)}
              aria-haspopup="listbox"
              aria-expanded={stateMenuOpen}
            >
              <svg className="bubble-state-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
              </svg>
              <span className="bubble-state-label">{stateLabel}</span>
              <svg className="bubble-state-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
            {stateMenuOpen && (
              <div className="bubble-state-options" role="listbox" aria-label="State">
                {[{ value: '', label: 'Default' }, ...presetNames.map((name) => ({ value: name, label: name }))].map(({ value, label }) => (
                  <button
                    key={value || 'default'}
                    type="button"
                    className={`bubble-state-option${activePreset === value ? ' is-active' : ''}`}
                    role="option"
                    aria-selected={activePreset === value}
                    onClick={() => {
                      setActivePreset(value);
                      setStateMenuOpen(false);
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            className="bubble-file-input"
            accept="image/*,application/pdf"
            multiple
            onChange={handleFileSelect}
            aria-label="Attach file"
          />
          <button
            type="button"
            className="bubble-attach"
            onClick={() => fileInputRef.current?.click()}
            aria-label="Attach file"
            title="Attach image or PDF"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
            </svg>
          </button>

          {speechSupported && micEnabled ? (
            <button
              type="button"
              className={`bubble-mic${listening || transcribing ? ' is-listening' : ''}`}
              onClick={handleMicClick}
              disabled={transcribing}
              aria-label={
                transcribing ? 'Transcribing' : listening ? 'Stop dictation' : 'Start dictation'
              }
              title={
                transcribing
                  ? 'Transcribing…'
                  : listening
                    ? 'Stop and transcribe'
                    : 'Click to speak, click again to transcribe'
              }
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            </button>
          ) : null}

          {attachedFiles.length > 0 && (
            <span className="bubble-attach-badge">+{attachedFiles.length}</span>
          )}

          <button
            type="submit"
            className="bubble-send"
            disabled={!message.trim() && attachedFiles.length === 0}
            aria-label="Send"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 19V5M5 12l7-7 7 7" />
            </svg>
          </button>
        </div>
          </div>
        </VoiceBeam>
        {speechNotice ? (
          <p className="bubble-speech-notice" role="status">
            {speechNotice}
          </p>
        ) : null}
      </form>
    </div>
  );
};

export default ChatBubbleView;
