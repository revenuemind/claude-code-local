'use client';
import { useEffect, useState } from 'react';
import type { EnginePreferences } from '../providers/types';
import type { ClientProvider } from './types';
import { apiFetch } from './api';

export interface EnginesData {
  providers: ClientProvider[];
  credentials: Array<{ id: string; providerId: string; label: string; keyHint: string; createdAt: string; lastUsedAt: string | null; config: Record<string, string> }>;
  preferences: EnginePreferences;
}

let cache: Promise<EnginesData> | null = null;

export function useEngines(): { data: EnginesData | null; refresh: () => void } {
  const [data, setData] = useState<EnginesData | null>(null);
  const load = (force = false) => {
    if (!cache || force) cache = apiFetch<EnginesData>('/api/engines');
    cache.then(setData).catch(() => { cache = null; });
  };
  useEffect(() => { load(); }, []);
  return { data, refresh: () => load(true) };
}

/** Providers usable for a capability: built-in, or implemented with a connected key / platform key. */
export function usableProviders(d: EnginesData | null, cap: string): ClientProvider[] {
  if (!d) return [];
  return d.providers.filter((p) => p.capabilities.includes(cap) && (p.status === 'builtin' || (p.status === 'implemented' && (d.credentials.some((c) => c.providerId === p.id) || (d.preferences.allowPlatformCredentials && p.platformKeyAvailable)))));
}
