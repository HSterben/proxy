import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import { ConvexClient } from 'convex/browser'
import { useAuth } from '../auth/AuthSessionProvider'
import { claimSignupQuota } from '../auth/claimSignup'
import { api } from '../convex/api'
import { convexSiteUrl, convexUrl } from '../lib/convexUrls'
import { userFacingError } from '../lib/userFacingError'
import { AI_RESPONSE_MODE, fetchAiReply } from '../lib/aiResponseMode'
import { normalizeAiMarkdown } from '../lib/aiMarkdown'
import BrandMark from '../components/ui/BrandMark'
import {
  DEFAULT_MAX_CONTEXT_TOKENS,
  DEFAULT_MAX_OUTPUT_TOKENS,
  buildBudgetedMessages,
  clampOutputTokens,
  currentTurnToApiMessage,
  historyToApiMessages,
} from '../lib/contextBudget'
import { ThinkingOrb } from 'thinking-orbs'
import { useSpeechToText } from '../hooks/useSpeechToText'
import {
  getStoredMicDeviceId,
  listMicrophones,
  requestMicrophoneAccess,
  setStoredMicDeviceId,
  type MicDevice,
} from '../lib/speechToText'
import { VoiceBeam, getAudioContext } from 'voice-glow'
import 'katex/dist/katex.min.css'
import './app/ChatView.css'

const REMARK_PLUGINS = [remarkGfm, remarkMath]
const REHYPE_PLUGINS = [rehypeKatex]

const SUGGESTED_PROMPTS = [
  'Explain that with an analogy',
  'Give me the short version',
  'What should I do next?',
]

const DEFAULT_SYSTEM_INSTRUCTION = `You are PROXY, a sharp everyday AI assistant.

Priorities:
- Lead with the answer. Put the useful result first, then brief supporting detail only if it helps.
- Match length to the ask: one sentence for simple questions, short bullets or steps for how-tos, deeper detail only when the user wants it.
- Be concrete. Prefer examples, numbers, and exact wording over vague advice.
- For ambiguous requests: make one clear assumption, state it briefly, and continue, or ask a single clarifying question if you truly cannot proceed.
- For writing: preserve the user's intent and voice; improve clarity without fluff.
- For code and technical help: give working steps or snippets; call out edge cases and failure points.
- Separate fact from guess. If unsure, say so briefly and say how to verify.
- Skip filler, apologies, and restating the question unless it adds clarity.`

const TONES = [
  { id: 'concise', label: 'Concise', instruction: 'Keep answers short. Lead with the direct answer.' },
  { id: 'professional', label: 'Professional', instruction: 'Use a formal, workplace tone.' },
  { id: 'precise', label: 'Precise', instruction: 'Prefer exact wording. Avoid vague claims.' },
] as const

type ToneId = (typeof TONES)[number]['id']

type ChatOptions = {
  systemInstruction: string
  temperature: number
  maxTokens: number
  topP: number
  frequencyPenalty: number
  presencePenalty: number
  stop: string | undefined
}

type AttachedFile = {
  file: File
  dataUrl: string
  type: string
  name: string
}

type ChatMessage = {
  id: number
  text: string
  sender: 'user' | 'ai'
  timestamp: Date
  images?: string[]
  isStreaming?: boolean
  presetName?: string | null
}

type StatePreset = {
  description?: string
  systemInstruction?: string
  temperature?: number
  maxTokens?: number
  topP?: number
  frequencyPenalty?: number
  presencePenalty?: number
  stop?: string | string[]
}

type LibraryItem = {
  id: string
  name: string
  description: string
  isOfficial: boolean
  isOwner: boolean
  isActive: boolean
  state: StatePreset
}


function applyTone(systemInstruction: string, toneId: ToneId) {
  const tone = TONES.find((t) => t.id === toneId)
  if (!tone) return systemInstruction
  return `${systemInstruction}\n\nTone: ${tone.instruction}`
}

function optionsFromPreset(
  presets: Record<string, StatePreset>,
  activePreset: string | null,
  message: string,
  toneId: ToneId,
): ChatOptions {
  const base: ChatOptions = {
    systemInstruction: applyTone(DEFAULT_SYSTEM_INSTRUCTION, toneId),
    temperature: 0.5,
    maxTokens: DEFAULT_MAX_OUTPUT_TOKENS,
    topP: 0.95,
    frequencyPenalty: 0.0,
    presencePenalty: 0.0,
    stop: undefined,
  }

  let key = activePreset
  if (!key) {
    const firstWord = message.trim().split(/\s+/)[0]
    if (firstWord) {
      key =
        Object.keys(presets).find((k) => k.toLowerCase() === firstWord.toLowerCase()) ?? null
    }
  }
  if (!key || !presets[key]) return base

  const p = presets[key]
  const sys = p.systemInstruction || DEFAULT_SYSTEM_INSTRUCTION
  return {
    systemInstruction: applyTone(sys, toneId),
    temperature: typeof p.temperature === 'number' ? p.temperature : base.temperature,
    maxTokens: clampOutputTokens(
      typeof p.maxTokens === 'number' && p.maxTokens > 0 ? p.maxTokens : base.maxTokens,
    ),
    topP: typeof p.topP === 'number' ? p.topP : base.topP,
    frequencyPenalty:
      typeof p.frequencyPenalty === 'number' ? p.frequencyPenalty : base.frequencyPenalty,
    presencePenalty:
      typeof p.presencePenalty === 'number' ? p.presencePenalty : base.presencePenalty,
    stop: Array.isArray(p.stop) ? p.stop[0] : typeof p.stop === 'string' ? p.stop : undefined,
  }
}

async function readSseStream(
  response: Response,
  onChunk: (chunk: string) => void,
): Promise<string> {
  if (!response.body) throw new Error('Response body is null - streaming not supported')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let fullContent = ''
  let buffer = ''

  const consumeLine = (line: string) => {
    if (!line.startsWith('data: ')) return false
    const data = line.slice(6).trim()
    if (data === '[DONE]') return true
    if (!data) return false
    try {
      const parsed = JSON.parse(data) as {
        error?: string
        choices?: { delta?: { content?: string }; message?: { content?: string } }[]
      }
      if (parsed.error) throw new Error(parsed.error)
      const delta = parsed.choices?.[0]?.delta?.content
      const message = parsed.choices?.[0]?.message?.content
      if (delta) {
        fullContent += delta
        onChunk(delta)
      } else if (message) {
        fullContent += message
        onChunk(message)
      }
    } catch (err) {
      if (err instanceof Error && err.message !== 'Unexpected end of JSON input') {
        if (err instanceof SyntaxError) return false
        throw err
      }
    }
    return false
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      if (buffer.trim()) {
        for (const line of buffer.split('\n')) consumeLine(line)
      }
      break
    }
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    for (const line of lines) {
      if (consumeLine(line)) {
        return fullContent
      }
    }
  }
  return fullContent
}

export default function AppChat() {
  const { user, isLoading: authLoading, signOut, getAccessToken, signIn, switchAccount } = useAuth()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const [subscriptionRequired, setSubscriptionRequired] = useState(false)
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [portalLoading, setPortalLoading] = useState(false)
  const [stripePlans, setStripePlans] = useState<{ monthly: string | null; yearly: string | null }>({
    monthly: null,
    yearly: null,
  })
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([])
  const activeTone: ToneId = 'precise'
  const [mainTab, setMainTab] = useState<'chat' | 'states'>('chat')
  const [menuOpen, setMenuOpen] = useState(false)
  const [messageFeedback, setMessageFeedback] = useState<Record<number, 'up' | 'down' | undefined>>({})
  const [presets, setPresets] = useState<Record<string, StatePreset>>({})
  const [library, setLibrary] = useState<LibraryItem[]>([])
  const [activeCount, setActiveCount] = useState(0)
  const [activeLimit, setActiveLimit] = useState<number | null>(3)
  const [stateTier, setStateTier] = useState<'free' | 'beta' | 'paid'>('free')
  const [activePreset, setActivePreset] = useState<string | null>(null)
  const [statesQuery, setStatesQuery] = useState('')
  const [statePickerOpen, setStatePickerOpen] = useState(false)
  const [slotNotice, setSlotNotice] = useState('')
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [micDeviceId, setMicDeviceId] = useState(() => getStoredMicDeviceId())
  const [microphones, setMicrophones] = useState<MicDevice[]>([])
  const [micMenuOpen, setMicMenuOpen] = useState(false)
  const [micBusy, setMicBusy] = useState(false)
  const [micNotice, setMicNotice] = useState('')

  const convex = useRef(new ConvexClient(convexUrl))
  const conversationContext = useRef<{ text: string; sender: string; images?: string[] }[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesScrollerRef = useRef<HTMLDivElement>(null)
  const stickToBottomRef = useRef(true)
  const ignoreScrollRef = useRef(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const wasLoadingRef = useRef(false)
  const micMenuRef = useRef<HTMLDivElement>(null)
  const inputValueRef = useRef('')
  const dictationPrefixRef = useRef<string | null>(null)

  useEffect(() => {
    inputValueRef.current = inputValue
  }, [inputValue])

  const applySpeechTranscript = useCallback((transcript: string) => {
    setMicNotice('')
    const prefix = String(dictationPrefixRef.current ?? '').trimEnd()
    setInputValue(prefix ? `${prefix} ${transcript}` : transcript)
  }, [])

  const { supported: speechSupported, listening, transcribing, stream: micStream, toggle: toggleSpeech } = useSpeechToText({
    deviceId: micDeviceId,
    enabled: !isLoading,
    getAuthToken: async () => (await getAccessToken()) || null,
    transcribeUrl: `${convexSiteUrl}/openrouter/transcribe`,
    onPartial: applySpeechTranscript,
    onResult: (transcript) => {
      applySpeechTranscript(transcript)
      dictationPrefixRef.current = null
    },
    onError: (msg) => {
      dictationPrefixRef.current = null
      setMicNotice(msg)
    },
  })

  const voiceTheme =
    typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'light'
      ? 'light'
      : 'dark'

  const handleMicClick = () => {
    try {
      getAudioContext()
    } catch {
      /* ignore */
    }
    toggleSpeech()
  }

  useEffect(() => {
    if (listening) {
      dictationPrefixRef.current = inputValueRef.current
      setMicNotice('')
    }
  }, [listening])

  const refreshMicrophones = useCallback(async ({ requestAccess = false, preferredId = micDeviceId } = {}) => {
    try {
      if (requestAccess) {
        await requestMicrophoneAccess(preferredId)
      }
      const list = await listMicrophones()
      setMicrophones(list)
      return list
    } catch (err) {
      setMicrophones([])
      throw err
    }
  }, [micDeviceId])

  useEffect(() => {
    if (!micMenuOpen) return
    void (async () => {
      setMicBusy(true)
      setMicNotice('')
      try {
        await refreshMicrophones({ requestAccess: true })
      } catch (err) {
        setMicNotice(
          userFacingError(err, 'Couldn’t access the microphone. Allow it when your browser asks.'),
        )
      } finally {
        setMicBusy(false)
      }
    })()
  }, [micMenuOpen, refreshMicrophones])

  useEffect(() => {
    if (!micMenuOpen) return undefined
    const onPointerDown = (event: MouseEvent) => {
      if (!micMenuRef.current?.contains(event.target as Node)) {
        setMicMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [micMenuOpen])

  const handleMicDeviceChange = async (next: string) => {
    setMicDeviceId(next)
    setStoredMicDeviceId(next)
    setMicBusy(true)
    setMicNotice('')
    try {
      await refreshMicrophones({ requestAccess: true, preferredId: next })
      setMicNotice(next ? 'Microphone updated.' : 'Using browser default microphone.')
    } catch (err) {
      setMicNotice(userFacingError(err, 'Couldn’t access that microphone.'))
    } finally {
      setMicBusy(false)
    }
  }

  const startNewChat = useCallback(() => {
    setMessages([])
    conversationContext.current = []
    setAttachedFiles([])
    setInputValue('')
    setIsLoading(false)
    setSubscriptionRequired(false)
    setMessageFeedback({})
    setMainTab('chat')
    setMenuOpen(false)
    setStatePickerOpen(false)
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [])

  const startSignIn = useCallback(() => {
    void signIn({ state: { returnTo: '/app' } })
  }, [signIn])

  const handleSwitchAccount = useCallback(() => {
    void switchAccount({ state: { returnTo: '/app' } })
  }, [switchAccount])

  const bearerHeaders = useCallback(async () => {
    const token = await getAccessToken()
    if (!token) throw new Error('Authentication token not available. Please log in.')
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    }
  }, [getAccessToken])

  useEffect(() => {
    if (!user) {
      convex.current.setAuth(async () => null)
      setPresets({})
      setLibrary([])
      setActiveCount(0)
      setActivePreset(null)
      return
    }
    convex.current.setAuth(async () => (await getAccessToken()) ?? null)
    let cancelled = false
    ;(async () => {
      try {
        try {
          await convex.current.mutation(api.states.ensureMyLibrary, {})
        } catch (migrateErr) {
          console.warn('Library migrate skipped:', migrateErr)
        }
        const cloud = await convex.current.query(api.states.getMyStates, {})
        if (cancelled) return
        setPresets((cloud?.states as Record<string, StatePreset>) || {})
        setLibrary(
          ((cloud?.library as LibraryItem[]) || []).map((item) => ({
            ...item,
            isActive: Boolean(item.isActive),
          })),
        )
        setActiveCount(Number(cloud?.activeCount ?? 0))
        setActiveLimit(
          cloud?.activeLimit === undefined || cloud?.activeLimit === null
            ? cloud?.tier === 'paid'
              ? null
              : 3
            : Number(cloud.activeLimit),
        )
        setStateTier(
          cloud?.tier === 'beta' || cloud?.tier === 'paid' ? cloud.tier : 'free',
        )
        setActivePreset(null)
      } catch (err) {
        console.error('Failed to load states:', err)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [user, getAccessToken])

  const fetchStripePlans = useCallback(async () => {
    try {
      const res = await fetch(`${convexSiteUrl}/stripe/plans`)
      const data = (await res.json().catch(() => ({}))) as { monthly?: string; yearly?: string }
      setStripePlans({ monthly: data.monthly || null, yearly: data.yearly || null })
    } catch (err) {
      console.error('Failed to fetch Stripe plans:', err)
    }
  }, [])

  useEffect(() => {
    if (user) fetchStripePlans()
  }, [user, fetchStripePlans])

  const hasChatAccess = useCallback(async () => {
    try {
      await convex.current.mutation(api.signupRateLimit.ensureMyFreeUsage, {})
    } catch (err) {
      console.warn('[signup] ensureMyFreeUsage:', err)
    }
    try {
      await claimSignupQuota(() => getAccessToken(), user?.id)
    } catch (err) {
      console.warn('[signup] claim:', err)
    }
    const account = await convex.current.query(api.account.getMyAccount, {})
    return {
      ok: Boolean(account?.canUseAI),
      blockReason: account?.blockReason ?? null,
      subscriptionActive: Boolean(account?.subscriptionActive),
      remaining: account?.remaining ?? 0,
      canCreateStates: Boolean(account?.canCreateStates),
      canPublishStates: Boolean(account?.canPublishStates),
      freeStateNames: account?.freeStateNames ?? [],
      activeStateLimit: account?.activeStateLimit ?? null,
      stateTier: account?.stateTier ?? 'free',
    }
  }, [getAccessToken, user?.id])

  const applyLibrarySnapshot = useCallback(
    (result: {
      states?: Record<string, StatePreset>
      library?: LibraryItem[]
      activeCount?: number
      activeLimit?: number | null
    }) => {
      setPresets(result.states || {})
      setLibrary(
        (result.library || []).map((item) => ({
          ...item,
          isActive: Boolean(item.isActive),
        })),
      )
      setActiveCount(Number(result.activeCount ?? 0))
      if (result.activeLimit !== undefined) {
        setActiveLimit(result.activeLimit)
      }
      setActivePreset((prev) => (prev && result.states?.[prev] ? prev : null))
    },
    [],
  )

  const toggleStateActive = useCallback(
    async (item: LibraryItem) => {
      setSlotNotice('')
      setTogglingId(item.id)
      try {
        const result = (await convex.current.mutation(api.states.setStateActive, {
          stateId: item.id as never,
          active: !item.isActive,
        })) as {
          states: Record<string, StatePreset>
          library: LibraryItem[]
          activeCount: number
          activeLimit: number | null
        }
        applyLibrarySnapshot(result)
      } catch (err) {
        setSlotNotice(userFacingError(err, 'Could not update State'))
      } finally {
        setTogglingId(null)
      }
    },
    [applyLibrarySnapshot],
  )

  const startCheckout = async (priceId: string | null) => {
    if (!priceId) return
    setCheckoutLoading(true)
    try {
      const res = await fetch(`${convexSiteUrl}/stripe/create-checkout-session-auth`, {
        method: 'POST',
        headers: await bearerHeaders(),
        body: JSON.stringify({ priceId, email: user?.email ?? undefined }),
      })
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string }
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      if (!data.url) throw new Error('No checkout URL returned.')
      window.location.href = data.url
    } catch (err) {
      alert(userFacingError(err, 'Failed to start checkout'))
    } finally {
      setCheckoutLoading(false)
    }
  }

  const openPortal = async () => {
    setPortalLoading(true)
    try {
      const res = await fetch(`${convexSiteUrl}/stripe/create-portal-session-auth`, {
        method: 'POST',
        headers: await bearerHeaders(),
        body: JSON.stringify({}),
      })
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string }
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      if (!data.url) throw new Error('No portal URL returned.')
      window.location.href = data.url
    } catch (err) {
      alert(userFacingError(err, 'Failed to open billing portal'))
    } finally {
      setPortalLoading(false)
    }
  }

  const buildContextMessages = (message: string, files: AttachedFile[], systemInstruction: string) => {
    const historyMessages = historyToApiMessages(conversationContext.current)
    const currentMessage = currentTurnToApiMessage(message, files)
    const { messages, meta } = buildBudgetedMessages({
      historyMessages,
      currentMessage,
      systemInstruction,
      maxContextTokens: DEFAULT_MAX_CONTEXT_TOKENS,
    })
    if (meta.historyDropped > 0) {
      console.log(
        `[context] Kept ${meta.historyKept} prior turns, dropped ${meta.historyDropped} (budget ${meta.maxContextTokens})`,
      )
    }
    return messages
  }

  const chatBody = (message: string, files: AttachedFile[], options: ChatOptions) => ({
    messages: buildContextMessages(
      message,
      files,
      options.systemInstruction || DEFAULT_SYSTEM_INSTRUCTION,
    ),
    systemInstruction: options.systemInstruction,
    temperature: options.temperature,
    maxTokens: clampOutputTokens(options.maxTokens),
    topP: options.topP,
    frequencyPenalty: options.frequencyPenalty,
    presencePenalty: options.presencePenalty,
    stop: options.stop,
  })

  const askOpenRouterStream = async (
    message: string,
    files: AttachedFile[],
    options: ChatOptions,
    onChunk: (chunk: string) => void,
  ) => {
    const response = await fetch(`${convexSiteUrl}/openrouter/stream`, {
      method: 'POST',
      headers: await bearerHeaders(),
      body: JSON.stringify(chatBody(message, files, options)),
    })
    if (!response.ok) {
      const errorData = (await response.json().catch(() => ({}))) as { error?: string }
      throw new Error(errorData.error || `HTTP error: ${response.status}`)
    }
    return readSseStream(response, onChunk)
  }

  const askOpenRouterComplete = async (message: string, files: AttachedFile[], options: ChatOptions) => {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 90000)
    let res: Response
    try {
      res = await fetch(`${convexSiteUrl}/openrouter/complete`, {
        method: 'POST',
        signal: controller.signal,
        headers: await bearerHeaders(),
        body: JSON.stringify(chatBody(message, files, options)),
      })
    } catch (e) {
      clearTimeout(timeoutId)
      if (e instanceof Error && e.name === 'AbortError') {
        throw new Error('Request timed out. Try a shorter question or try again.')
      }
      throw e
    }
    clearTimeout(timeoutId)
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string }
      throw new Error(err.error || `HTTP ${res.status}`)
    }
    const data = (await res.json()) as { content?: string }
    return data.content ?? ''
  }

  const getAIResponse = async (userMessage: string, files: AttachedFile[] = []) => {
    try {
      const access = await hasChatAccess()
      if (!access.ok) {
        setSubscriptionRequired(true)
        return
      }
    } catch (error) {
      console.error('Error checking account:', error)
      setSubscriptionRequired(true)
      return
    }

    setIsLoading(true)
    stickToBottomRef.current = true
    const aiMessageId = Date.now() + 1
    setMessages((prev) => [
      ...prev,
      { id: aiMessageId, text: '', sender: 'ai', timestamp: new Date(), isStreaming: true },
    ])

    const options = optionsFromPreset(presets, activePreset, userMessage, activeTone)
    try {
      // Flip AI_RESPONSE_MODE in ../lib/aiResponseMode.ts ('stream' | 'complete')
      const appendChunk = (chunk: string) => {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === aiMessageId ? { ...msg, text: msg.text + chunk, isStreaming: true } : msg,
          ),
        )
      }

      const { content: rawContent, usedStream } = await fetchAiReply({
        mode: AI_RESPONSE_MODE,
        stream: (onChunk) => askOpenRouterStream(userMessage, files, options, onChunk),
        complete: () => askOpenRouterComplete(userMessage, files, options),
        onChunk: AI_RESPONSE_MODE === 'stream' ? appendChunk : undefined,
      })

      let contentToUse = rawContent.trim()
      if (contentToUse && !usedStream) {
        setMessages((prev) =>
          prev.map((msg) => (msg.id === aiMessageId ? { ...msg, text: contentToUse } : msg)),
        )
      }

      if (!contentToUse.trim()) {
        setMessages((prev) => [
          ...prev.filter((msg) => msg.id !== aiMessageId),
          {
            id: Date.now() + 1,
            text: 'Error: The AI returned no text. Wait a minute and try again.',
            sender: 'ai',
            timestamp: new Date(),
          },
        ])
      } else {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === aiMessageId ? { ...msg, text: contentToUse, isStreaming: false } : msg,
          ),
        )
        conversationContext.current = [
          ...conversationContext.current,
          {
            text: userMessage,
            sender: 'user',
            images: files.length > 0 ? files.map((f) => f.dataUrl) : undefined,
          },
          { text: contentToUse, sender: 'ai' },
        ]
      }
    } catch (error) {
      setMessages((prev) => [
        ...prev.filter((msg) => msg.id !== aiMessageId),
        {
          id: Date.now() + 1,
          text: `Error: ${userFacingError(error, 'Failed to get response.')}`,
          sender: 'ai',
          timestamp: new Date(),
        },
      ])
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    const scroller = messagesScrollerRef.current
    if (!scroller || !stickToBottomRef.current) return
    ignoreScrollRef.current = true
    scroller.scrollTop = scroller.scrollHeight
    requestAnimationFrame(() => {
      ignoreScrollRef.current = false
    })
  }, [messages])

  useEffect(() => {
    const scroller = messagesScrollerRef.current
    if (!scroller) return undefined

    const updateStick = () => {
      if (ignoreScrollRef.current) return
      const distance = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight
      stickToBottomRef.current = distance <= 48
    }

    const onScroll = () => updateStick()
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY < 0) stickToBottomRef.current = false
    }
    const onTouchMove = () => {
      const distance = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight
      if (distance > 48) stickToBottomRef.current = false
    }

    scroller.addEventListener('scroll', onScroll, { passive: true })
    scroller.addEventListener('wheel', onWheel, { passive: true })
    scroller.addEventListener('touchmove', onTouchMove, { passive: true })
    return () => {
      scroller.removeEventListener('scroll', onScroll)
      scroller.removeEventListener('wheel', onWheel)
      scroller.removeEventListener('touchmove', onTouchMove)
    }
  }, [])

  // Return focus on the input
  useEffect(() => {
    if (wasLoadingRef.current && !isLoading) {
      requestAnimationFrame(() => inputRef.current?.focus())
    }
    wasLoadingRef.current = isLoading
  }, [isLoading])

  const fileToBase64 = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = reject
      reader.readAsDataURL(file)
    })

  const handleFileSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    const valid = files.filter((file) => file.type.startsWith('image/') || file.type === 'application/pdf')
    const next = await Promise.all(
      valid.map(async (file) => ({
        file,
        dataUrl: await fileToBase64(file),
        type: file.type,
        name: file.name,
      })),
    )
    setAttachedFiles((prev) => [...prev, ...next])
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const messageText = inputValue.trim()
    if ((!messageText && attachedFiles.length === 0) || isLoading) return
    const filesToSend = [...attachedFiles]
    setInputValue('')
    setAttachedFiles([])
    const resolvedPreset =
      activePreset ||
      Object.keys(presets).find(
        (k) => k.toLowerCase() === messageText.trim().split(/\s+/)[0]?.toLowerCase(),
      ) ||
      null
    const userMessage: ChatMessage = {
      id: Date.now(),
      text: messageText || (filesToSend.length > 0 ? 'Attached files' : ''),
      sender: 'user',
      timestamp: new Date(),
      images: filesToSend.map((f) => f.dataUrl),
      presetName: resolvedPreset,
    }
    setMessages((prev) => [...prev, userMessage])
    stickToBottomRef.current = true
    conversationContext.current = [
      ...conversationContext.current,
      {
        text: messageText || '',
        sender: 'user',
        images: filesToSend.length > 0 ? filesToSend.map((f) => f.dataUrl) : undefined,
      },
    ]
    await getAIResponse(messageText || '', filesToSend)
  }

  const formatTime = (date: Date) =>
    date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  const copyMessage = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      /* ignore */
    }
  }

  const presetNames = Object.keys(presets).sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: 'base' }),
  )
  const displayState = activePreset || 'Default'
  const showSuggestions = messages.length > 0 && !isLoading

  const rail = (
    <nav className="app-rail" aria-label="Main">
      <Link to="/" className="app-rail-brand" aria-label="PROXY home" title="Home">
        <BrandMark inverted className="h-6 w-6" />
      </Link>
      <div className="app-rail-nav">
        <button
          type="button"
          className="app-rail-btn"
          aria-label="New chat"
          title="New chat"
          onClick={startNewChat}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
        <button
          type="button"
          className={`app-rail-btn${mainTab === 'chat' ? ' is-active' : ''}`}
          aria-label="Chat"
          title="Chat"
          aria-current={mainTab === 'chat' ? 'page' : undefined}
          onClick={() => setMainTab('chat')}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </button>
        <button
          type="button"
          className={`app-rail-btn${mainTab === 'states' ? ' is-active' : ''}`}
          aria-label="States"
          title="States"
          aria-current={mainTab === 'states' ? 'page' : undefined}
          onClick={() => setMainTab('states')}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
            <rect x="3" y="3" width="7" height="7" rx="1.5" />
            <rect x="14" y="3" width="7" height="7" rx="1.5" />
            <rect x="3" y="14" width="7" height="7" rx="1.5" />
            <rect x="14" y="14" width="7" height="7" rx="1.5" />
          </svg>
        </button>
        <Link to="/account" className="app-rail-btn" aria-label="Settings" title="Settings">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </Link>
      </div>
      <div className="app-rail-footer">
        <Link to="/account" className="app-rail-avatar" aria-label="Profile" title="Profile">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
            <circle cx="12" cy="8" r="3.5" />
            <path d="M5 21a7 7 0 0 1 14 0" />
          </svg>
        </Link>
      </div>
    </nav>
  )

  const slotsLabel =
    activeLimit == null
      ? `${activeCount} active`
      : `${activeCount} / ${activeLimit} active`

  const statesPanel = (
    <aside className="chat-states-panel" aria-label="States">
      <p className="chat-states-drawer-title">States</p>
      <p className="chat-states-slots">{slotsLabel}</p>
      {slotNotice ? <p className="chat-states-notice">{slotNotice}</p> : null}
      {library.length === 0 ? (
        <p className="chat-sidebar-empty">
          Sign in to load official States. Activate up to{' '}
          {activeLimit ?? 'unlimited'} for chat.
        </p>
      ) : (
        <>
          <input
            className="chat-states-search"
            type="search"
            value={statesQuery}
            onChange={(e) => setStatesQuery(e.target.value)}
            placeholder="Search states"
            aria-label="Search states"
          />
          <div className="chat-preset-list">
            <button
              type="button"
              className={`chat-preset-item${!activePreset ? ' is-active' : ''}`}
              onClick={() => {
                setActivePreset(null)
                setMainTab('chat')
                setStatePickerOpen(false)
              }}
            >
              Default
            </button>
            {library
              .filter((item) =>
                item.name.toLowerCase().includes(statesQuery.trim().toLowerCase()),
              )
              .map((item) => {
                const atLimit =
                  !item.isActive &&
                  activeLimit != null &&
                  activeCount >= activeLimit
                return (
                  <div
                    key={item.id}
                    className={`chat-library-row${item.isActive ? ' is-active-slot' : ''}${
                      activePreset === item.name ? ' is-selected' : ''
                    }`}
                  >
                    <button
                      type="button"
                      className="chat-library-use"
                      disabled={!item.isActive}
                      title={
                        item.isActive
                          ? item.description || item.name
                          : 'Activate this State to use it in chat'
                      }
                      onClick={() => {
                        if (!item.isActive) return
                        setActivePreset(item.name)
                        setMainTab('chat')
                        setStatePickerOpen(false)
                      }}
                    >
                      <span className="chat-library-name">{item.name}</span>
                      {!item.isActive ? (
                        <span className="chat-library-badge">Inactive</span>
                      ) : null}
                    </button>
                    <button
                      type="button"
                      className="chat-library-toggle"
                      disabled={togglingId === item.id || atLimit}
                      title={
                        atLimit
                          ? stateTier === 'beta'
                            ? 'Beta accounts can have up to 5 active States.'
                            : 'Free accounts can have up to 3 active States.'
                          : item.isActive
                            ? 'Deactivate'
                            : 'Activate'
                      }
                      onClick={() => void toggleStateActive(item)}
                    >
                      {togglingId === item.id
                        ? '…'
                        : item.isActive
                          ? 'On'
                          : atLimit
                            ? 'Full'
                            : 'Off'}
                    </button>
                  </div>
                )
              })}
          </div>
        </>
      )}
    </aside>
  )

  const header = (
    <header className="chat-header">
      <div className="chat-header-left">
        <button
          type="button"
          className="chat-new-chat-btn"
          onClick={startNewChat}
          aria-label="New chat"
          title="New chat"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M12 5v14M5 12h14" />
          </svg>
          <span className="chat-new-chat-label">New</span>
        </button>
        <div className="chat-state-picker">
          <button
            type="button"
            className="chat-state-chip"
            aria-haspopup="listbox"
            aria-expanded={statePickerOpen}
            onClick={() => setStatePickerOpen((v) => !v)}
          >
            <span className="chat-state-chip-label">State</span>
            <span className="chat-state-chip-value">{displayState}</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          {statePickerOpen ? (
            <>
              <button
                type="button"
                className="chat-state-sheet-backdrop"
                aria-label="Close state picker"
                onClick={() => setStatePickerOpen(false)}
              />
              <div className="chat-state-sheet" role="listbox" aria-label="Choose a state">
                <div className="chat-state-sheet-head">
                  <p>Choose a state</p>
                  <button type="button" onClick={() => setStatePickerOpen(false)} aria-label="Close">
                    Done
                  </button>
                </div>
                <button
                  type="button"
                  role="option"
                  aria-selected={!activePreset}
                  className={`chat-preset-item${!activePreset ? ' is-active' : ''}`}
                  onClick={() => {
                    setActivePreset(null)
                    setStatePickerOpen(false)
                  }}
                >
                  Default
                </button>
                {presetNames.map((name) => (
                  <button
                    key={name}
                    type="button"
                    role="option"
                    aria-selected={activePreset === name}
                    className={`chat-preset-item${activePreset === name ? ' is-active' : ''}`}
                    onClick={() => {
                      setActivePreset(name)
                      setStatePickerOpen(false)
                    }}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </>
          ) : null}
        </div>
      </div>
      <div className="chat-header-actions">
        {user ? (
          <button
            type="button"
            className="chat-header-signout"
            onClick={() => void signOut({ returnTo: `${window.location.origin}/app` })}
          >
            Sign out
          </button>
        ) : null}
        <div className="chat-header-menu">
          <button
            type="button"
            className="chat-header-icon-btn"
            aria-label="More"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
              <circle cx="12" cy="5" r="1" fill="currentColor" stroke="none" />
              <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
              <circle cx="12" cy="19" r="1" fill="currentColor" stroke="none" />
            </svg>
          </button>
          {menuOpen ? (
            <div className="chat-header-menu-panel">
              <button type="button" onClick={startNewChat}>
                New chat
              </button>
              <Link to="/" onClick={() => setMenuOpen(false)}>
                Home
              </Link>
              <Link to="/account" onClick={() => setMenuOpen(false)}>
                Account
              </Link>
              {user ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false)
                      void openPortal()
                    }}
                    disabled={portalLoading}
                  >
                    {portalLoading ? 'Billing…' : 'Billing'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false)
                      handleSwitchAccount()
                    }}
                  >
                    Switch account
                  </button>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </header>
  )

  const shell = (body: ReactNode) => (
    <div className="chat-view">
      {rail}
      <div className="app-main">
        {header}
        {body}
      </div>
    </div>
  )

  if (authLoading) {
    return shell(
      <div className="chat-auth-container">
        <div className="chat-auth-content">
          <div className="chat-loading-spinner" />
          <p>Checking whether you’re signed in…</p>
        </div>
      </div>,
    )
  }

  if (!user) {
    return shell(
      <div className="chat-auth-container">
        <div className="chat-auth-content">
          <BrandMark inverted className="h-12 w-12" />
          <h2>Sign in to PROXY Web</h2>
          <p>Sign in with your PROXY account to send messages in the browser.</p>
          <button className="chat-login-button" type="button" onClick={() => void startSignIn()}>
            Sign in
          </button>
        </div>
      </div>,
    )
  }

  if (subscriptionRequired) {
    return shell(
      <div className="chat-auth-container">
        <div className="chat-auth-content">
          <h2>Out of free tokens</h2>
          <p>
            Free accounts include up to about 30 requests (lifetime). Subscribe to keep chatting on
            PROXY Web and Windows.
          </p>
          <button
            className="chat-login-button"
            type="button"
            onClick={() => void startCheckout(stripePlans.monthly)}
            disabled={checkoutLoading || !stripePlans.monthly}
          >
            {checkoutLoading ? 'Opening checkout…' : 'Subscribe monthly'}
          </button>
          <button
            className="chat-login-button"
            type="button"
            onClick={() => void startCheckout(stripePlans.yearly)}
            disabled={checkoutLoading || !stripePlans.yearly}
          >
            {checkoutLoading ? 'Opening checkout…' : 'Subscribe yearly'}
          </button>
          <button
            className="chat-close-button"
            type="button"
            onClick={async () => {
              try {
                await convex.current.action(api.account.syncMySubscription, {})
              } catch (err) {
                console.error('syncMySubscription failed:', err)
              }
              setSubscriptionRequired(false)
              await getAIResponse(messages.find((m) => m.sender === 'user')?.text || '')
            }}
          >
            I already have a plan (retry)
          </button>
        </div>
      </div>,
    )
  }

  if (mainTab === 'states') {
    return shell(statesPanel)
  }

  return shell(
    <div className="chat-panel">
      <div className="chat-messages" ref={messagesScrollerRef}>
        {messages.length === 0 ? (
          <div className="chat-empty">
            <BrandMark inverted className="h-8 w-8" />
            <p>Type a message to start, chats are throwaway, use New anytime</p>
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className={`message message-${msg.sender}`}>
              <div className="message-body">
                <div
                  className={`message-bubble${
                    msg.isStreaming && !msg.text ? ' is-thinking' : ''
                  }`}
                >
                  {msg.sender === 'user' && msg.presetName ? (
                    <span className="message-preset-indicator">{msg.presetName}</span>
                  ) : null}
                  {msg.images && msg.images.length > 0 ? (
                    <div className="message-images">
                      {msg.images.map((img, idx) => (
                        <img key={idx} src={img} alt={`Attachment ${idx + 1}`} className="message-image" />
                      ))}
                    </div>
                  ) : null}
                  {(msg.text || msg.isStreaming) && (
                    <div
                      className={`message-text${
                        msg.sender === 'ai' && !msg.isStreaming ? ' message-text-markdown' : ''
                      }${msg.isStreaming ? ' message-text-streaming' : ''}`}
                    >
                      {msg.isStreaming && !msg.text ? (
                        <span className="message-thinking" aria-live="polite" aria-label="Thinking">
                          <span className="message-thinking-orb" aria-hidden>
                            <ThinkingOrb state="composing" size={64} theme="auto" />
                          </span>
                          <span className="message-thinking-label">Thinking....</span>
                        </span>
                      ) : msg.sender === 'ai' && !msg.isStreaming ? (
                        <ReactMarkdown remarkPlugins={REMARK_PLUGINS} rehypePlugins={REHYPE_PLUGINS}>
                          {normalizeAiMarkdown(msg.text || '')}
                        </ReactMarkdown>
                      ) : (
                        msg.text
                      )}
                      {msg.isStreaming && msg.text ? <span className="streaming-cursor">▋</span> : null}
                    </div>
                  )}
                </div>
                <div className="message-meta">
                  {msg.sender === 'ai' && !msg.isStreaming ? (
                    <div className="message-actions">
                      <button
                        type="button"
                        className="message-action-btn"
                        aria-label="Copy"
                        onClick={() => void copyMessage(msg.text)}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
                          <rect x="9" y="9" width="13" height="13" rx="2" />
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        className={`message-action-btn${messageFeedback[msg.id] === 'up' ? ' is-active' : ''}`}
                        aria-label="Thumbs up"
                        onClick={() =>
                          setMessageFeedback((prev) => ({
                            ...prev,
                            [msg.id]: prev[msg.id] === 'up' ? undefined : 'up',
                          }))
                        }
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
                          <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z" />
                          <path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        className={`message-action-btn${messageFeedback[msg.id] === 'down' ? ' is-active' : ''}`}
                        aria-label="Thumbs down"
                        onClick={() =>
                          setMessageFeedback((prev) => ({
                            ...prev,
                            [msg.id]: prev[msg.id] === 'down' ? undefined : 'down',
                          }))
                        }
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
                          <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3H10z" />
                          <path d="M17 2h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17" />
                        </svg>
                      </button>
                    </div>
                  ) : null}
                  <span className="message-time">{formatTime(msg.timestamp)}</span>
                </div>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {showSuggestions ? (
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
      ) : null}

      <form className="chat-composer-form" onSubmit={(e) => void handleSubmit(e)}>
        <VoiceBeam
          className="chat-voice-beam"
          type="default"
          stream={micStream}
          processing={isLoading || transcribing}
          colorVariant="ocean"
          theme={voiceTheme}
          active={Boolean(micStream) || isLoading || transcribing}
          strength={0.9}
        >
          <div className="chat-input-container">
        {attachedFiles.length > 0 ? (
          <div className="chat-attachments" aria-label="Attachments">
            {attachedFiles.map((fileData, idx) => (
              <div key={idx} className="chat-attachment-item">
                {fileData.type.startsWith('image/') ? (
                  <img src={fileData.dataUrl} alt={fileData.name} className="attachment-preview" />
                ) : (
                  <div className="attachment-pdf-icon" title={fileData.name}>
                    PDF
                  </div>
                )}
                <button
                  type="button"
                  className="attachment-remove"
                  onClick={() => setAttachedFiles((prev) => prev.filter((_, i) => i !== idx))}
                  aria-label={`Remove ${fileData.name}`}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        ) : null}
        <input
          type="file"
          ref={fileInputRef}
          className="chat-file-input"
          accept="image/*,application/pdf"
          multiple
          onChange={(e) => void handleFileSelect(e)}
          aria-label="Attach file"
        />
        <div className="chat-input-row">
          <button
            type="button"
            className="chat-attach-button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading}
            aria-label="Attach file"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
            </svg>
          </button>
          {speechSupported ? (
            <div className="chat-mic-wrap" ref={micMenuRef}>
              <button
                type="button"
                className={`chat-mic-button${listening || transcribing ? ' is-listening' : ''}`}
                onClick={handleMicClick}
                onContextMenu={(e) => {
                  e.preventDefault()
                  setMicMenuOpen((open) => !open)
                }}
                disabled={isLoading || transcribing}
                aria-label={
                  transcribing ? 'Transcribing' : listening ? 'Stop dictation' : 'Start dictation'
                }
                title={
                  transcribing
                    ? 'Transcribing…'
                    : listening
                      ? 'Stop and transcribe'
                      : 'Click to speak, click again to transcribe · right-click for mic settings'
                }
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="23" />
                  <line x1="8" y1="23" x2="16" y2="23" />
                </svg>
              </button>
              {micMenuOpen ? (
                <div className="chat-mic-menu" role="dialog" aria-label="Microphone settings">
                  <div className="chat-mic-menu-label">Microphone</div>
                  <select
                    className="select-field"
                    value={micDeviceId}
                    onChange={(e) => void handleMicDeviceChange(e.target.value)}
                    disabled={micBusy}
                  >
                    <option value="">Browser default</option>
                    {microphones.map((mic) => (
                      <option key={mic.deviceId} value={mic.deviceId}>
                        {mic.label}
                      </option>
                    ))}
                  </select>
                  <p className="chat-mic-menu-hint">
                    {micBusy
                      ? 'Requesting microphone access…'
                      : 'Right-click the mic for settings. Click the mic to record, click again to transcribe.'}
                  </p>
                  {micNotice ? <p className="chat-mic-menu-hint">{micNotice}</p> : null}
                </div>
              ) : null}
            </div>
          ) : null}
          <input
            ref={inputRef}
            type="text"
            className="chat-input-field"
            placeholder={
              transcribing
                ? 'Transcribing…'
                : listening
                  ? 'Listening… text updates as you speak'
                  : 'Message PROXY…'
            }
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            disabled={isLoading}
            autoFocus
          />
          <button
            type="submit"
            className="chat-input-submit"
            disabled={(!inputValue.trim() && attachedFiles.length === 0) || isLoading}
            aria-label="Send message"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 19V5M5 12l7-7 7 7" />
            </svg>
          </button>
        </div>
          </div>
        </VoiceBeam>
      </form>
    </div>,
  )
}
