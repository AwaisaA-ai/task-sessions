import { useCallback, useEffect, useState } from 'react';

/**
 * UI preferences are not user data: they live in localStorage so they stay
 * available before the database opens and never travel through sync.
 */
export type ThemePreference = 'system' | 'light' | 'dark';

export interface AppSettings {
  theme: ThemePreference;
  reducedMotion: boolean;
}

const THEME_KEY = 'task-sessions:theme';
const REDUCED_MOTION_KEY = 'task-sessions:reduced-motion';
const DARK_QUERY = '(prefers-color-scheme: dark)';
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

const THEMES: readonly ThemePreference[] = ['system', 'light', 'dark'];

function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === 'string' && (THEMES as readonly string[]).includes(value);
}

function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage can be unavailable in hardened environments; preferences just
    // fall back to this session's in-memory state.
  }
}

function mediaMatches(query: string): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(query).matches;
}

function resolveTheme(theme: ThemePreference): 'light' | 'dark' {
  if (theme === 'system') return mediaMatches(DARK_QUERY) ? 'dark' : 'light';
  return theme;
}

export function readAppSettings(): AppSettings {
  const storedTheme = readStored(THEME_KEY);
  const storedReducedMotion = readStored(REDUCED_MOTION_KEY);

  return {
    theme: isThemePreference(storedTheme) ? storedTheme : 'system',
    reducedMotion:
      storedReducedMotion === null
        ? mediaMatches(REDUCED_MOTION_QUERY)
        : storedReducedMotion === 'true',
  };
}

/**
 * Writes the resolved theme to the root element. CSS keys off `data-theme`
 * (light/dark) and `data-reduced-motion`, so "system" is resolved here rather
 * than duplicated in media queries.
 */
export function applyAppSettings(settings: AppSettings): void {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;
  root.dataset.theme = resolveTheme(settings.theme);
  root.dataset.themePreference = settings.theme;
  root.dataset.reducedMotion = settings.reducedMotion ? 'true' : 'false';
}

export function useAppSettings() {
  const [settings, setSettings] = useState<AppSettings>(readAppSettings);

  useEffect(() => {
    applyAppSettings(settings);
    writeStored(THEME_KEY, settings.theme);
    writeStored(REDUCED_MOTION_KEY, String(settings.reducedMotion));
  }, [settings]);

  // When the preference is "system", follow OS theme changes live.
  useEffect(() => {
    if (settings.theme !== 'system') return;
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;

    const media = window.matchMedia(DARK_QUERY);
    const handleChange = () => applyAppSettings(settings);
    media.addEventListener('change', handleChange);
    return () => media.removeEventListener('change', handleChange);
  }, [settings]);

  const setTheme = useCallback((theme: ThemePreference) => {
    setSettings((current) => ({ ...current, theme }));
  }, []);

  const setReducedMotion = useCallback((reducedMotion: boolean) => {
    setSettings((current) => ({ ...current, reducedMotion }));
  }, []);

  return { settings, setTheme, setReducedMotion };
}

// Apply before React's first paint so a saved dark theme does not flash light.
if (typeof document !== 'undefined') {
  applyAppSettings(readAppSettings());
}
