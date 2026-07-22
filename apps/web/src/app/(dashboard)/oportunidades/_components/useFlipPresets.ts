// Presets guardables de filtros flip — persisten en localStorage.
//
// No usamos DB para esto porque:
//  - Es uso interno (Marc + socios). No es multi-tenant todavía.
//  - localStorage es instantáneo, sin roundtrip.
//  - Trivial de migrar a DB cuando lo necesitemos (mismo shape).

'use client';

import { useCallback, useEffect, useState } from 'react';
import type { FlipFilterState } from './FlipFilters';

const STORAGE_KEY = 'lince:flip-presets:v1';

export interface FlipPreset {
  id: string;
  name: string;
  createdAt: string; // ISO
  filters: FlipFilterStateSerialized;
}

/** Serialización plana (Set → array) para JSON.stringify. */
export interface FlipFilterStateSerialized {
  eurM2Reform: number;
  maxTotalInvestment: number | null;
  minGrossMarginEur: number | null;
  minGrossMarginPct: number | null;
  minM2: number | null;
  maxM2: number | null;
  tiers: Array<'A' | 'B' | 'C' | 'D'>;
  excludeNegativeMomentum: boolean;
}

export function serializeFlipFilters(s: FlipFilterState): FlipFilterStateSerialized {
  return {
    eurM2Reform: s.eurM2Reform,
    maxTotalInvestment: s.maxTotalInvestment,
    minGrossMarginEur: s.minGrossMarginEur,
    minGrossMarginPct: s.minGrossMarginPct,
    minM2: s.minM2,
    maxM2: s.maxM2,
    tiers: Array.from(s.tiers),
    excludeNegativeMomentum: s.excludeNegativeMomentum,
  };
}

export function deserializeFlipFilters(s: FlipFilterStateSerialized): FlipFilterState {
  return {
    eurM2Reform: s.eurM2Reform,
    maxTotalInvestment: s.maxTotalInvestment,
    minGrossMarginEur: s.minGrossMarginEur,
    minGrossMarginPct: s.minGrossMarginPct,
    minM2: s.minM2,
    maxM2: s.maxM2,
    tiers: new Set(s.tiers),
    excludeNegativeMomentum: s.excludeNegativeMomentum,
  };
}

interface UseFlipPresetsResult {
  presets: FlipPreset[];
  save: (name: string, state: FlipFilterState) => FlipPreset;
  remove: (id: string) => void;
  rename: (id: string, name: string) => void;
}

/**
 * Hook para gestionar presets en localStorage. Es reactivo: si cambias
 * localStorage desde otro tab, refresca (vía evento storage).
 */
export function useFlipPresets(): UseFlipPresetsResult {
  const [presets, setPresets] = useState<FlipPreset[]>([]);

  // Cargar al montar. El setState va dentro del effect a propósito: hidratamos
  // desde localStorage solo en cliente para evitar un mismatch de hidratación
  // SSR (loadFromStorage devuelve [] en server). Es una carga única al montar,
  // no un bucle de renders, así que la regla no aplica aquí.
  useEffect(() => {
    const loaded = loadFromStorage();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hidratación única en cliente (ver nota arriba)
    setPresets(loaded);

    function onStorage(e: StorageEvent) {
      if (e.key === STORAGE_KEY) setPresets(loadFromStorage());
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const persist = useCallback((next: FlipPreset[]) => {
    setPresets(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // localStorage lleno o desactivado — fallamos en silencio (UI ya tiene el state)
    }
  }, []);

  const save = useCallback(
    (name: string, state: FlipFilterState): FlipPreset => {
      const preset: FlipPreset = {
        id:
          typeof crypto !== 'undefined' && crypto.randomUUID
            ? crypto.randomUUID()
            : String(Date.now()),
        name: name.trim() || 'Sin nombre',
        createdAt: new Date().toISOString(),
        filters: serializeFlipFilters(state),
      };
      persist([preset, ...presets]);
      return preset;
    },
    [persist, presets],
  );

  const remove = useCallback(
    (id: string) => persist(presets.filter((p) => p.id !== id)),
    [persist, presets],
  );

  const rename = useCallback(
    (id: string, name: string) =>
      persist(presets.map((p) => (p.id === id ? { ...p, name: name.trim() || p.name } : p))),
    [persist, presets],
  );

  return { presets, save, remove, rename };
}

function loadFromStorage(): FlipPreset[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidPreset);
  } catch {
    return [];
  }
}

function isValidPreset(p: unknown): p is FlipPreset {
  if (!p || typeof p !== 'object') return false;
  const obj = p as Record<string, unknown>;
  return (
    typeof obj.id === 'string' &&
    typeof obj.name === 'string' &&
    typeof obj.createdAt === 'string' &&
    typeof obj.filters === 'object' &&
    obj.filters !== null
  );
}
