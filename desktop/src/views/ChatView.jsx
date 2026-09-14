// View: Chat display UI
import { useState, useEffect, useRef, useCallback, memo, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { ConvexClient } from 'convex/browser';
import { api } from '../../../backend/convex/_generated/api';
import AppShell from '../components/AppShell';
import ProxyMark from '../components/ProxyMark';
import WindowControls from '../components/WindowControls';
import { convexUrl, convexSiteUrl } from '../lib/convexUrls';
import { userFacingError } from '../lib/userFacingError';
import { AI_RESPONSE_MODE, fetchAiReply } from '../lib/aiResponseMode';
import { normalizeAiMarkdown } from '../lib/aiMarkdown';
import {
  DEFAULT_MAX_CONTEXT_TOKENS,
  DEFAULT_MAX_OUTPUT_TOKENS,
  buildBudgetedMessages,
  clampOutputTokens,
  currentTurnToApiMessage,
  historyToApiMessages,
} from '../lib/contextBudget';
import 'katex/dist/katex.min.css';
import './ChatView.css';

// ——— Constants ———
const CONVEX_URL = convexUrl;
const CONVEX_SITE_BASE = convexSiteUrl;
const REMARK_PLUGINS = [remarkGfm, remarkMath];
const REHYPE_PLUGINS = [rehypeKatex];
const ACCOUNT_ACCESS_TTL_MS = 30_000;

const getConvexSiteBaseUrl = () => CONVEX_SITE_BASE;

const DEFAULT_SYSTEM_INSTRUCTION =
  'You are PROXY. Answer clearly and accurately. Keep replies as short as the question allows.'
// Model is chosen on the server (Convex `openrouter_model_name` env). Client does not send it.

const TONES = [
  { id: 'concise', label: 'Concise', instruction: 'Keep answers short. Lead with the direct answer.' },
  { id: 'professional', label: 'Professional', instruction: 'Use a formal, workplace tone.' },
  { id: 'precise', label: 'Precise', instruction: 'Prefer exact wording. Avoid vague claims.' },
];

const SUGGESTED_PROMPTS = [
  'Explain that with an analogy',
  'Give me the short version',
  'What should I do next?',
];

const applyTone = (systemInstruction, toneId) => {
  const tone = TONES.find((t) => t.id === toneId);
  if (!tone) return systemInstruction;
  return `${systemInstruction}\n\nTone: ${tone.instruction}`;
};

const formatTime = (timestamp) => {
  try {
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
};

const MessageRow = memo(function MessageRow({ msg, feedback, onCopy, onFeedback }) {
  const isAi = msg.sender === 'ai';
  const showMarkdown = isAi && !msg.isStreaming && Boolean(msg.text);
  const rendered = useMemo(
    () => (showMarkdown ? normalizeAiMarkdown(msg.text || '') : msg.text || ''),
    [showMarkdown, msg.text]
  );

  return (
    <div className={`message message-${msg.sender}`}>
      <div className="message-body">
        <div className="message-bubble">
          {msg.sender === 'user' && msg.presetName && (
            <span className="message-preset-indicator" title={`State: ${msg.presetName}`}>
              <span className="message-preset-indicator-label">{msg.presetName}</span>
            </span>
          )}
          {msg.images && msg.images.length > 0 && (
            <div className="message-images">
              {msg.images.map((img, idx) => (
                <div key={idx} className="message-image-container">
                  {msg.files && msg.files[idx]?.type === 'application/pdf' ? (
                    <div className="message-pdf-preview">
                      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                      </svg>
                      <span>{msg.files[idx]?.name || 'PDF'}</span>
                    </div>
                  ) : (
                    <img src={img} alt={`Attachment ${idx + 1}`} className="message-image" />
                  )}
                </div>
              ))}
            </div>
          )}
          {(msg.text || msg.isStreaming) && (
            <div className={`message-text${showMarkdown ? ' message-text-markdown' : ''}${msg.isStreaming ? ' message-text-streaming' : ''}`}>
              {showMarkdown ? (
                <ReactMarkdown
                  remarkPlugins={REMARK_PLUGINS}
                  rehypePlugins={REHYPE_PLUGINS}
                  components={{
                    a: ({ href, children, ...props }) => (
                      <a
                        href={href}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => {
                          if (href && window.electronAPI?.openExternal) {
                            e.preventDefault();
                            void window.electronAPI.openExternal(href);
                          }
                        }}
                        {...props}
                      >
                        {children}
                      </a>
                    ),
                  }}
                >
                  {rendered}
                </ReactMarkdown>
              ) : (
                msg.text
              )}
              {msg.isStreaming && <span className="streaming-cursor">▋</span>}
            </div>
          )}
        </div>
        {isAi && !msg.isStreaming && msg.text && (
          <div className="message-actions">
            <button type="button" className="message-action-btn" aria-label="Copy" onClick={() => onCopy(msg.text)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
                <rect x="9" y="9" width="13" height="13" rx="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            </button>
            <button
              type="button"
              className={`message-action-btn${feedback === 'up' ? ' is-active' : ''}`}
              aria-label="Helpful reply"
              onClick={() => onFeedback(msg.id, 'up')}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
                <path d="M7 10v12M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" />
              </svg>
            </button>
            <button
              type="button"
              className={`message-action-btn${feedback === 'down' ? ' is-active' : ''}`}
              aria-label="Unhelpful reply"
              onClick={() => onFeedback(msg.id, 'down')}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
                <path d="M17 14V2M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z" />
              </svg>
            </button>
          </div>
        )}
        <div className="message-time">{formatTime(msg.timestamp)}</div>
      </div>
    </div>
  );
});

const ChatView = () => {
  // State
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(null);
  const [authToken, setAuthToken] = useState(null);
  const [subscriptionRequired, setSubscriptionRequired] = useState(false);
  const [accountGateReason, setAccountGateReason] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('https://getproxy.ca');
  const [attachedFiles, setAttachedFiles] = useState([]);
  const [presets, setPresets] = useState({});
  const [activePreset, setActivePreset] = useState(null);
  const [typedStateOverrides, setTypedStateOverrides] = useState(true);
  const [activeTone, setActiveTone] = useState('precise');
  const [messageFeedback, setMessageFeedback] = useState({});

  const convex = useRef(new ConvexClient(CONVEX_URL));
  const conversationContext = useRef([]);
  const sessionOptionsRef = useRef(null);
  const messagesEndRef = useRef(null);
  const messagesScrollerRef = useRef(null);
  const fileInputRef = useRef(null);
  const pendingPromptRef = useRef(null);
  const bootstrappedAiRef = useRef(false);
  const getAIResponseRef = useRef(null);
  const isAuthenticatedRef = useRef(isAuthenticated);
  const accountCacheRef = useRef({ at: 0, result: null });
  const streamBufRef = useRef({ id: null, text: '', raf: 0 });
  const stickToBottomRef = useRef(true);

  useEffect(() => {
    sessionOptionsRef.current = null;
  }, [activePreset, activeTone]);

  useEffect(() => {
    let cancelled = false;
    window.electronAPI?.getTypedStateOverrides?.()
      .then((value) => {
        if (!cancelled) setTypedStateOverrides(value !== false);
      })
      .catch(() => {});
    const unsub = window.electronAPI?.onTypedStateOverridesChanged?.((value) => {
      setTypedStateOverrides(value !== false);
    });
    return () => {
      cancelled = true;
      if (typeof unsub === 'function') unsub();
    };
  }, []);

  useEffect(() => {
    isAuthenticatedRef.current = isAuthenticated;
  }, [isAuthenticated]);

  // ——— Effects ———
  useEffect(() => {
    if (typeof window !== 'undefined' && window.electronAPI?.readPresets) {
      window.electronAPI
        .readPresets()
        .then((result) => {
          if (result?.success && result.presets) setPresets(result.presets);
        })
        .catch((err) => console.error('Failed to load presets:', err));
    }
  }, []);

  // Prefer cloud states when signed in; migrate local → cloud on first login
  useEffect(() => {
    if (!isAuthenticated || !authToken) return undefined;
    let cancelled = false;
    (async () => {
      try {
        try {
          await convex.current.mutation(api.states.ensureMyLibrary, {});
        } catch (migrateErr) {
          console.warn('Library migrate skipped:', migrateErr);
        }
        const cloud = await convex.current.query(api.states.getMyStates, {});
        if (cancelled) return;
        if (cloud?.states && Object.keys(cloud.states).length > 0) {
          setPresets(cloud.states);
          await window.electronAPI?.writePresets?.(cloud.states, { broadcast: false });
          return;
        }
        const local = await window.electronAPI?.readPresets?.();
        if (cancelled) return;
        if (local?.success && local.presets && Object.keys(local.presets).length > 0) {
          const account = await convex.current.query(api.account.getMyAccount, {});
          const freeNames = new Set(
            (account?.freeStateNames?.length
              ? account.freeStateNames
              : ['Simplify', 'List', 'Critique']
            ).map((n) => n.toLowerCase()),
          );
          const allowAll = Boolean(account?.canCreateStates);
          const sanitized = {};
          for (const [name, raw] of Object.entries(local.presets)) {
            if (!allowAll && !freeNames.has(String(name).toLowerCase())) continue;
            if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
            const o = {};
            if (typeof raw.description === 'string') o.description = raw.description;
            else if (typeof raw.desc === 'string') o.description = raw.desc;
            if (typeof raw.systemInstruction === 'string') o.systemInstruction = raw.systemInstruction;
            else if (typeof raw.system_instruction === 'string') o.systemInstruction = raw.system_instruction;
            if (typeof raw.temperature === 'number') o.temperature = raw.temperature;
            if (typeof raw.maxTokens === 'number') o.maxTokens = raw.maxTokens;
            if (typeof raw.topP === 'number') o.topP = raw.topP;
            if (typeof raw.frequencyPenalty === 'number') o.frequencyPenalty = raw.frequencyPenalty;
            if (typeof raw.presencePenalty === 'number') o.presencePenalty = raw.presencePenalty;
            if (typeof raw.stop === 'string') o.stop = raw.stop;
            else if (Array.isArray(raw.stop) && raw.stop.every((s) => typeof s === 'string')) o.stop = raw.stop;
            o.visibility = 'private';
            sanitized[name] = o;
          }
          setPresets(Object.keys(sanitized).length > 0 ? sanitized : local.presets);
          if (Object.keys(sanitized).length > 0) {
            await convex.current.mutation(api.states.saveMyStates, { states: sanitized });
          }
        }
      } catch (err) {
        console.error('Failed to sync cloud states:', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, authToken]);

  useEffect(() => {
    const unsub = window.electronAPI?.onPresetsUpdated?.(() => {
      window.electronAPI
        ?.readPresets()
        .then((result) => {
          if (result?.success && result.presets) setPresets(result.presets);
        })
        .catch((err) => console.error('Failed to reload presets:', err));
    });
    return typeof unsub === 'function' ? unsub : undefined;
  }, []);

  // Presets: loaded on mount from JSON file via electronAPI.readPresets().
  // presetsOverride: use when presets were just loaded in getAIResponse to avoid race.
  const getOptionsForMessage = (message, presetsOverride) => {
    const presetsMap = presetsOverride ?? presets;
    const base = {
      systemInstruction: DEFAULT_SYSTEM_INSTRUCTION,
      temperature: 0.5,
      maxTokens: DEFAULT_MAX_OUTPUT_TOKENS,
      topP: 0.95,
      frequencyPenalty: 0.0,
      presencePenalty: 0.3,
      stop: undefined,
    };
    const noPreset = {
      options: { ...base, systemInstruction: applyTone(base.systemInstruction, activeTone) },
      presetMatched: false,
      presetName: undefined,
      presetDescription: undefined,
      stripLeadingStateWord: false,
    };

    const fromPresetKey = (key, stripLeadingStateWord) => {
      const p = presetsMap[key];
      if (!p) return noPreset;
      const systemInstructionRaw = p.systemInstruction ?? p.system_instruction;
      const systemInstruction =
        systemInstructionRaw != null && String(systemInstructionRaw).trim() !== ''
          ? String(systemInstructionRaw).trim()
          : DEFAULT_SYSTEM_INSTRUCTION;
      const descRaw = p.description ?? p.desc;
      const presetDescription =
        descRaw != null && String(descRaw).trim() !== '' ? String(descRaw).trim() : '';
      return {
        options: {
          ...base,
          systemInstruction: applyTone(systemInstruction, activeTone),
          temperature: p.temperature != null ? p.temperature : 0.7,
          maxTokens: clampOutputTokens(p.maxTokens != null ? p.maxTokens : DEFAULT_MAX_OUTPUT_TOKENS),
          topP: p.topP != null ? p.topP : 0.95,
          frequencyPenalty: p.frequencyPenalty != null ? p.frequencyPenalty : 0.0,
          presencePenalty: p.presencePenalty != null ? p.presencePenalty : 0.3,
          stop: p.stop != null ? p.stop : undefined,
        },
        presetMatched: true,
        presetName: key,
        presetDescription,
        stripLeadingStateWord,
      };
    };

    const rawFirst = (message || '').trim().split(/\s+/)[0] || '';
    const firstWord = rawFirst.replace(/\W/g, '');
    const typedKey =
      firstWord && presetsMap && Object.keys(presetsMap).length > 0
        ? Object.keys(presetsMap).find((k) => k.toLowerCase() === firstWord.toLowerCase())
        : undefined;
    const dropdownKey = activePreset && presetsMap[activePreset] ? activePreset : null;

    // Typed state word wins when enabled (default), otherwise dropdown wins if set.
    if (typedStateOverrides) {
      if (typedKey) return fromPresetKey(typedKey, true);
      if (dropdownKey) return fromPresetKey(dropdownKey, false);
      return noPreset;
    }

    if (dropdownKey) {
      const strip = Boolean(typedKey && typedKey.toLowerCase() === dropdownKey.toLowerCase());
      return fromPresetKey(dropdownKey, strip);
    }
    if (typedKey) return fromPresetKey(typedKey, true);
    return noPreset;
  };

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const token = await window.electronAPI.getAuthToken();
        if (token) {
          setAuthToken(token);
          convex.current.setAuth(async () => token);
          setIsAuthenticated(true);
        } else {
          setIsAuthenticated(false);
        }
      } catch (error) {
        console.error('Error checking auth:', error);
        setIsAuthenticated(false);
      }
    };

    checkAuth();

    const unsubSuccess = window.electronAPI.onAuthSuccess?.((data) => {
      if (data.token) {
        setAuthToken(data.token);
        convex.current.setAuth(async () => data.token);
        setIsAuthenticated(true);
      } else {
        setAuthToken(null);
        convex.current.clearAuth();
        setIsAuthenticated(false);
      }
    });
    const unsubError = window.electronAPI.onAuthError?.((data) => {
      console.error('Auth error:', data.message);
      setIsAuthenticated(false);
    });
    const unsubLogout = window.electronAPI.onAuthLogout?.(() => {
      setAuthToken(null);
      try {
        convex.current.clearAuth();
      } catch (_) {
        convex.current.setAuth(async () => null);
      }
      setIsAuthenticated(false);
    });
    return () => {
      unsubSuccess?.();
      unsubError?.();
      unsubLogout?.();
    };
  }, []);

  const refreshAndRetry = async () => {
    try {
      const result = await window.electronAPI.refreshAuthToken();
      if (result.success && result.token) {
        setAuthToken(result.token);
        convex.current.setAuth(async () => result.token);
        return true;
      }
    } catch (err) {
      console.error('Failed to refresh token:', err);
    }
    // Keep chat UI mounted, show an inline error instead of jumping to the login screen
    return false;
  };

  const openWebsiteBilling = async () => {
    const url = `${websiteUrl.replace(/\/$/, '')}/account/billing`;
    if (window.electronAPI?.openExternal) {
      await window.electronAPI.openExternal(url);
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  const checkAccountAccess = async ({ force = false } = {}) => {
    const now = Date.now();
    if (
      !force &&
      accountCacheRef.current.result?.ok &&
      now - accountCacheRef.current.at < ACCOUNT_ACCESS_TTL_MS
    ) {
      return accountCacheRef.current.result;
    }

    let account;
    try {
      // Repair webhook users that never got a usage row / signup claim.
      try {
        await convex.current.mutation(api.signupRateLimit.ensureMyFreeUsage, {});
      } catch (repairErr) {
        console.warn('[signup] ensureMyFreeUsage:', repairErr);
      }
      try {
        const token = await window.electronAPI?.getAuthToken?.();
        if (token) {
          await fetch(`${getConvexSiteBaseUrl()}/auth/claim-signup`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          });
        }
      } catch (claimErr) {
        console.warn('[signup] claim-signup:', claimErr);
      }

      account = await convex.current.query(api.account.getMyAccount, {});
    } catch (error) {
      const msg = error?.message || String(error);
      if (msg.includes('Could not find public function')) {
        throw new Error(
          `Account API missing on ${CONVEX_URL}. From the backend folder, run npx convex dev, or set VITE_CONVEX_URL to your deployment.`,
        );
      }
      if (/auth|unauthor|login|token/i.test(msg)) {
        throw new Error(
          'Session expired. Click Sign in, finish login in the browser until it says Signed in, then try again.',
        );
      }
      throw error;
    }
    if (!account) {
      return {
        ok: false,
        reason:
          'Couldn’t load account. Sign in again and wait until the browser shows Signed in.',
        websiteUrl: 'https://getproxy.ca',
      };
    }
    setWebsiteUrl(account.websiteUrl || 'https://getproxy.ca');
    if (!account.canUseAI) {
      const signupBlocked = account.blockReason === 'signup_rate_limited';
      return {
        ok: false,
        reason: signupBlocked
          ? 'Too many free accounts were created from this network today. Try again tomorrow or subscribe.'
          : account.subscriptionActive
            ? 'Monthly usage limit reached'
            : 'Free token limit reached. Subscribe to PROXY for more.',
        websiteUrl: account.websiteUrl,
      };
    }
    const result = { ok: true, account };
    accountCacheRef.current = { at: now, result };
    return result;
  };

  const fileToBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const pdfToImage = async (file) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 800;
    canvas.height = 1000;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // PDF attachments are sent as a labeled image stand-in (no pdf.js text extract yet).
    ctx.fillStyle = '#666666';
    ctx.font = '48px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('PDF', canvas.width / 2, canvas.height / 2 - 50);
    
    ctx.font = '24px Arial';
    ctx.fillText(file.name, canvas.width / 2, canvas.height / 2 + 20);
    
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    
    return {
      file,
      dataUrl,
      type: 'image/jpeg',
      name: file.name.replace('.pdf', '.jpg'),
      isPDF: true // Flag to indicate this was a PDF
    };
  };

  const buildContextMessages = (message, files, systemInstruction) => {
    const historyMessages = historyToApiMessages(conversationContext.current);
    const currentMessage = currentTurnToApiMessage(message, files);
    const { messages, meta } = buildBudgetedMessages({
      historyMessages,
      currentMessage,
      systemInstruction: systemInstruction ?? DEFAULT_SYSTEM_INSTRUCTION,
      maxContextTokens: DEFAULT_MAX_CONTEXT_TOKENS,
    });
    if (meta.historyDropped > 0) {
      console.log(
        `[context] Kept ${meta.historyKept} prior turns, dropped ${meta.historyDropped} (budget ${meta.maxContextTokens})`,
      );
    }
    return messages;
  };

  const askOpenRouterStream = async (message, files, options, onChunk, isRetry = false) => {
    const systemInstruction = options.systemInstruction ?? DEFAULT_SYSTEM_INSTRUCTION;
    const contextMessages = buildContextMessages(message, files, systemInstruction);
    const maxTokens = clampOutputTokens(options.maxTokens);

    try {
      if (!authToken) throw new Error('Not signed in. Sign in, then send your message again.');

      const streamUrl = `${getConvexSiteBaseUrl()}/openrouter/stream`;
      const response = await fetch(streamUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          messages: contextMessages,
          systemInstruction,
          temperature: options.temperature,
          maxTokens,
          topP: options.topP,
          frequencyPenalty: options.frequencyPenalty,
          presencePenalty: options.presencePenalty,
          stop: options.stop,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error || `HTTP error: ${response.status}`;
        
        if (!isRetry && (response.status === 401 || errorMessage.includes('Authentication'))) {
          const refreshed = await refreshAndRetry();
          if (refreshed) {
            return askOpenRouterStream(message, files, options, onChunk, true);
          }
          throw new Error('Session expired. Click Sign in, finish login in the browser, then send your message again.');
        }

        if (response.status === 402 || response.status === 429) {
          setAccountGateReason(
            errorData.code === 'usage_limit_reached'
              ? 'Free or monthly usage limit reached'
              : errorData.code === 'signup_rate_limited'
                ? (errorData.error || 'Too many free accounts from this network today')
                : 'Active PROXY plan required'
          );
          setSubscriptionRequired(true);
          if (errorData.websiteUrl) setWebsiteUrl(errorData.websiteUrl);
        }
        
        throw new Error(errorMessage);
      }

      if (!response.body) {
        throw new Error('Streaming is unavailable right now. Try again in a moment.');
      }
      
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';
      let messageId = '';
      let finishReason = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          if (buffer.trim()) {
            const lines = buffer.split('\n');
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6).trim();
                if (data === '[DONE]') {
                  break;
                }
                if (data) {
                  try {
                    const parsed = JSON.parse(data);
                    const delta = parsed.choices?.[0]?.delta;
                    
                    if (delta?.content) {
                      fullContent += delta.content;
                      onChunk(delta.content);
                    }
                    
                    // Some upstream payloads put content on message instead of delta.
                    const message = parsed.choices?.[0]?.message;
                    if (message?.content) {
                      fullContent += message.content;
                      onChunk(message.content);
                    }

                    if (parsed.id) messageId = parsed.id;
                    if (parsed.choices?.[0]?.finish_reason) {
                      finishReason = parsed.choices[0].finish_reason;
                    }
                  } catch (e) {
                    try {
                      const errorData = JSON.parse(data);
                      if (errorData.error) {
                        throw new Error(errorData.error);
                      }
                    } catch (_e2) {}
                  }
                }
              }
            }
          }
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') {
              return {
                content: fullContent,
                id: messageId,
                finishReason: finishReason || 'stop',
              };
            }

            if (data) {
              try {
                const parsed = JSON.parse(data);
                const delta = parsed.choices?.[0]?.delta;
                
                if (delta?.content) {
                  fullContent += delta.content;
                  onChunk(delta.content);
                }
                
                // Some upstream payloads put content on message instead of delta.
                const message = parsed.choices?.[0]?.message;
                if (message?.content) {
                  fullContent += message.content;
                  onChunk(message.content);
                }

                if (parsed.id) messageId = parsed.id;
                if (parsed.choices?.[0]?.finish_reason) {
                  finishReason = parsed.choices[0].finish_reason;
                }
              } catch (e) {
                try {
                  const err = JSON.parse(data);
                  if (err.error) throw new Error(err.error);
                } catch (_e2) {}
              }
            }
          }
        }
      }

      return {
        content: fullContent,
        id: messageId,
        finishReason: finishReason || 'stop',
      };
    } catch (error) {
      console.error('Streaming fetch error:', error);
      // Provide more helpful error messages
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new Error('Couldn’t connect. Check your internet connection and try again.');
      }
      throw error;
    }
  };

  const askOpenRouterComplete = async (message, files, options, isRetry = false) => {
    const systemInstruction = options.systemInstruction ?? DEFAULT_SYSTEM_INSTRUCTION;
    const contextMessages = buildContextMessages(message, files, systemInstruction);
    const maxTokens = clampOutputTokens(options.maxTokens);
    if (!authToken) throw new Error('Not signed in. Sign in, then send your message again.');
    const url = `${getConvexSiteBaseUrl()}/openrouter/complete`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 90000); // 90s for slow free models
    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          messages: contextMessages,
          systemInstruction,
          temperature: options.temperature,
          maxTokens,
          topP: options.topP,
          frequencyPenalty: options.frequencyPenalty,
          presencePenalty: options.presencePenalty,
          stop: options.stop,
        }),
      });
    } catch (e) {
      clearTimeout(timeoutId);
      if (e?.name === 'AbortError') {
        throw new Error('Request timed out. Try a shorter question, or send it again.');
      }
      const msg = e?.message || String(e);
      if (msg === 'Failed to fetch' || msg.includes('fetch')) {
        throw new Error(
          `Couldn’t reach PROXY (${url}). Check your internet connection. If you’re developing locally, start Convex from the backend folder.`
        );
      }
      throw e;
    }
    clearTimeout(timeoutId);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      if (!isRetry && (res.status === 401 || (err.error && err.error.includes('Authentication')))) {
        const refreshed = await refreshAndRetry();
        if (refreshed) return askOpenRouterComplete(message, files, options, true);
        throw new Error('Session expired. Click Sign in, finish login in the browser, then send your message again.');
      }
      if (res.status === 402 || res.status === 429) {
        setAccountGateReason(
          err.code === 'usage_limit_reached'
            ? 'Free or monthly usage limit reached'
            : err.code === 'signup_rate_limited'
              ? (err.error || 'Too many free accounts from this network today')
              : 'Active PROXY plan required'
        );
        setSubscriptionRequired(true);
        return { content: '', blocked: true };
      }
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    const data = await res.json();
    if (data.model) {
      console.log('[PROXY] OpenRouter model:', data.model, 'source:', data.modelSource);
    }
    return { content: data.content ?? '', model: data.model, modelSource: data.modelSource };
  };

  const getAIResponse = async (userMessage, files = []) => {
    try {
      const access = await checkAccountAccess();
      if (!access.ok) {
        setAccountGateReason(access.reason || 'Active PROXY plan required');
        setSubscriptionRequired(true);
        if (access.websiteUrl) setWebsiteUrl(access.websiteUrl);
        return;
      }
    } catch (error) {
      console.error('Error checking account:', error);
      setAccountGateReason(userFacingError(error, 'Couldn’t verify your plan. Sign in and try again.'));
      setSubscriptionRequired(true);
      return;
    }

    setIsLoading(true);

    const aiMessageId = Date.now() + 1;
    const aiMessage = {
      id: aiMessageId,
      text: '',
      sender: 'ai',
      timestamp: new Date(),
      isStreaming: true
    };

    setMessages(prev => [...prev, aiMessage]);

    try {
      let messageToSend = userMessage;
      // Resolve state per turn so typed trigger words aren't stuck on the previous dropdown value.
      let presetsToUse = presets;
      if (Object.keys(presetsToUse).length === 0 && window.electronAPI?.readPresets) {
        const result = await window.electronAPI.readPresets();
        if (result?.success && result.presets && Object.keys(result.presets).length > 0) {
          presetsToUse = result.presets;
          setPresets(result.presets);
        }
      }
      const result = getOptionsForMessage(userMessage, presetsToUse);
      if (result.stripLeadingStateWord) {
        const trimmedMessage = (userMessage || '').trim();
        const words = trimmedMessage.split(/\s+/);
        messageToSend = words.slice(1).join(' ').trim();
      }
      if (result.presetMatched && result.presetName) {
        if (result.presetName !== activePreset) {
          setActivePreset(result.presetName);
        }
        setMessages((prev) => {
          if (prev.length < 2) return prev;
          const aiIdx = prev.length - 1;
          const userIdx = prev.length - 2;
          if (prev[aiIdx]?.id !== aiMessageId || prev[userIdx]?.sender !== 'user') return prev;
          const next = [...prev];
          next[userIdx] = {
            ...next[userIdx],
            presetName: result.presetName,
            presetDescription: result.presetDescription ?? '',
          };
          return next;
        });
      }
      sessionOptionsRef.current = { options: result.options };
      const options = result.options;

      setMessages(prev => prev.map(msg =>
        msg.id === aiMessageId ? { ...msg, text: '' } : msg
      ));

      let contentToUse = '';
      let requestError = null;
      let blocked = false;

      const streamBuf = streamBufRef.current;
      streamBuf.id = aiMessageId;
      streamBuf.text = '';
      if (streamBuf.raf) {
        cancelAnimationFrame(streamBuf.raf);
        streamBuf.raf = 0;
      }

      const flushStreamText = () => {
        streamBuf.raf = 0;
        const snapshot = streamBuf.text;
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === aiMessageId ? { ...msg, text: snapshot, isStreaming: true } : msg
          )
        );
      };

      const appendChunk = (chunk) => {
        streamBuf.text += chunk;
        if (streamBuf.raf) return;
        streamBuf.raf = requestAnimationFrame(flushStreamText);
      };

      const runComplete = async () => {
        const complete = await askOpenRouterComplete(messageToSend, files, options);
        return complete;
      };

      try {
        // Flip AI_RESPONSE_MODE in ../lib/aiResponseMode.js ('stream' | 'complete')
        const result = await fetchAiReply({
          mode: AI_RESPONSE_MODE,
          stream: async (onChunk) => {
            const streamed = await askOpenRouterStream(
              messageToSend,
              files,
              options,
              onChunk
            );
            return streamed?.content ?? '';
          },
          complete: runComplete,
          onChunk: AI_RESPONSE_MODE === 'stream' ? appendChunk : undefined,
        });

        blocked = Boolean(result.blocked);
        contentToUse = (result.content || '').trim();

        if (streamBuf.raf) {
          cancelAnimationFrame(streamBuf.raf);
          streamBuf.raf = 0;
        }
        if (result.usedStream && streamBuf.text && !contentToUse) {
          contentToUse = streamBuf.text.trim();
        }

        // Paint full text when not live-streaming (complete mode or stream fallback)
        if (!blocked && contentToUse && !result.usedStream) {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === aiMessageId ? { ...msg, text: contentToUse } : msg
            )
          );
        }

        if (!blocked && !contentToUse) {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === aiMessageId ? { ...msg, text: 'Retrying…' } : msg
            )
          );
          await new Promise((r) => setTimeout(r, 2000));
          const retry = await fetchAiReply({
            mode: AI_RESPONSE_MODE,
            stream: async (onChunk) => {
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === aiMessageId ? { ...msg, text: '' } : msg
                )
              );
              const streamed = await askOpenRouterStream(
                messageToSend,
                files,
                options,
                onChunk
              );
              return streamed?.content ?? '';
            },
            complete: runComplete,
            onChunk: AI_RESPONSE_MODE === 'stream' ? appendChunk : undefined,
          });
          blocked = Boolean(retry.blocked);
          contentToUse = (retry.content || '').trim();
          if (!blocked && contentToUse && !retry.usedStream) {
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === aiMessageId ? { ...msg, text: contentToUse } : msg
              )
            );
          }
        }
      } catch (e) {
        requestError = e;
        console.error('AI request failed:', e);
      }

      if (blocked) {
        setMessages((prev) => prev.filter((msg) => msg.id !== aiMessageId));
        return;
      }

      if (!contentToUse) {
        const errText = requestError instanceof Error ? requestError.message : (requestError ? String(requestError) : '');
        const errorMessage = {
          id: Date.now() + 1,
          text: errText
            ? `Error: ${errText}`
            : 'Error: PROXY returned no text. Wait a minute and try again, or ask a shorter question.',
          sender: 'ai',
          timestamp: new Date()
        };
        setMessages(prev => [...prev.filter(msg => msg.id !== aiMessageId), errorMessage]);
      } else {
        setMessages(prev => prev.map(msg =>
          msg.id === aiMessageId
            ? { ...msg, text: contentToUse, isStreaming: false }
            : msg
        ));
        
        conversationContext.current = [
          ...conversationContext.current,
          { 
            text: messageToSend, 
            sender: 'user',
            images: files.length > 0 ? files.map(f => f.dataUrl) : undefined
          },
          { text: contentToUse, sender: 'ai' }
        ];
      }
    } catch (error) {
      console.error('Error getting AI response:', error);
      // Remove the streaming message and add error message
      setMessages(prev => prev.filter(msg => msg.id !== aiMessageId));
      const errorMessage = {
        id: Date.now() + 1,
        text: `Error: ${userFacingError(error, 'Couldn’t get a reply. Try again.')}`,
        sender: 'ai',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };
  getAIResponseRef.current = getAIResponse;

  const startConversationFromPrompt = useCallback((initial) => {
    const text =
      typeof initial === 'string'
        ? String(initial || '').trim()
        : String(initial?.message || initial?.text || '').trim();
    const imagePayloads = Array.isArray(initial?.images)
      ? initial.images.filter((img) => img?.dataUrl)
      : [];
    if (!text && imagePayloads.length === 0) return;

    const files = imagePayloads.map((img) => ({
      dataUrl: img.dataUrl,
      type: img.type || 'image/png',
      name: img.name || 'attachment.png',
    }));

    pendingPromptRef.current = { text, files };
    bootstrappedAiRef.current = false;
    sessionOptionsRef.current = null;
    setIsLoading(false);
    setSubscriptionRequired(false);
    setAccountGateReason('');
    setAttachedFiles([]);
    setMessages([
      {
        id: Date.now(),
        text: text || (files.length > 0 ? 'Attached files' : ''),
        sender: 'user',
        timestamp: new Date(),
        images: files.map((f) => f.dataUrl),
        files,
      },
    ]);
    conversationContext.current = [
      {
        text,
        sender: 'user',
        images: files.length > 0 ? files.map((f) => f.dataUrl) : undefined,
      },
    ];
    stickToBottomRef.current = true;

    if (isAuthenticatedRef.current === true && getAIResponseRef.current) {
      bootstrappedAiRef.current = true;
      pendingPromptRef.current = null;
      void getAIResponseRef.current(text, files);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const boot = async () => {
      try {
        const pending = await window.electronAPI?.getPendingChatStart?.();
        if (cancelled) return;
        if (pending && (pending.message || pending.images?.length)) {
          startConversationFromPrompt(pending);
          return;
        }
      } catch (err) {
        console.error('getPendingChatStart failed:', err);
      }
      // Legacy fallback: initial message embedded in the URL
      const urlParams = new URLSearchParams(window.location.search);
      const encodedData = urlParams.get('data');
      if (!encodedData) return;
      try {
        const data = JSON.parse(decodeURIComponent(encodedData));
        if (data.message || data.images?.length) startConversationFromPrompt(data);
      } catch (error) {
        console.error('Error parsing message data:', error);
      }
    };
    void boot();
    return () => {
      cancelled = true;
    };
  }, [startConversationFromPrompt]);

  useEffect(() => {
    return window.electronAPI?.onChatStart?.((payload) => {
      startConversationFromPrompt(payload);
    });
  }, [startConversationFromPrompt]);

  // Trigger AI once when auth becomes available for a pending bootstrap prompt
  useEffect(() => {
    if (isAuthenticated !== true) return;
    if (bootstrappedAiRef.current) return;
    const pending = pendingPromptRef.current;
    if (!pending || isLoading) return;
    bootstrappedAiRef.current = true;
    pendingPromptRef.current = null;
    const text = typeof pending === 'string' ? pending : pending.text || '';
    const files = typeof pending === 'string' ? [] : pending.files || [];
    void getAIResponseRef.current?.(text, files);
  }, [isAuthenticated, isLoading]);

  useEffect(() => {
    const scroller = messagesScrollerRef.current;
    if (!scroller || !stickToBottomRef.current) return;
    scroller.scrollTop = scroller.scrollHeight;
  }, [messages]);

  useEffect(() => {
    const scroller = messagesScrollerRef.current;
    if (!scroller) return undefined;
    const onScroll = () => {
      const distance = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
      stickToBottomRef.current = distance < 80;
    };
    scroller.addEventListener('scroll', onScroll, { passive: true });
    return () => scroller.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const handlePaste = async (e) => {
      const items = Array.from(e.clipboardData?.items ?? []).filter((item) =>
        item.type.startsWith('image/'),
      );
      if (items.length === 0) return;
      e.preventDefault();
      for (const item of items) {
        const file = item.getAsFile();
        if (!file) continue;
        try {
          const dataUrl = await fileToBase64(file);
          setAttachedFiles((prev) => [
            ...prev,
            {
              file,
              dataUrl,
              type: file.type,
              name: `pasted-${Date.now()}.${file.type.split('/')[1] || 'png'}`,
            },
          ]);
        } catch (err) {
          console.error('Error pasting image:', err);
        }
      }
    };
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, []);

  const handleClose = () => window.electronAPI?.closeMessageWindow?.();
  const handleLogin = () => window.electronAPI?.openLogin?.();
  const handleLogout = async () => {
    try {
      await window.electronAPI?.logout?.();
      setAuthToken(null);
      accountCacheRef.current = { at: 0, result: null };
      try {
        convex.current.clearAuth();
      } catch (_) {
        convex.current.setAuth(async () => null);
      }
      setIsAuthenticated(false);
    } catch (err) {
      console.error('Logout failed:', err);
    }
  };

  const copyMessage = useCallback(async (text) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      console.error('Copy failed:', err);
    }
  }, []);

  const setFeedback = useCallback((id, value) => {
    setMessageFeedback((prev) => ({ ...prev, [id]: prev[id] === value ? null : value }));
  }, []);

  const presetNames = Object.keys(presets).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  const displayState = activePreset || 'Default';
  const lastMessage = messages[messages.length - 1];
  const showSuggestions = lastMessage?.sender === 'ai' && !lastMessage?.isStreaming && !isLoading;

  const renderAuthShell = (content) => (
    <AppShell active="chat">
      <div className="chat-panel">
        <header className="chat-header">
          <div className="chat-header-left">
            <span className="chat-header-label">PROXY</span>
          </div>
          <WindowControls onClose={handleClose} />
        </header>
        {content}
      </div>
    </AppShell>
  );

  const handleFileSelect = async (e) => {
    const files = Array.from(e.target.files);
    const validFiles = files.filter(file => {
      const isImage = file.type.startsWith('image/');
      const isPDF = file.type === 'application/pdf';
      return isImage || isPDF;
    });

    if (validFiles.length === 0) {
      alert('Choose image or PDF files only.');
      return;
    }

    const fileDataPromises = validFiles.map(async (file) => {
      if (file.type === 'application/pdf') {
        // PDF → labeled image stand-in (no pdf.js text extract yet).
        try {
          return await pdfToImage(file);
        } catch (error) {
          console.error('Error processing PDF:', error);
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          canvas.width = 400;
          canvas.height = 500;
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.fillStyle = '#666666';
          ctx.font = '24px Arial';
          ctx.textAlign = 'center';
          ctx.fillText('PDF: ' + file.name, canvas.width / 2, canvas.height / 2);
          const dataUrl = canvas.toDataURL('image/jpeg');
          return {
            file,
            dataUrl,
            type: 'image/jpeg',
            name: file.name.replace('.pdf', '.jpg'),
            isPDF: true
          };
        }
      } else {
        const dataUrl = await fileToBase64(file);
        return {
          file,
          dataUrl,
          type: file.type,
          name: file.name
        };
      }
    });

    const fileData = await Promise.all(fileDataPromises);
    setAttachedFiles(prev => [...prev, ...fileData]);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeFile = (index) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const messageText = inputValue.trim();
    
    if ((!messageText && attachedFiles.length === 0) || isLoading) return;

    const filesToSend = [...attachedFiles];

    setInputValue('');
    setAttachedFiles([]);

    const userMessage = {
      id: Date.now(),
      text: messageText || (filesToSend.length > 0 ? 'Attached files' : ''),
      sender: 'user',
      timestamp: new Date(),
      images: filesToSend.map(f => f.dataUrl),
      files: filesToSend
    };
    
    setMessages(prev => [...prev, userMessage]);
    
    // Update conversation context
    conversationContext.current = [
      ...conversationContext.current,
      { 
        text: messageText || '', 
        sender: 'user',
        images: filesToSend.length > 0 ? filesToSend.map(f => f.dataUrl) : undefined
      }
    ];
    
    // Get AI response
    await getAIResponse(messageText || '', filesToSend);
  };

  if (isAuthenticated === false) {
    return renderAuthShell(
      <div className="chat-auth-container">
        <div className="chat-auth-content">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="7" r="4"></circle>
            <path d="M5.5 21a8.38 8.38 0 0 1 13 0"></path>
          </svg>
          <h2>Sign in to chat</h2>
          <p>Sign in with your PROXY account to send messages and sync states.</p>
          <button type="button" className="btn-primary" onClick={handleLogin}>
            Sign in
          </button>
        </div>
      </div>
    );
  }

  if (subscriptionRequired) {
    return renderAuthShell(
      <div className="chat-auth-container">
        <div className="chat-auth-content">
          <h2>{accountGateReason || 'Free token limit reached'}</h2>
          <p>
            Free accounts include 30,000 weighted tokens (lifetime) and three states: Simplify, List,
            and Critique. Subscribe on the website for more tokens and custom states.
          </p>

          {(accountGateReason || '').toLowerCase().includes('sign in') ||
          (accountGateReason || '').toLowerCase().includes('signed in') ||
          (accountGateReason || '').toLowerCase().includes('session') ? (
            <button type="button" className="btn-primary" onClick={handleLogin}>
              Sign in
            </button>
          ) : null}

          <button type="button" className="btn-primary" onClick={openWebsiteBilling}>
            Open billing on the website
          </button>

          <button
            type="button"
            className="btn-success"
            onClick={async () => {
              try {
                await convex.current.action(api.account.syncMySubscription, {});
              } catch (err) {
                console.error('syncMySubscription failed:', err);
              }
              setSubscriptionRequired(false);
              setAccountGateReason('');
              await getAIResponse(messages[0]?.text || '');
            }}
            style={{ marginTop: 16 }}
          >
            I already have a plan (retry)
          </button>
        </div>
      </div>
    );
  }

  if (isAuthenticated === null) {
    return (
      <AppShell active="chat">
        <div className="chat-panel chat-skeleton" aria-busy="true" aria-label="Loading chat">
          <header className="chat-header">
            <div className="chat-header-left">
              <div className="chat-skel chat-skel-label" />
              <div className="chat-skel chat-skel-select" />
            </div>
            <div className="chat-header-actions">
              <div className="chat-skel chat-skel-btn" />
              <div className="chat-skel chat-skel-icon" />
              <WindowControls onClose={handleClose} />
            </div>
          </header>

          <div className="chat-messages chat-skel-messages">
            <div className="chat-skel-row chat-skel-row-user">
              <div className="chat-skel chat-skel-bubble chat-skel-bubble-user" />
            </div>
            <div className="chat-skel-row chat-skel-row-ai">
              <div className="chat-skel chat-skel-bubble chat-skel-bubble-ai" />
              <div className="chat-skel chat-skel-bubble chat-skel-bubble-ai-short" />
            </div>
            <div className="chat-skel-row chat-skel-row-user">
              <div className="chat-skel chat-skel-bubble chat-skel-bubble-user-mid" />
            </div>
            <div className="chat-skel-row chat-skel-row-ai">
              <div className="chat-skel chat-skel-bubble chat-skel-bubble-ai-long" />
            </div>
          </div>

          <div className="chat-input-container chat-skel-composer" aria-hidden="true">
            <div className="chat-skel chat-skel-input" />
            <div className="chat-skel chat-skel-send" />
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell active="chat">
      <div className="chat-panel">
        <header className="chat-header">
          <div className="chat-header-left">
            <label className="chat-state-select-wrap">
              <span className="chat-header-label">State</span>
              <select
                className="chat-state-select select-field"
                value={activePreset || ''}
                onChange={(e) => setActivePreset(e.target.value || null)}
                aria-label="Active state"
              >
                <option value="">Default</option>
                {presetNames.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="chat-header-actions">
            <button
              type="button"
              className="btn-ghost btn-danger btn-sm"
              onClick={() => void handleLogout()}
              title="Sign out of PROXY"
            >
              Sign out
            </button>
            <button
              type="button"
              className="chat-header-icon-btn"
              aria-label="Open settings"
              title="Settings"
              onClick={() => window.electronAPI?.openSettingsWindow?.()}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
                <circle cx="12" cy="5" r="1" fill="currentColor" stroke="none" />
                <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
                <circle cx="12" cy="19" r="1" fill="currentColor" stroke="none" />
              </svg>
            </button>
            <WindowControls onClose={handleClose} />
          </div>
        </header>

        <div className="chat-messages" ref={messagesScrollerRef}>
          {messages.length === 0 ? (
            <div className="chat-empty">
              <ProxyMark size={32} />
              <p>Type a message to start chatting in PROXY</p>
            </div>
          ) : (
            messages.map((msg) => (
              <MessageRow
                key={msg.id}
                msg={msg}
                feedback={messageFeedback[msg.id]}
                onCopy={copyMessage}
                onFeedback={setFeedback}
              />
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {showSuggestions && (
          <div className="chat-suggestions" role="group" aria-label="Suggested follow-ups">
            {SUGGESTED_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                className="chat-suggestion-chip"
                onClick={() => setInputValue(prompt)}
              >
                {prompt}
              </button>
            ))}
          </div>
        )}

        <form className="chat-input-container" onSubmit={handleSubmit}>
          {attachedFiles.length > 0 && (
            <div className="chat-attachments" aria-label="Attachments">
              {attachedFiles.map((fileData, idx) => (
                <div key={`${fileData.name}-${idx}`} className="chat-attachment-item">
                  {fileData.type.startsWith('image/') ? (
                    <img src={fileData.dataUrl} alt={fileData.name} className="attachment-preview" />
                  ) : (
                    <div className="attachment-pdf-icon" title={fileData.name}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                      </svg>
                    </div>
                  )}
                  <button
                    type="button"
                    className="attachment-remove"
                    onClick={() => removeFile(idx)}
                    aria-label={`Remove ${fileData.name}`}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="18" y1="6" x2="6" y2="18"></line>
                      <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="chat-input-row">
            <input
              type="file"
              ref={fileInputRef}
              className="chat-file-input"
              accept="image/*,application/pdf"
              multiple
              onChange={handleFileSelect}
              aria-label="Attach file"
            />
            <button
              type="button"
              className="chat-attach-button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading}
              aria-label="Attach file"
              title="Attach image or PDF"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
              </svg>
            </button>
            <input
              type="text"
              className="chat-input-field"
              placeholder="Message PROXY…"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              disabled={isLoading}
              autoFocus
            />
            <label className="chat-input-state">
              <span className="visually-hidden">State</span>
              <select
                className="chat-input-state-select select-field"
                value={activePreset || ''}
                onChange={(e) => setActivePreset(e.target.value || null)}
              >
                <option value="">{displayState}</option>
                {presetNames.filter((n) => n !== activePreset).map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className="chat-input-submit"
              disabled={(!inputValue.trim() && attachedFiles.length === 0) || isLoading}
              aria-label="Send message"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 19V5M5 12l7-7 7 7" />
              </svg>
            </button>
          </div>
        </form>
      </div>
    </AppShell>
  );
};

export default ChatView;
