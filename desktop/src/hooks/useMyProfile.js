import { useCallback, useEffect, useRef, useState } from 'react';
import { ConvexClient } from 'convex/browser';
import { api } from '../../../backend/convex/_generated/api';
import { convexUrl } from '../lib/convexUrls';

const electronAPI = typeof window !== 'undefined' ? window.electronAPI : null;

/**
 * Loads the signed-in user's display name + avatar for desktop chrome.
 */
export function useMyProfile() {
  const convexRef = useRef(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!electronAPI?.getAuthToken) {
      setProfile(null);
      setLoading(false);
      return;
    }
    try {
      const token = await electronAPI.getAuthToken();
      if (!token) {
        setProfile(null);
        setLoading(false);
        return;
      }
      if (!convexRef.current) {
        convexRef.current = new ConvexClient(convexUrl);
      }
      const client = convexRef.current;
      client.setAuth(async () => (await electronAPI.getAuthToken?.()) ?? token);
      const next = await client.query(api.users.getMyProfile, {});
      setProfile(next || null);
    } catch (err) {
      console.warn('[profile] load failed:', err);
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const unsubSuccess = electronAPI?.onAuthSuccess?.(() => {
      setLoading(true);
      void refresh();
    });
    const unsubLogout = electronAPI?.onAuthLogout?.(() => {
      setProfile(null);
      setLoading(false);
    });
    return () => {
      unsubSuccess?.();
      unsubLogout?.();
    };
  }, [refresh]);

  const displayName =
    profile?.displayName?.trim() ||
    profile?.email?.trim() ||
    null;
  const avatarUrl = profile?.avatarUrl ?? null;

  return {
    profile,
    loading,
    refresh,
    signedIn: Boolean(profile),
    displayName,
    avatarUrl,
  };
}
