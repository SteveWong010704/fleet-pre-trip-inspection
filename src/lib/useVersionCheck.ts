import { useCallback, useEffect, useRef, useState } from 'react';

const CHECK_INTERVAL_MS = 5 * 60 * 1000;

async function fetchVersion(): Promise<string | null> {
  try {
    const res = await fetch('/api/version', { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data?.version === 'string' ? data.version : null;
  } catch {
    return null;
  }
}

/**
 * Detects that a newer build was deployed while this page stayed open (phones keep tabs and
 * home-screen apps alive for days). When `canAutoReload` is true the page reloads by itself;
 * otherwise `updateAvailable` lets the UI offer a manual refresh, so work in progress
 * (photos, forms) is never thrown away.
 */
export function useVersionCheck(canAutoReload: boolean) {
  const loadedVersion = useRef<string | null>(null);
  const [updateAvailable, setUpdateAvailable] = useState(false);

  const reload = useCallback(() => window.location.reload(), []);

  const check = useCallback(async () => {
    const latest = await fetchVersion();
    if (!latest) return;
    if (loadedVersion.current === null) {
      loadedVersion.current = latest;
      return;
    }
    if (latest !== loadedVersion.current) setUpdateAvailable(true);
  }, []);

  useEffect(() => {
    check();
    const timer = window.setInterval(check, CHECK_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') check();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [check]);

  useEffect(() => {
    if (updateAvailable && canAutoReload) reload();
  }, [updateAvailable, canAutoReload, reload]);

  return { updateAvailable, reload };
}
