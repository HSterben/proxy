import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ConvexClient } from 'convex/browser'
import { Loader2, Trash2 } from 'lucide-react'
import { useAuth } from '../auth/AuthSessionProvider'
import { api } from '../convex/api'
import { convexUrl } from '../lib/convexUrls'
import ProfileAvatar from '../components/ui/ProfileAvatar'

type AccountSnapshot = {
  email?: string
  subscriptionActive: boolean
  status: string
  plan: string | null
  currentPeriodEnd?: number
  weightedTokensUsed: number
  weightedTokenLimit: number
  remaining: number
  canUseAI: boolean
  canCreateStates?: boolean
  canPublishStates?: boolean
  freeStateNames?: string[]
}

type MyProfile = {
  workosId: string
  email?: string
  displayName: string
  displayNameCustom: string | null
  avatarUrl: string | null
  hasCustomAvatar: boolean
}

type PublishedState = {
  _id: string
  name: string
  description: string
  tags: string[]
  visibility: 'public' | 'private'
  saveCount: number
  starCount: number
  createdAt: number
  state: {
    description?: string
    systemInstruction?: string
    system_instruction?: string
    temperature?: number
    maxTokens?: number
    frequencyPenalty?: number
    presencePenalty?: number
  }
}

const TAG_OPTIONS = ['Writing', 'Creative', 'Utility', 'Translation', 'Fun'] as const

function formatDate(ms?: number) {
  if (!ms) return 'n/a'
  return new Date(ms).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export default function Account() {
  const { user, isLoading, signIn, getAccessToken } = useAuth()
  const convex = useRef(new ConvexClient(convexUrl))
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [account, setAccount] = useState<AccountSnapshot | null | undefined>(undefined)
  const [profile, setProfile] = useState<MyProfile | null>(null)
  const [displayNameDraft, setDisplayNameDraft] = useState('')
  const [profileSaving, setProfileSaving] = useState(false)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [profileNotice, setProfileNotice] = useState('')
  const [profileError, setProfileError] = useState('')
  const [published, setPublished] = useState<PublishedState[] | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
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
  const [editVisibility, setEditVisibility] = useState<'public' | 'private'>('private')

  const refreshProfileAndPosts = async () => {
    const [mine, posts] = await Promise.all([
      convex.current.query(api.users.getMyProfile, {}),
      convex.current.query(api.gallery.listMine, {}),
    ])
    const p = mine as MyProfile | null
    setProfile(p)
    if (p) setDisplayNameDraft(p.displayNameCustom || p.displayName)
    setPublished((posts as PublishedState[]) || [])
  }

  useEffect(() => {
    if (!user) return
    convex.current.setAuth(async () => (await getAccessToken()) ?? null)
    void (async () => {
      try {
        await convex.current.mutation(api.states.ensureMyLibrary, {})
      } catch {
        // migration optional until Convex is reachable
      }
      void convex.current
        .query(api.account.getMyAccount, {})
        .then((data) => setAccount(data as AccountSnapshot | null))
        .catch(() => setAccount(null))
      void refreshProfileAndPosts().catch(() => {
        setProfile(null)
        setPublished([])
      })
    })()
  }, [user, getAccessToken])

  const showProfileNotice = (text: string) => {
    setProfileNotice(text)
    window.setTimeout(() => setProfileNotice(''), 2800)
  }

  const saveDisplayName = async () => {
    if (!user) return
    setProfileSaving(true)
    setProfileError('')
    try {
      convex.current.setAuth(async () => (await getAccessToken()) ?? null)
      await convex.current.mutation(api.users.updateMyProfile, {
        displayName: displayNameDraft,
      })
      await refreshProfileAndPosts()
      showProfileNotice('Display name saved')
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'Could not save name')
    } finally {
      setProfileSaving(false)
    }
  }

  const resetDisplayName = async () => {
    if (!user) return
    setProfileSaving(true)
    setProfileError('')
    try {
      await convex.current.mutation(api.users.updateMyProfile, {
        clearDisplayName: true,
      })
      await refreshProfileAndPosts()
      showProfileNotice('Using account name again')
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'Could not reset name')
    } finally {
      setProfileSaving(false)
    }
  }

  const onAvatarSelected = async (file: File | null) => {
    if (!file || !user) return
    if (!file.type.startsWith('image/')) {
      setProfileError('Choose an image file')
      return
    }
    if (file.size > 4 * 1024 * 1024) {
      setProfileError('Image must be under 4MB')
      return
    }
    setAvatarUploading(true)
    setProfileError('')
    try {
      convex.current.setAuth(async () => (await getAccessToken()) ?? null)
      const uploadUrl = (await convex.current.mutation(
        api.users.generateAvatarUploadUrl,
        {},
      )) as string
      const result = await fetch(uploadUrl, {
        method: 'POST',
        headers: { 'Content-Type': file.type },
        body: file,
      })
      if (!result.ok) throw new Error('Upload failed')
      const { storageId } = (await result.json()) as { storageId: string }
      await convex.current.mutation(api.users.updateMyProfile, {
        avatarStorageId: storageId,
      })
      await refreshProfileAndPosts()
      showProfileNotice('Profile picture updated')
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'Could not upload picture')
    } finally {
      setAvatarUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const clearAvatar = async () => {
    if (!user) return
    setAvatarUploading(true)
    setProfileError('')
    try {
      await convex.current.mutation(api.users.updateMyProfile, { clearAvatar: true })
      await refreshProfileAndPosts()
      showProfileNotice('Profile picture removed')
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'Could not remove picture')
    } finally {
      setAvatarUploading(false)
    }
  }

  const openEdit = (post: PublishedState) => {
    setEditingId(post._id)
    setEditName(post.name)
    setEditDescription(post.description)
    setEditInstruction(
      post.state?.systemInstruction || post.state?.system_instruction || '',
    )
    setEditTags(post.tags || [])
    setEditTemp(
      typeof post.state?.temperature === 'number' ? String(post.state.temperature) : '',
    )
    setEditFreq(
      typeof post.state?.frequencyPenalty === 'number'
        ? String(post.state.frequencyPenalty)
        : '',
    )
    setEditPresence(
      typeof post.state?.presencePenalty === 'number'
        ? String(post.state.presencePenalty)
        : '',
    )
    setEditMaxTokens(
      typeof post.state?.maxTokens === 'number' ? String(post.state.maxTokens) : '',
    )
    setEditAdvanced(
      typeof post.state?.frequencyPenalty === 'number' ||
        typeof post.state?.presencePenalty === 'number' ||
        typeof post.state?.maxTokens === 'number' ||
        typeof post.state?.temperature === 'number',
    )
    setEditVisibility(post.visibility === 'public' ? 'public' : 'private')
    setProfileError('')
  }

  const closeEdit = () => {
    setEditingId(null)
  }

  const parseOptionalNumber = (raw: string, intOnly = false): number | undefined => {
    const s = raw.trim()
    if (!s) return undefined
    const n = intOnly ? parseInt(s, 10) : parseFloat(s)
    return Number.isFinite(n) ? n : undefined
  }

  const savePublishedEdit = async () => {
    if (!editingId) return
    setBusyId(editingId)
    setProfileError('')
    try {
      const state: PublishedState['state'] = {
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
      await refreshProfileAndPosts()
      closeEdit()
      showProfileNotice('State updated')
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'Could not save changes')
    } finally {
      setBusyId(null)
    }
  }

  const removePublished = async (postId: string) => {
    setBusyId(postId)
    setProfileError('')
    try {
      await convex.current.mutation(api.gallery.remove, {
        stateId: postId as never,
      })
      setPublished((prev) => (prev ? prev.filter((p) => p._id !== postId) : prev))
      if (editingId === postId) closeEdit()
      showProfileNotice('State deleted')
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'Could not delete')
    } finally {
      setBusyId(null)
    }
  }

  if (isLoading) {
    return <div className="page py-20 text-ink/50">Loading…</div>
  }

  if (!user) {
    return (
      <div className="page flex min-h-[50vh] flex-col items-center justify-center gap-4 py-20 text-center">
        <h1 className="display text-2xl font-semibold">Sign in to your PROXY account</h1>
        <p className="max-w-md text-ink/55">
          Manage your profile, published states, plan, and usage for web and Windows.
        </p>
        <button
          type="button"
          className="pressable rounded-[10px] bg-black px-5 py-3 text-[15px] font-semibold text-white"
          onClick={() => void signIn({ state: { returnTo: '/account' } })}
        >
          Log in
        </button>
      </div>
    )
  }

  const usagePct = account
    ? Math.min(
        100,
        Math.round(
          (account.weightedTokensUsed /
            Math.max(account.weightedTokenLimit, 1)) *
            100,
        ),
      )
    : 0
  const remainingPct = Math.max(0, 100 - usagePct)

  return (
    <div className="page py-12 md:py-16">
      <p className="eyebrow">Account</p>
      <h1 className="display mt-3 text-3xl font-semibold">Your PROXY account</h1>
      <p className="mt-3 max-w-xl text-ink/55">
        Edit your public profile, manage states you own, and open billing when you need to change plans.
      </p>

      {(profileNotice || profileError) && (
        <div
          className={`mt-6 rounded-[10px] border px-4 py-3 text-[15px] ${
            profileError
              ? 'border-red-200 bg-red-50 text-red-800'
              : 'border-hairline bg-white text-ink'
          }`}
        >
          {profileError || profileNotice}
        </div>
      )}

      <section className="card mt-8 p-6 md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Public profile</h2>
            <p className="mt-1 text-[15px] text-ink/55">
              Shown as “Published by” on community states.
            </p>
          </div>
          {profile && (
            <Link
              to={`/u/${encodeURIComponent(profile.workosId)}`}
              className="text-[14px] font-medium text-ink/60 hover:text-ink"
            >
              View public profile
            </Link>
          )}
        </div>

        <div className="mt-6 flex flex-col gap-8 sm:flex-row sm:items-start sm:gap-10">
          <div className="flex flex-col items-start gap-3">
            <ProfileAvatar
              name={profile?.displayName || user.email || 'You'}
              src={profile?.avatarUrl}
              size="lg"
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => void onAvatarSelected(e.target.files?.[0] ?? null)}
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={avatarUploading}
                className="pressable inline-flex min-h-9 items-center rounded-[8px] border border-hairline px-3 text-[13px] disabled:opacity-60"
                onClick={() => fileInputRef.current?.click()}
              >
                {avatarUploading ? 'Uploading…' : 'Change photo'}
              </button>
              {profile?.hasCustomAvatar && (
                <button
                  type="button"
                  disabled={avatarUploading}
                  className="pressable inline-flex min-h-9 items-center rounded-[8px] px-3 text-[13px] text-ink/55 hover:text-ink disabled:opacity-60"
                  onClick={() => void clearAvatar()}
                >
                  Remove
                </button>
              )}
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <label className="flex max-w-md flex-col gap-2 text-[15px]" htmlFor="display-name">
              <span className="font-medium text-ink/70">Display name</span>
              <input
                id="display-name"
                className="w-full rounded-[10px] border border-hairline bg-white px-3 py-2.5"
                maxLength={48}
                value={displayNameDraft}
                onChange={(e) => setDisplayNameDraft(e.target.value)}
                placeholder="How you appear on states"
              />
            </label>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={profileSaving || !displayNameDraft.trim()}
                className="pressable inline-flex min-h-10 items-center rounded-[10px] bg-black px-4 text-[14px] font-semibold text-white disabled:opacity-60"
                onClick={() => void saveDisplayName()}
              >
                {profileSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save name'}
              </button>
              {profile?.displayNameCustom && (
                <button
                  type="button"
                  disabled={profileSaving}
                  className="pressable inline-flex min-h-10 items-center rounded-[10px] border border-hairline px-4 text-[14px] disabled:opacity-60"
                  onClick={() => void resetDisplayName()}
                >
                  Reset to account name
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="card mt-4 p-6 md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Your states</h2>
            <p className="mt-1 text-[15px] text-ink/55">
              States you created. New ones stay private unless you turn on Make public.
            </p>
          </div>
          <Link
            to="/states"
            className="text-[14px] font-medium text-ink/60 hover:text-ink"
          >
            Open gallery
          </Link>
        </div>

        {published === null ? (
          <p className="mt-4 text-ink/50">Loading…</p>
        ) : published.length === 0 ? (
          <p className="mt-4 text-[15px] text-ink/55">
            You have not created any states yet.{' '}
            <Link to="/states" className="font-medium text-ink underline-offset-2 hover:underline">
              Create one
            </Link>
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-hairline">
            {published.map((post) => {
              const isEditing = editingId === post._id
              const isPublic = post.visibility === 'public'
              return (
                <li key={post._id} className="py-3">
                  {!isEditing ? (
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium">{post.name}</p>
                          <span
                            className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                              isPublic
                                ? 'border-hairline text-ink/55'
                                : 'border-hairline bg-paper-muted text-ink/45'
                            }`}
                          >
                            {isPublic ? 'Public' : 'Private'}
                          </span>
                        </div>
                        <p className="truncate text-[14px] text-ink/50">
                          {post.description}
                          {post.starCount > 0 ? ` · ${post.starCount} stars` : ''}
                          {post.saveCount > 0 ? ` · ${post.saveCount} saves` : ''}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="pressable inline-flex shrink-0 items-center rounded-[8px] border border-hairline px-3 py-1.5 text-[13px] text-ink/70"
                        onClick={() => openEdit(post)}
                      >
                        Edit
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3 rounded-[10px] border border-hairline bg-paper-muted/40 p-4">
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
                                className={`rounded-md border px-2.5 py-1 text-[13px] ${
                                  on
                                    ? 'border-black bg-black text-white'
                                    : 'border-hairline bg-white text-ink/70'
                                }`}
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
                          <span className="block text-[14px] font-medium">
                            Public in gallery
                          </span>
                          <span className="mt-0.5 block text-[12px] text-ink/50">
                            Uncheck to keep this state private.
                          </span>
                        </span>
                      </label>
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <button
                          type="button"
                          disabled={busyId === post._id}
                          className="pressable inline-flex min-h-10 items-center rounded-[10px] bg-black px-4 text-[14px] font-semibold text-white disabled:opacity-60"
                          onClick={() => void savePublishedEdit()}
                        >
                          {busyId === post._id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            'Save changes'
                          )}
                        </button>
                        <button
                          type="button"
                          disabled={busyId === post._id}
                          className="pressable inline-flex min-h-10 items-center rounded-[10px] border border-hairline px-4 text-[14px] disabled:opacity-60"
                          onClick={closeEdit}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={busyId === post._id}
                          className="pressable ml-auto inline-flex min-h-10 items-center gap-1.5 rounded-[10px] border border-red-200 px-4 text-[14px] text-red-700 disabled:opacity-60"
                          onClick={() => void removePublished(post._id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                          Delete
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="card p-6 md:p-8">
          <h2 className="text-lg font-semibold">Subscription</h2>
          {account === undefined ? (
            <p className="mt-4 text-ink/50">Loading…</p>
          ) : (
            <dl className="mt-5 space-y-3 text-[15px]">
              <div className="flex justify-between gap-4 border-b border-hairline pb-3">
                <dt className="text-ink/50">Email</dt>
                <dd>{account?.email ?? user.email ?? 'n/a'}</dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-hairline pb-3">
                <dt className="text-ink/50">Status</dt>
                <dd className="capitalize">
                  {account?.subscriptionActive
                    ? account.status
                    : account?.status === 'none'
                      ? 'Free'
                      : account?.status}
                </dd>
              </div>
              {account?.plan && (
                <div className="flex justify-between gap-4 border-b border-hairline pb-3">
                  <dt className="text-ink/50">Plan</dt>
                  <dd>{account.plan === 'free' ? 'Free' : account.plan}</dd>
                </div>
              )}
              {account?.currentPeriodEnd && account.subscriptionActive && (
                <div className="flex justify-between gap-4">
                  <dt className="text-ink/50">Renews</dt>
                  <dd>{formatDate(account.currentPeriodEnd)}</dd>
                </div>
              )}
            </dl>
          )}
          <Link
            to="/account/billing"
            className="pressable mt-6 inline-flex min-h-11 items-center rounded-[10px] bg-black px-5 text-[15px] font-semibold text-white"
          >
            Manage billing
          </Link>
        </section>

        <section className="card p-6 md:p-8">
          <h2 className="text-lg font-semibold">
            {account?.subscriptionActive ? 'Usage this period' : 'Free lifetime usage'}
          </h2>
          {account && (
            <>
              <p className="mt-2 text-[14px] text-ink/55">
                {account.subscriptionActive
                  ? 'Monthly chat allowance on your paid plan.'
                  : 'Free plan includes a lifetime chat allowance and three states. Subscribe for more.'}
              </p>
              <dl className="mt-5 space-y-3 text-[15px]">
                <div className="flex justify-between gap-4 border-b border-hairline pb-3">
                  <dt className="text-ink/50">Remaining</dt>
                  <dd>{remainingPct}%</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-ink/50">Used</dt>
                  <dd>{usagePct}%</dd>
                </div>
              </dl>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-hairline">
                <div
                  className="h-full rounded-full bg-brand transition-[width] duration-300"
                  style={{ width: `${usagePct}%` }}
                />
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  )
}
