'use client';

import { Download, Search, X } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const SCORE_OPTIONS = [
  { value: 'all', label: 'Cualquier score' },
  { value: '50', label: 'Score ≥ 50' },
  { value: '70', label: 'Score ≥ 70' },
  { value: '80', label: 'Score ≥ 80' },
  { value: '90', label: 'Score ≥ 90' },
];

const TYPE_OPTIONS = [
  { value: 'all', label: 'Cualquier tipo' },
  { value: 'piso', label: 'Piso' },
  { value: 'atico', label: 'Ático' },
  { value: 'casa', label: 'Casa' },
  { value: 'duplex', label: 'Dúplex' },
  { value: 'local', label: 'Local' },
];

const PRICE_OPTIONS = [
  { value: 'all', label: 'Sin tope' },
  { value: '250000', label: 'hasta 250 K€' },
  { value: '400000', label: 'hasta 400 K€' },
  { value: '600000', label: 'hasta 600 K€' },
  { value: '1000000', label: 'hasta 1 M€' },
];

const SORT_OPTIONS = [
  { value: 'flip_margin_eur', label: 'Mayor margen flip €' },
  { value: 'flip_margin_pct', label: 'Mayor margen flip %' },
  { value: 'score', label: 'Mejor score' },
  { value: 'delta', label: 'Mayor Δ vs zona' },
  { value: 'price_asc', label: 'Precio: menor primero' },
  { value: 'price_desc', label: 'Precio: mayor primero' },
  { value: 'eurm2_asc', label: '€/m²: más barato primero' },
  { value: 'new', label: 'Más recientes' },
];

const ORIGIN_OPTIONS = [
  { value: 'all', label: 'Cualquier origen' },
  { value: 'auction', label: 'Solo subastas (BOE)' },
  { value: 'bank_owned', label: 'Solo bank-owned' },
  { value: 'private', label: 'Solo portales' },
];

export function OpportunityFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const urlQ = searchParams.get('q') ?? '';
  const [search, setSearch] = useState(urlQ);
  const [lastSyncedQ, setLastSyncedQ] = useState(urlQ);
  if (urlQ !== lastSyncedQ) {
    setLastSyncedQ(urlQ);
    setSearch(urlQ);
  }

  const updateParam = useCallback(
    (key: string, value: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value === null || value === '' || value === 'all') params.delete(key);
      else params.set(key, value);
      params.delete('selected');
      const qs = params.toString();
      startTransition(() => {
        router.push(qs ? `/oportunidades?${qs}` : '/oportunidades', { scroll: false });
      });
    },
    [router, searchParams],
  );

  // Debounced search
  useEffect(() => {
    const current = searchParams.get('q') ?? '';
    if (search === current) return;
    const t = setTimeout(() => {
      updateParam('q', search || null);
    }, 250);
    return () => clearTimeout(t);
  }, [search, searchParams, updateParam]);

  // Atajo `/` para focus en search
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') return;
      if (e.key === '/' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const score = searchParams.get('score') ?? 'all';
  const type = searchParams.get('type') ?? 'all';
  const maxPrice = searchParams.get('maxPrice') ?? 'all';
  const origin = searchParams.get('origin') ?? 'all';
  const sort = searchParams.get('sort') ?? 'score';
  const noRedFlags = searchParams.get('noRedFlags') === '1';
  const onlyTracked = searchParams.get('onlyTracked') === '1';

  function toggleParam(key: string, currentlyOn: boolean) {
    updateParam(key, currentlyOn ? null : '1');
  }

  const hasActive = [
    'q',
    'score',
    'type',
    'maxPrice',
    'cp',
    'minRooms',
    'origin',
    'sort',
    'noRedFlags',
    'onlyTracked',
  ].some((k) => searchParams.has(k));

  return (
    <div className="border-border flex flex-col gap-2 border-b border-t py-3 sm:flex-row sm:items-center sm:gap-3">
      <div className="relative flex-1">
        <Search className="text-muted-foreground/60 pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2" />
        <Input
          ref={inputRef}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Dirección, código postal, palabra clave…"
          className="focus-visible:bg-accent/40 h-9 border-0 bg-transparent pl-9 shadow-none focus-visible:ring-0"
          aria-label="Buscar oportunidades"
        />
        {!search ? (
          <kbd className="text-muted-foreground/60 border-border pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border px-1.5 py-0.5 font-mono text-[10px] sm:inline-block">
            /
          </kbd>
        ) : (
          <button
            type="button"
            onClick={() => setSearch('')}
            className="text-muted-foreground hover:text-foreground absolute right-2 top-1/2 -translate-y-1/2"
            aria-label="Limpiar búsqueda"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={score} onValueChange={(v) => updateParam('score', v)}>
          <SelectTrigger size="sm" className="w-[148px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SCORE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={type} onValueChange={(v) => updateParam('type', v)}>
          <SelectTrigger size="sm" className="w-[148px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TYPE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={maxPrice} onValueChange={(v) => updateParam('maxPrice', v)}>
          <SelectTrigger size="sm" className="w-[148px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PRICE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={origin} onValueChange={(v) => updateParam('origin', v)}>
          <SelectTrigger size="sm" className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ORIGIN_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={sort} onValueChange={(v) => updateParam('sort', v === 'score' ? null : v)}>
          <SelectTrigger size="sm" className="w-[176px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <ToggleChip
          active={onlyTracked}
          onClick={() => toggleParam('onlyTracked', onlyTracked)}
          label="Mis trackeadas"
        />
        <ToggleChip
          active={noRedFlags}
          onClick={() => toggleParam('noRedFlags', noRedFlags)}
          label="Sin banderas rojas"
        />

        {hasActive ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch('');
              startTransition(() => router.push('/oportunidades', { scroll: false }));
            }}
          >
            Limpiar
          </Button>
        ) : null}

        <Button
          render={
            <a
              href={`/api/export/oportunidades?${searchParams.toString()}`}
              download
              rel="noopener"
            />
          }
          nativeButton={false}
          variant="outline"
          size="sm"
          title="Exportar a CSV"
        >
          <Download className="size-3.5" />
          Exportar
        </Button>
      </div>
    </div>
  );
}

function ToggleChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? 'bg-foreground text-background border-foreground inline-flex h-7 items-center border px-2.5 text-[0.8rem] font-medium'
          : 'border-border hover:bg-accent/40 text-foreground inline-flex h-7 items-center border px-2.5 text-[0.8rem] font-medium transition-colors'
      }
    >
      {label}
    </button>
  );
}
