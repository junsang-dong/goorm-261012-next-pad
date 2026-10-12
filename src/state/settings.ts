import { useCallback, useEffect, useRef, useState } from 'react';
import { loadSettings, saveSettings, nativeErrorMessage } from '../native/commands';
import { DEFAULT_SETTINGS } from '../types';
import type { Settings } from '../types';

const SAVE_DEBOUNCE_MS = 450;

export function useSettings(onError: (message: string) => void) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadSettings()
      .then((loaded) => {
        if (!cancelled) setSettings(loaded);
      })
      .catch((err) => onError(nativeErrorMessage(err)));
    return () => {
      cancelled = true;
    };
    // Intentionally run once on mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateSettings = useCallback(
    (partial: Partial<Settings>) => {
      setSettings((prev) => {
        const next = { ...prev, ...partial };
        if (timerRef.current !== null) window.clearTimeout(timerRef.current);
        timerRef.current = window.setTimeout(() => {
          saveSettings(next).catch((err) => onError(nativeErrorMessage(err)));
        }, SAVE_DEBOUNCE_MS);
        return next;
      });
    },
    [onError],
  );

  return { settings, updateSettings };
}
