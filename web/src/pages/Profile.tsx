import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ConvexClient } from 'convex/browser'
import { Loader2, Star } from 'lucide-react'
import { useAuth } from '../auth/AuthSessionProvider'
import { api } from '../convex/api'
import { convexUrl } from '../lib/convexUrls'
import { userFacingError } from '../lib/userFacingError'
import ProfileAvatar from '../components/ui/ProfileAvatar'
import Reveal from '../components/ui/Reveal'

type PublicProfile = {
  workosId: string
  displayName: string
  avatarUrl: string | null
  isOfficial: boolean
  isMe: boolean
  publishedCount: number
}

type PublishedState = {
  _id: string
  name: string
  description: string
  tags: string[]
  saveCount: number
  starCount: number
  createdAt: number
}

function formatDate(ms: number) {
  return new Date(ms).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export default function Profile() {
  const { workosId: rawId } = useParams()
  const workosId = decodeURIComponent(rawId || '').trim()
  const { getAccessToken, user } = useAuth()
  const convex = useRef(new ConvexClient(convexUrl))
  const [profile, setProfile] = useState<PublicProfile | null | undefined>(undefined)
  const [posts, setPosts] = useState<PublishedState[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!workosId) {
      setProfile(null)
      setPosts([])
      return
    }
    let cancelled = false
    void (async () => {
      try {
        if (user) {
          convex.current.setAuth(async () => (await getAccessToken()) ?? null)
        }
        const [p, list] = await Promise.all([
          convex.current.query(api.users.getPublicProfile, { workosId }),
          convex.current.query(api.gallery.listByAuthor, {
            workosId,
            limit: 80,
          }),
        ])
        if (cancelled) return
        setProfile((p as PublicProfile | null) ?? null)
        setPosts((list as PublishedState[]) || [])
      } catch (err) {
        if (cancelled) return
        console.error(err)
        setError(userFacingError(err, 'Could not load profile'))
        setProfile(null)
        setPosts([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [workosId, user, getAccessToken])

  if (profile === undefined) {
    return (
      <div className="page flex min-h-[40vh] items-center justify-center py-20 text-ink/50">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="page py-20 text-center">
        <h1 className="display text-2xl font-semibold">Profile not found</h1>
        <p className="mt-3 text-ink/55">No public states on this profile yet.</p>
        <Link to="/states" className="pressable mt-6 inline-flex min-h-11 items-center rounded-[10px] bg-black px-5 text-[15px] font-semibold text-white">
          Browse states
        </Link>
      </div>
    )
  }

  return (
    <div className="page py-12 md:py-16">
      {error && (
        <div className="mb-4 rounded-[10px] border border-red-200 bg-red-50 px-4 py-3 text-[15px] text-red-800">
          {error}
        </div>
      )}

      <Reveal className="card flex flex-col items-start gap-5 p-6 sm:flex-row sm:items-center md:p-8">
        <ProfileAvatar name={profile.displayName} src={profile.avatarUrl} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="eyebrow">{profile.isOfficial ? 'Official PROXY' : 'Member'}</p>
          <h1 className="display mt-2 text-3xl font-semibold">{profile.displayName}</h1>
          <p className="mt-2 text-[15px] text-ink/55">
            {profile.publishedCount} published state{profile.publishedCount === 1 ? '' : 's'}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {profile.isMe && (
              <Link
                to="/account"
                className="pressable inline-flex min-h-10 items-center rounded-[10px] bg-black px-4 text-[14px] font-semibold text-white"
              >
                Edit profile
              </Link>
            )}
            <Link
              to="/states"
              className="pressable inline-flex min-h-10 items-center rounded-[10px] border border-hairline px-4 text-[14px] font-medium"
            >
              Community gallery
            </Link>
          </div>
        </div>
      </Reveal>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Published states</h2>
        {posts === null ? (
          <p className="mt-4 text-ink/50">Loading…</p>
        ) : posts.length === 0 ? (
          <p className="mt-4 text-ink/55">No published states yet.</p>
        ) : (
          <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {posts.map((post, i) => (
              <Reveal key={post._id} delay={Math.min(i, 10) * 30}>
                <article className="card flex h-full flex-col p-5">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-lg font-semibold">{post.name}</h3>
                    <span className="inline-flex items-center gap-1 text-[13px] text-ink/50">
                      <Star className="h-3.5 w-3.5" strokeWidth={1.5} />
                      {post.starCount ?? 0}
                    </span>
                  </div>
                  <p className="mt-2 line-clamp-2 text-[15px] text-ink/55">{post.description}</p>
                  {(post.tags?.length ?? 0) > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {post.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-md border border-hairline px-1.5 py-0.5 text-[11px] text-ink/55"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                  <p className="mt-auto pt-4 text-[11px] uppercase tracking-[0.12em] text-ink/40">
                    {formatDate(post.createdAt)}
                    {post.saveCount > 0 ? ` · ${post.saveCount} saves` : ''}
                  </p>
                </article>
              </Reveal>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
