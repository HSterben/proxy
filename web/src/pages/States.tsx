import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ConvexClient } from 'convex/browser'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { BookmarkCheck, BookmarkPlus, Loader2, Search, Star, Trash2, X } from 'lucide-react'
import { useAuth } from '../auth/AuthSessionProvider'
import { api } from '../convex/api'
import { convexUrl } from '../lib/convexUrls'
import Reveal from '../components/ui/Reveal'
import { AuthorByline } from '../components/ui/ProfileAvatar'

const TAG_OPTIONS = ['Writing', 'Creative', 'Utility', 'Translation', 'Fun'] as const

type Visibility = 'public' | 'private'

type StateFields = {
  description?: string
  desc?: string
  systemInstruction?: string
  system_instruction?: string
  temperature?: number
  maxTokens?: number
  topP?: number
  frequencyPenalty?: number
  presencePenalty?: number
  stop?: string | string[]
  visibility?: Visibility
}

type CommunityState = {
  _id: string
  name: string
  description: string
  authorDisplayName: string
  authorWorkosId: string
  authorAvatarUrl?: string | null
  tags: string[]
  visibility: Visibility
  saveCount: number
  starCount: number
  starredByMe: boolean
  savedByMe: boolean
  isOfficial: boolean
  createdAt: number
  state: StateFields
}

type MyStatesMap = Record<string, StateFields>

type ScopeFilter = 'all' | 'saved' | 'starred' | 'official'

function instructionOf(state: StateFields) {
  return (state.systemInstruction || state.system_instruction || '').trim()
}

function formatDate(ms: number) {
  return new Date(ms).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function parseOptionalNumber(raw: string, intOnly = false): number | undefined {
  const s = raw.trim()
  if (!s) return undefined
  const n = intOnly ? parseInt(s, 10) : parseFloat(s)
  return Number.isFinite(n) ? n : undefined
}

function filterChipClass(active: boolean) {
  return active
    ? 'bg-black text-white border-black'
    : 'bg-white text-ink/70 border-hairline hover:border-ink/30 hover:text-ink'
}

export default function States() {
  const { user, isLoading: authLoading, signIn, getAccessToken } = useAuth()
  const convex = useRef(new ConvexClient(convexUrl))
  const [posts, setPosts] = useState<CommunityState[] | null>(null)
  const [myStates, setMyStates] = useState<MyStatesMap>({})
  const [myWorkosId, setMyWorkosId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [publishOpen, setPublishOpen] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [publishName, setPublishName] = useState('')
  const [publishDescription, setPublishDescription] = useState('')
  const [publishFrom, setPublishFrom] = useState('')
  const [publishInstruction, setPublishInstruction] = useState('')
  const [publishTemp, setPublishTemp] = useState('0.5')
  const [publishFreq, setPublishFreq] = useState('')
  const [publishPresence, setPublishPresence] = useState('')
  const [publishMaxTokens, setPublishMaxTokens] = useState('')
  const [publishTags, setPublishTags] = useState<string[]>([])
  const [publishVisibility, setPublishVisibility] = useState<Visibility>('private')
  const [publishing, setPublishing] = useState(false)
  const [notice, setNotice] = useState('')
  const [defaultNames, setDefaultNames] = useState<string[]>([])
  const [scope, setScope] = useState<ScopeFilter>('all')
  const [activeTag, setActiveTag] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editInstruction, setEditInstruction] = useState('')
  const [editTags, setEditTags] = useState<string[]>([])
  const [editTemp, setEditTemp] = useState('')
  const [editFreq, setEditFreq] = useState('')
  const [editPresence, setEditPresence] = useState('')
  const [editMaxTokens, setEditMaxTokens] = useState('')
  const [editAdvanced, setEditAdvanced] = useState(false)
  const [editVisibility, setEditVisibility] = useState<Visibility>('private')
  const [canPublishStates, setCanPublishStates] = useState(false)
  const reduceMotion = useReducedMotion()

  const myStateNames = useMemo(() => Object.keys(myStates).sort(), [myStates])
  const libraryCount = myStateNames.length

  const refresh = async () => {
    setError('')
    try {
      const list = (await convex.current.query(api.gallery.list, {
        limit: 80,
      })) as CommunityState[]
      setPosts(list)
    } catch (err) {
      console.error(err)
      setPosts([])
      setError(
        err instanceof Error
          ? err.message
          : 'Could not load community states. Deploy the latest Convex backend.',
      )
    }
  }

  useEffect(() => {
    void (async () => {
      try {
        await convex.current.mutation(api.gallery.seedOfficialDefaults, {})
      } catch (err) {
        console.warn('Official states seed skipped:', err)
      }
      await refresh()
    })()
  }, [])

  useEffect(() => {
    if (!user) {
      setMyStates({})
      setMyWorkosId(null)
      setCanPublishStates(false)
      return
    }
    setMyWorkosId(user.id)
    convex.current.setAuth(async () => (await getAccessToken()) ?? null)
    void (async () => {
      try {
        await convex.current.mutation(api.states.ensureMyLibrary, {})
        const [mine, account] = await Promise.all([
          convex.current.query(api.states.getMyStates, {}),
          convex.current.query(api.account.getMyAccount, {}),
        ])
        if (mine?.states) setMyStates(mine.states as MyStatesMap)
        if (mine?.defaultNames) setDefaultNames(mine.defaultNames)
        setCanPublishStates(Boolean(account?.canPublishStates))
      } catch {
        // not signed into Convex yet
      }
      await refresh()
    })()
  }, [user, getAccessToken])

  const showNotice = (text: string) => {
    setNotice(text)
    window.setTimeout(() => setNotice(''), 3200)
  }

  const ensureAuth = () => {
    if (!user) {
      void signIn({ state: { returnTo: '/states' } })
      return false
    }
    convex.current.setAuth(async () => (await getAccessToken()) ?? null)
    return true
  }

  const isSaved = (post: CommunityState) => post.savedByMe

  const filteredPosts = useMemo(() => {
    if (!posts) return null
    const q = query.trim().toLowerCase()
    return posts.filter((post) => {
      const saved = post.savedByMe
      if (scope === 'saved' && !saved) return false
      if (scope === 'starred' && !post.starredByMe) return false
      if (scope === 'official' && !post.isOfficial) return false
      if (activeTag && !(post.tags || []).includes(activeTag)) return false
      if (!q) return true
      const hay = [
        post.name,
        post.description,
        post.authorDisplayName,
        ...(post.tags || []),
        instructionOf(post.state),
      ]
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
  }, [posts, scope, activeTag, query])

  const savedInViewCount = useMemo(
    () => (posts ? posts.filter((p) => p.savedByMe).length : 0),
    [posts],
  )

  const handleSave = async (post: CommunityState) => {
    if (!ensureAuth()) return
    setBusyId(post._id)
    setError('')
    try {
      const result = (await convex.current.mutation(api.gallery.saveToMine, {
        stateId: post._id as never,
      })) as { savedAs: string }
      setMyStates((prev) => ({
        ...prev,
        [result.savedAs]: {
          description: post.description,
          systemInstruction: instructionOf(post.state),
          ...post.state,
        },
      }))
      setPosts((prev) =>
        prev
          ? prev.map((p) => (p._id === post._id ? { ...p, savedByMe: true } : p))
          : prev,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save state')
    } finally {
      setBusyId(null)
    }
  }

  const handleStar = async (post: CommunityState) => {
    if (!ensureAuth()) return
    setBusyId(`star-${post._id}`)
    setError('')
    try {
      const result = (await convex.current.mutation(api.gallery.toggleStar, {
        stateId: post._id as never,
      })) as { starred: boolean; starCount: number }
      setPosts((prev) =>
        prev
          ? prev.map((p) =>
              p._id === post._id
                ? { ...p, starredByMe: result.starred, starCount: result.starCount }
                : p,
            )
          : prev,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update star')
    } finally {
      setBusyId(null)
    }
  }

  const handleRemoveMine = async (post: CommunityState) => {
    if (!ensureAuth()) return
    setBusyId(`lib-${post._id}`)
    setError('')
    try {
      const result = (await convex.current.mutation(api.states.removeMyState, {
        stateId: post._id as never,
      })) as { states: MyStatesMap }
      setMyStates(result.states || {})
      setPosts((prev) =>
        prev
          ? prev.map((p) => (p._id === post._id ? { ...p, savedByMe: false } : p))
          : prev,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove state')
    } finally {
      setBusyId(null)
    }
  }

  const openEdit = (post: CommunityState) => {
    setEditingId(post._id)
    setEditName(post.name)
    setEditDescription(post.description)
    setEditInstruction(instructionOf(post.state))
    setEditTags(post.tags || [])
    setEditTemp(
      typeof post.state.temperature === 'number' ? String(post.state.temperature) : '',
    )
    setEditFreq(
      typeof post.state.frequencyPenalty === 'number'
        ? String(post.state.frequencyPenalty)
        : '',
    )
    setEditPresence(
      typeof post.state.presencePenalty === 'number'
        ? String(post.state.presencePenalty)
        : '',
    )
    setEditMaxTokens(
      typeof post.state.maxTokens === 'number' ? String(post.state.maxTokens) : '',
    )
    setEditAdvanced(
      typeof post.state.frequencyPenalty === 'number' ||
        typeof post.state.presencePenalty === 'number' ||
        typeof post.state.maxTokens === 'number' ||
        typeof post.state.temperature === 'number',
    )
    setEditVisibility(post.visibility === 'public' ? 'public' : 'private')
    setError('')
  }

  const closeEdit = () => setEditingId(null)

  const saveOwnedEdit = async () => {
    if (!editingId) return
    setBusyId(editingId)
    setError('')
    try {
      const state: StateFields = {
        description: editDescription.trim(),
        systemInstruction: editInstruction.trim(),
      }
      const temperature = parseOptionalNumber(editTemp)
      const frequencyPenalty = parseOptionalNumber(editFreq)
      const presencePenalty = parseOptionalNumber(editPresence)
      const maxTokens = parseOptionalNumber(editMaxTokens, true)
      if (temperature !== undefined) state.temperature = temperature
      if (frequencyPenalty !== undefined) state.frequencyPenalty = frequencyPenalty
      if (presencePenalty !== undefined) state.presencePenalty = presencePenalty
      if (maxTokens !== undefined) state.maxTokens = maxTokens

      await convex.current.mutation(api.gallery.updatePublished, {
        stateId: editingId as never,
        name: editName,
        description: editDescription,
        state,
        tags: editTags,
        visibility: editVisibility,
      })
      closeEdit()
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save changes')
    } finally {
      setBusyId(null)
    }
  }

  const handleDeleteOwned = async (postId: string) => {
    if (!ensureAuth()) return
    setBusyId(postId)
    setError('')
    try {
      await convex.current.mutation(api.gallery.remove, {
        stateId: postId as never,
      })
      if (editingId === postId) closeEdit()
      setPosts((prev) => (prev ? prev.filter((p) => p._id !== postId) : prev))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete')
    } finally {
      setBusyId(null)
    }
  }

  useEffect(() => {
    if (!editingId) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeEdit()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [editingId])

  const editingPost = useMemo(
    () => (editingId && posts ? posts.find((p) => p._id === editingId) : null),
    [editingId, posts],
  )

  const togglePublishTag = (tag: string) => {
    setPublishTags((prev) => {
      if (prev.includes(tag)) return prev.filter((t) => t !== tag)
      if (prev.length >= 3) return prev
      return [...prev, tag]
    })
  }

  const fillFromMine = (name: string) => {
    setPublishFrom(name)
    const s = myStates[name]
    if (!s) return
    setPublishName(name)
    setPublishDescription(s.description || s.desc || '')
    setPublishInstruction(s.systemInstruction || s.system_instruction || '')
    setPublishTemp(typeof s.temperature === 'number' ? String(s.temperature) : '0.5')
    setPublishFreq(typeof s.frequencyPenalty === 'number' ? String(s.frequencyPenalty) : '')
    setPublishPresence(typeof s.presencePenalty === 'number' ? String(s.presencePenalty) : '')
    setPublishMaxTokens(typeof s.maxTokens === 'number' ? String(s.maxTokens) : '')
    const hasAdvanced =
      typeof s.frequencyPenalty === 'number' ||
      typeof s.presencePenalty === 'number' ||
      typeof s.maxTokens === 'number' ||
      (typeof s.temperature === 'number' && s.temperature !== 0.5)
    if (hasAdvanced) setAdvancedOpen(true)
  }

  const resetPublishForm = () => {
    setPublishName('')
    setPublishDescription('')
    setPublishInstruction('')
    setPublishFrom('')
    setPublishTemp('0.5')
    setPublishFreq('')
    setPublishPresence('')
    setPublishMaxTokens('')
    setPublishTags([])
    setPublishVisibility('private')
    setAdvancedOpen(false)
  }

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!ensureAuth()) return
    setPublishing(true)
    setError('')
    try {
      const temperature = parseOptionalNumber(publishTemp)
      const frequencyPenalty = parseOptionalNumber(publishFreq)
      const presencePenalty = parseOptionalNumber(publishPresence)
      const maxTokens = parseOptionalNumber(publishMaxTokens, true)

      const state: StateFields = {
        description: publishDescription.trim(),
        systemInstruction: publishInstruction.trim(),
      }
      if (temperature !== undefined) state.temperature = temperature
      if (frequencyPenalty !== undefined) state.frequencyPenalty = frequencyPenalty
      if (presencePenalty !== undefined) state.presencePenalty = presencePenalty
      if (maxTokens !== undefined) state.maxTokens = maxTokens

      await convex.current.mutation(api.gallery.publish, {
        name: publishName,
        description: publishDescription,
        state,
        tags: publishTags,
        visibility: publishVisibility,
      })
      setPublishOpen(false)
      resetPublishForm()
      showNotice(
        publishVisibility === 'public'
          ? 'Published to the community gallery'
          : 'Private state saved to your account',
      )
      const mine = await convex.current.query(api.states.getMyStates, {})
      if (mine?.states) setMyStates(mine.states as MyStatesMap)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save state')
    } finally {
      setPublishing(false)
    }
  }

  const scopeFilters: { id: ScopeFilter; label: string; count?: number }[] = [
    { id: 'all', label: 'All' },
    {
      id: 'saved',
      label: 'Saved',
      count: user ? savedInViewCount || libraryCount : undefined,
    },
    { id: 'starred', label: 'Starred' },
    { id: 'official', label: 'Official' },
  ]

  return (
    <>
      <section data-nav-tone="dark" className="bg-graphite pb-12 pt-28 text-white">
        <div className="page">
          <Reveal className="card max-w-2xl p-8 text-ink md:p-12">
            <p className="eyebrow">States</p>
            <h1 className="display mt-4 font-semibold">States gallery</h1>
            <p className="mt-4 max-w-[46ch] text-lg text-ink/55">
              Browse public states from PROXY and other users. Filter by tag, star what you like, or
              save a state into your library after you sign in.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                className="pressable inline-flex min-h-11 items-center rounded-[10px] bg-black px-5 text-[15px] font-semibold text-white disabled:opacity-50"
                disabled={Boolean(user) && !canPublishStates}
                title={
                  user && !canPublishStates
                    ? 'Subscribe to create or publish states'
                    : undefined
                }
                onClick={() => {
                  if (!ensureAuth()) return
                  if (!canPublishStates) {
                    setError(
                      'Free accounts can use Simplify, List, and Critique. Subscribe to create or publish states.',
                    )
                    return
                  }
                  setPublishOpen(true)
                }}
              >
                Create a state
              </button>
              <Link
                to="/app"
                className="pressable inline-flex min-h-11 items-center rounded-[10px] border border-hairline px-5 text-[15px] font-medium text-ink"
              >
                Open PROXY Web
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="bg-canvas pb-20 pt-10 text-ink">
        <div className="page">
          {notice && (
            <div className="mb-4 rounded-[10px] border border-hairline bg-white px-4 py-3 text-[15px]">
              {notice}
            </div>
          )}
          {error && (
            <div className="mb-4 rounded-[10px] border border-red-200 bg-red-50 px-4 py-3 text-[15px] text-red-800">
              {error}
            </div>
          )}

          {publishOpen && (
            <Reveal className="card mb-8 p-6 md:p-8">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold">Create a state</h2>
                  <p className="mt-1 text-[15px] text-ink/55">
                    Private by default. Turn on public to list it in the gallery.
                  </p>
                </div>
                <button
                  type="button"
                  className="text-[15px] text-ink/50 hover:text-ink"
                  onClick={() => {
                    setPublishOpen(false)
                    resetPublishForm()
                  }}
                >
                  Cancel
                </button>
              </div>

              {authLoading ? (
                <p className="mt-4 text-ink/50">Checking sign-in…</p>
              ) : !user ? (
                <p className="mt-4 text-ink/55">Sign in to create a state.</p>
              ) : (
                <form className="mt-6 grid gap-4" onSubmit={(e) => void handlePublish(e)}>
                  {myStateNames.length > 0 && (
                    <label className="block text-[15px]">
                      <span className="text-ink/50">Start from one of yours</span>
                      <select
                        className="mt-1.5 w-full rounded-[10px] border border-hairline bg-white px-3 py-2.5"
                        value={publishFrom}
                        onChange={(e) => fillFromMine(e.target.value)}
                      >
                        <option value="">Custom…</option>
                        {myStateNames.map((name) => (
                          <option key={name} value={name}>
                            {name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <label className="block text-[15px]">
                    <span className="text-ink/50">Name</span>
                    <input
                      required
                      maxLength={64}
                      className="mt-1.5 w-full rounded-[10px] border border-hairline bg-white px-3 py-2.5"
                      value={publishName}
                      onChange={(e) => setPublishName(e.target.value)}
                      placeholder="e.g. Creative"
                    />
                  </label>
                  <label className="block text-[15px]">
                    <span className="text-ink/50">Description</span>
                    <textarea
                      required
                      maxLength={500}
                      rows={2}
                      className="mt-1.5 w-full rounded-[10px] border border-hairline bg-white px-3 py-2.5"
                      value={publishDescription}
                      onChange={(e) => setPublishDescription(e.target.value)}
                      placeholder="What this state is good for"
                    />
                  </label>
                  <label className="block text-[15px]">
                    <span className="text-ink/50">System instruction</span>
                    <textarea
                      required
                      rows={6}
                      className="mt-1.5 w-full rounded-[10px] border border-hairline bg-white px-3 py-2.5 font-mono text-[13px]"
                      value={publishInstruction}
                      onChange={(e) => setPublishInstruction(e.target.value)}
                      placeholder="You are…"
                    />
                  </label>

                  <div>
                    <p className="text-[15px] text-ink/50">Tags (up to 3)</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {TAG_OPTIONS.map((tag) => {
                        const on = publishTags.includes(tag)
                        return (
                          <button
                            key={tag}
                            type="button"
                            className={`rounded-md border px-2.5 py-1 text-[13px] transition-colors ${filterChipClass(on)}`}
                            onClick={() => togglePublishTag(tag)}
                          >
                            {tag}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  <label className="flex cursor-pointer items-start gap-3 rounded-[10px] border border-hairline bg-white px-4 py-3">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={publishVisibility === 'public'}
                      onChange={(e) =>
                        setPublishVisibility(e.target.checked ? 'public' : 'private')
                      }
                    />
                    <span>
                      <span className="block text-[15px] font-medium">Make public</span>
                      <span className="mt-0.5 block text-[13px] text-ink/50">
                        List this state in the community gallery. Leave off to keep it private.
                      </span>
                    </span>
                  </label>

                  <div className="rounded-[10px] border border-hairline bg-paper-muted/40 p-4">
                    <button
                      type="button"
                      className="flex w-full items-center justify-between text-left text-[15px] font-medium"
                      onClick={() => setAdvancedOpen((o) => !o)}
                    >
                      <span>Advanced options</span>
                      <span className="text-ink/40">{advancedOpen ? 'Hide' : 'Show'}</span>
                    </button>
                    {advancedOpen && (
                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <label className="block text-[15px]">
                          <span className="text-ink/50">Temperature</span>
                          <input
                            type="number"
                            min={0}
                            max={2}
                            step={0.1}
                            className="mt-1.5 w-full rounded-[10px] border border-hairline bg-white px-3 py-2.5"
                            value={publishTemp}
                            onChange={(e) => setPublishTemp(e.target.value)}
                            placeholder="0.5"
                          />
                        </label>
                        <label className="block text-[15px]">
                          <span className="text-ink/50">Max tokens</span>
                          <input
                            type="number"
                            min={0}
                            step={1}
                            className="mt-1.5 w-full rounded-[10px] border border-hairline bg-white px-3 py-2.5"
                            value={publishMaxTokens}
                            onChange={(e) => setPublishMaxTokens(e.target.value)}
                            placeholder="0 = model default"
                          />
                        </label>
                        <label className="block text-[15px]">
                          <span className="text-ink/50">Frequency penalty</span>
                          <input
                            type="number"
                            min={-2}
                            max={2}
                            step={0.05}
                            className="mt-1.5 w-full rounded-[10px] border border-hairline bg-white px-3 py-2.5"
                            value={publishFreq}
                            onChange={(e) => setPublishFreq(e.target.value)}
                            placeholder="optional"
                          />
                        </label>
                        <label className="block text-[15px]">
                          <span className="text-ink/50">Presence penalty</span>
                          <input
                            type="number"
                            min={-2}
                            max={2}
                            step={0.05}
                            className="mt-1.5 w-full rounded-[10px] border border-hairline bg-white px-3 py-2.5"
                            value={publishPresence}
                            onChange={(e) => setPublishPresence(e.target.value)}
                            placeholder="optional"
                          />
                        </label>
                      </div>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={publishing}
                    className="pressable inline-flex min-h-11 w-fit items-center gap-2 rounded-[10px] bg-black px-5 text-[15px] font-semibold text-white disabled:opacity-60"
                  >
                    {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    {publishVisibility === 'public' ? 'Publish' : 'Save private'}
                  </button>
                </form>
              )}
            </Reveal>
          )}

          <div className="mb-6 space-y-3">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/35"
                strokeWidth={1.5}
              />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search states…"
                className="w-full rounded-[10px] border border-hairline bg-white py-2.5 pl-10 pr-10 text-[15px]"
              />
              {query && (
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-ink/40 hover:text-ink"
                  onClick={() => setQuery('')}
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" strokeWidth={1.5} />
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {scopeFilters.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className={`rounded-md border px-3 py-1.5 text-[13px] font-medium transition-colors ${filterChipClass(scope === f.id)}`}
                  onClick={() => {
                    if (f.id === 'saved' && !user) {
                      ensureAuth()
                      return
                    }
                    setScope(f.id)
                  }}
                >
                  {f.label}
                  {typeof f.count === 'number' ? (
                    <span className="ml-1.5 opacity-70">{f.count}</span>
                  ) : null}
                </button>
              ))}
              <span className="mx-1 hidden h-4 w-px bg-hairline sm:inline-block" aria-hidden />
              {TAG_OPTIONS.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  className={`rounded-md border px-2.5 py-1.5 text-[13px] transition-colors ${filterChipClass(activeTag === tag)}`}
                  onClick={() => setActiveTag((cur) => (cur === tag ? null : tag))}
                >
                  {tag}
                </button>
              ))}
              {(scope !== 'all' || activeTag || query) && (
                <button
                  type="button"
                  className="text-[13px] text-ink/45 hover:text-ink"
                  onClick={() => {
                    setScope('all')
                    setActiveTag(null)
                    setQuery('')
                  }}
                >
                  Clear
                </button>
              )}
            </div>

            {user && (
              <p className="text-[13px] text-ink/45">
                {libraryCount} on your account
                {defaultNames.length > 0 ? ' · includes defaults you can remove anytime' : ''}
                {scope === 'saved' ? ' · showing saved gallery matches' : ''}
              </p>
            )}
          </div>

          {filteredPosts === null ? (
            <p className="text-ink/50">Loading gallery…</p>
          ) : filteredPosts.length === 0 ? (
            <div className="card p-8 text-center">
              <h2 className="text-lg font-semibold">
                {posts && posts.length === 0 ? 'No states yet' : 'Nothing matches'}
              </h2>
              <p className="mt-2 text-ink/55">
                {posts && posts.length === 0
                  ? 'Be the first to publish a public state.'
                  : 'Try another filter, tag, or search term.'}
              </p>
              {(scope !== 'all' || activeTag || query) && (
                <button
                  type="button"
                  className="pressable mt-4 inline-flex min-h-10 items-center rounded-[10px] border border-hairline px-4 text-[14px]"
                  onClick={() => {
                    setScope('all')
                    setActiveTag(null)
                    setQuery('')
                  }}
                >
                  Reset filters
                </button>
              )}
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              <AnimatePresence mode="popLayout">
              {filteredPosts.map((post) => {
                const instruction = instructionOf(post.state)
                const isMine = Boolean(
                  user && myWorkosId && post.authorWorkosId === myWorkosId && !post.isOfficial,
                )
                const saved = isSaved(post)
                const freeIncluded =
                  Boolean(post.isOfficial) &&
                  !canPublishStates &&
                  defaultNames.includes(post.name)
                const tags = post.tags || []

                return (
                  <motion.div
                    key={post._id}
                    layout
                    initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={
                      reduceMotion
                        ? undefined
                        : { opacity: 0, scale: 0.96, transition: { duration: 0.22 } }
                    }
                    transition={{ duration: 0.22 }}
                  >
                    <article className="card flex h-full flex-col p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <h2 className="text-lg font-semibold">{post.name}</h2>
                            {post.isOfficial && (
                              <span className="rounded-md bg-black px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                                Official
                              </span>
                            )}
                            {freeIncluded ? (
                              <span className="rounded-md border border-hairline px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink/55">
                                Included
                              </span>
                            ) : saved ? (
                              <span className="rounded-md border border-hairline px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink/55">
                                Saved
                              </span>
                            ) : null}
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={busyId === `star-${post._id}`}
                          className="pressable inline-flex shrink-0 items-center gap-1 rounded-[8px] border border-hairline px-2 py-1 text-[13px] text-ink/70 disabled:opacity-60"
                          onClick={() => void handleStar(post)}
                          aria-label={post.starredByMe ? 'Unstar' : 'Star'}
                          title={post.starredByMe ? 'Unstar' : 'Star'}
                        >
                          <Star
                            className={`h-4 w-4 ${post.starredByMe ? 'fill-current text-ink' : ''}`}
                            strokeWidth={1.5}
                          />
                          {post.starCount ?? 0}
                        </button>
                      </div>

                      {tags.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {tags.map((tag) => (
                            <button
                              key={tag}
                              type="button"
                              className={`rounded-md border px-1.5 py-0.5 text-[11px] transition-colors ${filterChipClass(activeTag === tag)}`}
                              onClick={() => setActiveTag((cur) => (cur === tag ? null : tag))}
                            >
                              {tag}
                            </button>
                          ))}
                        </div>
                      )}

                      <p className="mt-2 line-clamp-2 text-[15px] text-ink/55">{post.description}</p>
                      <div className="mt-3">
                        <AuthorByline
                          workosId={post.authorWorkosId}
                          displayName={post.authorDisplayName}
                          avatarUrl={post.authorAvatarUrl}
                          isOfficial={post.isOfficial}
                        />
                      </div>
                      <p className="mt-2 text-[11px] uppercase tracking-[0.12em] text-ink/40">
                        {post.saveCount > 0 ? `${post.saveCount} saves · ` : ''}
                        {formatDate(post.createdAt)}
                      </p>
                      {instruction && (
                        <pre className="mt-3 max-h-24 overflow-hidden rounded-[8px] bg-paper-muted p-3 text-[12px] leading-relaxed text-ink/70 whitespace-pre-wrap">
                          {instruction}
                        </pre>
                      )}
                      <div className="mt-auto flex flex-wrap items-center gap-3 pt-5">
                        {freeIncluded ? (
                          <span className="inline-flex min-h-10 items-center rounded-[10px] border border-hairline px-4 text-[14px] font-medium text-ink/55">
                            Included on free
                          </span>
                        ) : post.isOfficial && !canPublishStates ? (
                          <Link
                            to="/account/billing"
                            className="pressable inline-flex min-h-10 items-center gap-2 rounded-[10px] border border-hairline px-4 text-[14px] font-medium text-ink/75"
                          >
                            Subscribe to unlock
                          </Link>
                        ) : saved ? (
                          <button
                            type="button"
                            disabled={busyId === `lib-${post._id}`}
                            className="pressable inline-flex min-h-10 items-center gap-2 rounded-[10px] border border-hairline px-4 text-[14px] font-medium text-ink/75 disabled:opacity-60"
                            onClick={() => void handleRemoveMine(post)}
                          >
                            {busyId === `lib-${post._id}` ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <BookmarkCheck className="h-4 w-4" strokeWidth={1.5} />
                            )}
                            Remove from account
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={busyId === post._id}
                            className="pressable inline-flex min-h-10 items-center gap-2 rounded-[10px] bg-black px-4 text-[14px] font-semibold text-white disabled:opacity-60"
                            onClick={() => void handleSave(post)}
                          >
                            {busyId === post._id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <BookmarkPlus className="h-4 w-4" strokeWidth={1.5} />
                            )}
                            Save to account
                          </button>
                        )}
                        {isMine && (
                          <button
                            type="button"
                            className="pressable inline-flex min-h-10 items-center rounded-[10px] border border-hairline px-4 text-[14px] font-medium text-ink/70"
                            onClick={() => openEdit(post)}
                          >
                            Edit
                          </button>
                        )}
                      </div>
                    </article>
                  </motion.div>
                )
              })}
              </AnimatePresence>
            </div>
          )}
        </div>
      </section>

      <AnimatePresence>
        {editingId && (
          <motion.div
            className="fixed inset-0 z-[80] flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.18 }}
          >
            <button
              type="button"
              aria-label="Close editor"
              className="absolute inset-0 bg-black/55"
              onClick={closeEdit}
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="edit-state-title"
              className="relative z-[1] flex max-h-[min(90vh,720px)] w-full max-w-lg flex-col overflow-hidden rounded-[14px] border border-hairline bg-white shadow-2xl"
              initial={reduceMotion ? false : { opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: 10, scale: 0.98 }}
              transition={{ duration: 0.2 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-3 border-b border-hairline px-5 py-4">
                <h2 id="edit-state-title" className="text-lg font-semibold">
                  Edit {editingPost ? `“${editingPost.name}”` : 'state'}
                </h2>
                <button
                  type="button"
                  className="pressable inline-flex h-9 w-9 items-center justify-center rounded-[8px] text-ink/50 hover:bg-paper-muted hover:text-ink"
                  onClick={closeEdit}
                  aria-label="Cancel"
                >
                  <X className="h-5 w-5" strokeWidth={1.5} />
                </button>
              </div>

              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
                <label className="block text-[14px]">
                  <span className="text-ink/50">Name</span>
                  <input
                    className="mt-1 w-full rounded-[10px] border border-hairline bg-white px-3 py-2"
                    maxLength={64}
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                  />
                </label>
                <label className="block text-[14px]">
                  <span className="text-ink/50">Description</span>
                  <textarea
                    className="mt-1 w-full rounded-[10px] border border-hairline bg-white px-3 py-2"
                    rows={2}
                    maxLength={500}
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                  />
                </label>
                <label className="block text-[14px]">
                  <span className="text-ink/50">System instruction</span>
                  <textarea
                    className="mt-1 w-full rounded-[10px] border border-hairline bg-white px-3 py-2 font-mono text-[13px]"
                    rows={5}
                    value={editInstruction}
                    onChange={(e) => setEditInstruction(e.target.value)}
                  />
                </label>
                <div>
                  <p className="text-[14px] text-ink/50">Tags (up to 3)</p>
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    {TAG_OPTIONS.map((tag) => {
                      const on = editTags.includes(tag)
                      return (
                        <button
                          key={tag}
                          type="button"
                          className={`rounded-md border px-2.5 py-1 text-[13px] ${filterChipClass(on)}`}
                          onClick={() =>
                            setEditTags((prev) =>
                              on
                                ? prev.filter((t) => t !== tag)
                                : prev.length >= 3
                                  ? prev
                                  : [...prev, tag],
                            )
                          }
                        >
                          {tag}
                        </button>
                      )
                    })}
                  </div>
                </div>
                <div>
                  <button
                    type="button"
                    className="text-[13px] font-medium text-ink/55 hover:text-ink"
                    onClick={() => setEditAdvanced((v) => !v)}
                  >
                    {editAdvanced ? 'Hide advanced options' : 'Advanced options'}
                  </button>
                  {editAdvanced && (
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <label className="block text-[13px]">
                        <span className="text-ink/50">Temperature</span>
                        <input
                          type="number"
                          step={0.1}
                          min={0}
                          max={2}
                          className="mt-1 w-full rounded-[8px] border border-hairline bg-white px-2 py-1.5"
                          value={editTemp}
                          onChange={(e) => setEditTemp(e.target.value)}
                        />
                      </label>
                      <label className="block text-[13px]">
                        <span className="text-ink/50">Max tokens</span>
                        <input
                          type="number"
                          step={1}
                          min={0}
                          className="mt-1 w-full rounded-[8px] border border-hairline bg-white px-2 py-1.5"
                          value={editMaxTokens}
                          onChange={(e) => setEditMaxTokens(e.target.value)}
                        />
                      </label>
                      <label className="block text-[13px]">
                        <span className="text-ink/50">Frequency penalty</span>
                        <input
                          type="number"
                          step={0.05}
                          className="mt-1 w-full rounded-[8px] border border-hairline bg-white px-2 py-1.5"
                          value={editFreq}
                          onChange={(e) => setEditFreq(e.target.value)}
                        />
                      </label>
                      <label className="block text-[13px]">
                        <span className="text-ink/50">Presence penalty</span>
                        <input
                          type="number"
                          step={0.05}
                          className="mt-1 w-full rounded-[8px] border border-hairline bg-white px-2 py-1.5"
                          value={editPresence}
                          onChange={(e) => setEditPresence(e.target.value)}
                        />
                      </label>
                    </div>
                  )}
                </div>

                <label className="flex cursor-pointer items-start gap-3 rounded-[10px] border border-hairline bg-white px-3 py-2.5">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={editVisibility === 'public'}
                    onChange={(e) =>
                      setEditVisibility(e.target.checked ? 'public' : 'private')
                    }
                  />
                  <span>
                    <span className="block text-[14px] font-medium">Public in gallery</span>
                    <span className="mt-0.5 block text-[12px] text-ink/50">
                      Uncheck to make this state private again.
                    </span>
                  </span>
                </label>
              </div>

              <div className="flex flex-wrap items-center gap-2 border-t border-hairline px-5 py-4">
                <button
                  type="button"
                  disabled={busyId === editingId}
                  className="pressable inline-flex min-h-10 items-center rounded-[10px] bg-black px-4 text-[14px] font-semibold text-white disabled:opacity-60"
                  onClick={() => void saveOwnedEdit()}
                >
                  {busyId === editingId ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    'Save'
                  )}
                </button>
                <button
                  type="button"
                  disabled={busyId === editingId}
                  className="pressable ml-auto inline-flex min-h-10 items-center gap-1.5 rounded-[10px] border border-red-200 px-4 text-[14px] text-red-700 disabled:opacity-60"
                  onClick={() => editingId && void handleDeleteOwned(editingId)}
                >
                  <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                  Delete
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
