import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthSessionProvider'
import { claimSignupQuota } from '../auth/claimSignup'
import './app/ChatView.css'

export default function AuthCallback() {
  const { user, isLoading, initError, getAccessToken } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (isLoading) return
    if (!user) return

    let cancelled = false
    ;(async () => {
      await claimSignupQuota(() => getAccessToken(), user.id)
      if (cancelled) return
      const returnTo = sessionStorage.getItem('auth:returnTo') || '/account'
      sessionStorage.removeItem('auth:returnTo')
      navigate(returnTo, { replace: true })
    })()

    return () => {
      cancelled = true
    }
  }, [isLoading, user, navigate, getAccessToken])

  return (
    <div className="chat-view">
      <div className="chat-auth-container">
        <div className="chat-auth-content">
          {isLoading || user ? (
            <>
              <div className="chat-loading-spinner" />
              <p>{user ? 'Opening…' : 'Finishing sign-in…'}</p>
            </>
          ) : (
            <>
              <h2>Sign-in did not complete</h2>
              <p>{initError?.message || 'Sign-in did not create a session. Try Sign In again from the app page.'}</p>
              <button className="chat-login-button" type="button" onClick={() => navigate('/app', { replace: true })}>
                Back to app
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
