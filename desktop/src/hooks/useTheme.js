import { useEffect, useState } from 'react';

const api = typeof window !== 'undefined' ? window.electronAPI : null;

function applyPlatformClass() {
  const platform = api?.platform || (typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform) ? 'darwin' : '');
  if (!platform) return;
  document.documentElement.classList.add(`platform-${platform}`);
  if (platform === 'darwin') document.documentElement.classList.add('platform-mac');
}

export function applyTheme(effective) {
  const theme = effective === 'light' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', theme);
  document.documentElement.style.colorScheme = theme;
}

export async function initTheme() {
  applyPlatformClass();
  if (!api?.getTheme) {
    applyTheme('dark');
    return;
  }
  try {
    const { effective } = await api.getTheme();
    applyTheme(effective);
  } catch {
    applyTheme('dark');
  }
}

/** Keep this window’s theme in sync when Settings (or system) changes it. */
export function ThemeBridge({ children }) {
  useEffect(() => {
    void initTheme();
    const unsub = api?.onThemeChanged?.(({ effective }) => {
      applyTheme(effective);
    });
    return typeof unsub === 'function' ? unsub : undefined;
  }, []);

  return children ?? null;
}

export function useTheme() {
  const [preference, setPreference] = useState('system');
  const [effective, setEffective] = useState('dark');

  useEffect(() => {
    if (!api?.getTheme) return;
    api.getTheme().then(({ preference: pref, effective: eff }) => {
      setPreference(pref);
      setEffective(eff);
      applyTheme(eff);
    });
    const unsub = api.onThemeChanged?.(({ preference: pref, effective: eff }) => {
      setPreference(pref);
      setEffective(eff);
      applyTheme(eff);
    });
    return typeof unsub === 'function' ? unsub : undefined;
  }, []);

  const setTheme = async (pref) => {
    if (!api?.setTheme) return;
    const result = await api.setTheme(pref);
    if (result?.effective) {
      setPreference(pref);
      setEffective(result.effective);
      applyTheme(result.effective);
    }
  };

  return { preference, effective, setTheme };
}
