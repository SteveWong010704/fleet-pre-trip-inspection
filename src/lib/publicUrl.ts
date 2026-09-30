// Helper for managing the public QR Scan Base URL (e.g. ngrok tunnel domain or custom domain)
// This enables QR codes generated while logged in via LAN (192.168.1.80) or localhost
// to direct mobile phones on cellular 4G to the public ngrok endpoint!
import { useState, useEffect } from 'react';

const LOCAL_STORAGE_KEY = 'FLEET_PUBLIC_QR_BASE_URL';
const PUBLIC_URL_EVENT = 'foms:public-url-changed';

let serverKnownPublicUrl: string = '';

/**
 * Checks if a given host or URL is local/private (not reachable over external mobile 4G)
 */
export function isLocalOrPrivateHost(inputUrl?: string): boolean {
  if (typeof window === 'undefined') return false;
  const target = inputUrl || window.location.hostname;
  let hostname = target;
  try {
    if (target.includes('://')) {
      hostname = new URL(target).hostname;
    }
  } catch {}

  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname.startsWith('192.168.') ||
    hostname.startsWith('10.') ||
    hostname.startsWith('172.16.') ||
    hostname.startsWith('172.17.') ||
    hostname.startsWith('172.18.') ||
    hostname.startsWith('172.19.') ||
    hostname.startsWith('172.20.') ||
    hostname.startsWith('172.21.') ||
    hostname.startsWith('172.22.') ||
    hostname.startsWith('172.23.') ||
    hostname.startsWith('172.24.') ||
    hostname.startsWith('172.25.') ||
    hostname.startsWith('172.26.') ||
    hostname.startsWith('172.27.') ||
    hostname.startsWith('172.28.') ||
    hostname.startsWith('172.29.') ||
    hostname.startsWith('172.30.') ||
    hostname.startsWith('172.31.')
  );
}

/**
 * Helper to clean and format URLs properly
 */
export function cleanUrl(url: string): string {
  let cleaned = (url || '').trim();
  if (!cleaned) return '';
  if (!/^https?:\/\//i.test(cleaned)) {
    cleaned = `https://${cleaned}`;
  }
  return cleaned.replace(/\/+$/, '');
}

/**
 * Returns the effective base URL used for QR code generation
 */
export function getPublicBaseUrl(): string {
  if (typeof window === 'undefined') return '';

  const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
  // If stored is an external public URL, use it
  if (stored && stored.trim() && !isLocalOrPrivateHost(stored.trim())) {
    return cleanUrl(stored.trim());
  }

  // If server has a known external ngrok/public URL, prioritize it
  if (serverKnownPublicUrl && !isLocalOrPrivateHost(serverKnownPublicUrl)) {
    return cleanUrl(serverKnownPublicUrl);
  }

  // If stored exists (even if local and no external found)
  if (stored && stored.trim()) {
    return cleanUrl(stored.trim());
  }

  return window.location.origin;
}

/**
 * Returns whether a custom ngrok or public domain has been configured
 */
export function hasCustomPublicBaseUrl(): boolean {
  if (typeof window === 'undefined') return false;
  const current = getPublicBaseUrl();
  return Boolean(current && !isLocalOrPrivateHost(current));
}

/**
 * Saves and synchronizes a new public QR base URL (e.g. https://xxxx.ngrok-free.app)
 */
export async function setPublicBaseUrl(url: string): Promise<string> {
  const cleaned = cleanUrl(url);
  if (typeof window !== 'undefined') {
    if (cleaned) {
      localStorage.setItem(LOCAL_STORAGE_KEY, cleaned);
    } else {
      localStorage.removeItem(LOCAL_STORAGE_KEY);
    }
  }

  serverKnownPublicUrl = cleaned;

  // Broadcast to all active components
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(PUBLIC_URL_EVENT, { detail: cleaned }));
  }

  // Also sync with server database settings
  try {
    await fetch('/api/settings/public-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ publicBaseUrl: cleaned }),
    });
  } catch {
    // Ignore offline/static failure
  }

  return cleaned || (typeof window !== 'undefined' ? window.location.origin : '');
}

/**
 * Resets the public base URL back to default window.location.origin
 */
export async function resetPublicBaseUrl(): Promise<string> {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(LOCAL_STORAGE_KEY);
  }
  serverKnownPublicUrl = '';

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(PUBLIC_URL_EVENT, { detail: window.location.origin }));
  }

  try {
    await fetch('/api/settings/public-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ publicBaseUrl: '' }),
    });
  } catch {}
  return typeof window !== 'undefined' ? window.location.origin : '';
}

/**
 * Syncs the publicBaseUrl from the server settings if available
 */
export async function syncPublicBaseUrlFromServer(): Promise<string | null> {
  try {
    const res = await fetch('/api/settings/public-url');
    if (res.ok) {
      const data = await res.json();
      if (data.publicBaseUrl && data.publicBaseUrl.trim()) {
        const cleaned = cleanUrl(data.publicBaseUrl.trim());
        serverKnownPublicUrl = cleaned;

        // If local storage was empty or was a LAN IP (e.g. 192.168.1.80), update it!
        if (typeof window !== 'undefined') {
          const currentStored = localStorage.getItem(LOCAL_STORAGE_KEY);
          if (!currentStored || isLocalOrPrivateHost(currentStored)) {
            localStorage.setItem(LOCAL_STORAGE_KEY, cleaned);
          }
          window.dispatchEvent(new CustomEvent(PUBLIC_URL_EVENT, { detail: cleaned }));
        }
        return cleaned;
      }
    }
  } catch {}
  return null;
}

/**
 * React hook to always have the latest publicBaseUrl in components
 */
export function usePublicBaseUrl(): string {
  const [url, setUrl] = useState<string>(() => getPublicBaseUrl());

  useEffect(() => {
    // Re-check in case server sync arrived
    setUrl(getPublicBaseUrl());

    const handler = (e: any) => {
      setUrl(e.detail || getPublicBaseUrl());
    };

    window.addEventListener(PUBLIC_URL_EVENT, handler);
    return () => {
      window.removeEventListener(PUBLIC_URL_EVENT, handler);
    };
  }, []);

  return url;
}

/**
 * Builds the vehicle inspection deep link encoded into QR stickers
 */
export function buildVehicleDeepLink(plate: string, customBaseUrl?: string): string {
  const base = customBaseUrl ? cleanUrl(customBaseUrl) : getPublicBaseUrl();
  const cleanPlate = (plate || '').trim().toUpperCase();
  return `${base}/?plate=${encodeURIComponent(cleanPlate)}&view=driver`;
}

/**
 * Builds the certificate inspection verification deep link
 */
export function buildCertDeepLink(certId: string, customBaseUrl?: string): string {
  const base = customBaseUrl ? cleanUrl(customBaseUrl) : getPublicBaseUrl();
  return `${base}/?certId=${encodeURIComponent((certId || '').trim())}`;
}

export const buildCertificateDeepLink = buildCertDeepLink;
