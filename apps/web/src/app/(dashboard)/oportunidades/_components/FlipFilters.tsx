// Panel de filtros flip — totalmente parametrizables, state local en cliente.
// Cambios aquí NO disparan refetch del servidor: el cliente filtra y recalcula
// el flip estimate en memoria. Eso permite respuesta instantánea al mover
// €/m² reforma sin recargar.
//
// Política: cualquier campo vacío = sin filtro (no inventar default 0).

'use client';

import { Bookmark, ChevronDown, ChevronUp, RotateCcw, Save, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { deserializeFlipFilters, useFlipPresets } from './useFlipPresets';

export interface FlipFilterState {
  /** €/m² de reforma a aplicar — recalcula el flip estimate. */
  eurM2Reform: number;
  /** Inversión total máxima (€). null = sin tope. */
  maxTotalInvestment: number | null;
  /** Margen bruto mínimo (€). null = sin filtro. */
  minGrossMarginEur: number | null;
  /** Margen bruto mínimo (% sobre inversión). null = sin filtro. */
  minGrossMarginPct: number | null;
  /** m² mínimo. null = sin filtro. */
  minM2: number | null;
  /** m² máximo. null = sin filtro. */
  maxM2: number | null;
  /** Tiers activos del informe. */
  tiers: Set<'A' | 'B' | 'C' | 'D'>;
  /** Excluir zonas con momentum negativo (recomendado on). */
  excludeNegativeMomentum: boolean;
}

export const DEFAULT_FLIP_FILTERS: FlipFilterState = {
  eurM2Reform: 700, // placeholder a calibrar con tu primer flip / constructor real
  maxTotalInvestment: null,
  minGrossMarginEur: null,
  minGrossMarginPct: null,
  minM2: null,
  maxM2: null,
  tiers: new Set(['A', 'B', 'C']), // D excluido por defecto (momentum negativo)
  excludeNegativeMomentum: true,
};

interface Props {
  state: FlipFilterState;
  onChange: (next: FlipFilterState) => void;
}

export function FlipFilters({ state, onChange }: Props) {
  const [open, setOpen] = useState(true);
  const [presetName, setPresetName] = useState('');
  const [presetsOpen, setPresetsOpen] = useState(false);
  const { presets, save, remove } = useFlipPresets();

  function patch(partial: Partial<FlipFilterState>) {
    onChange({ ...state, ...partial });
  }

  function applyPreset(presetId: string) {
    const preset = presets.find((p) => p.id === presetId);
    if (!preset) return;
    onChange(deserializeFlipFilters(preset.filters));
    setPresetsOpen(false);
    toast.success(`Preset "${preset.name}" aplicado`);
  }

  function savePreset() {
    const name = presetName.trim();
    if (!name) {
      toast.error('Dale un nombre al preset');
      return;
    }
    save(name, state);
    setPresetName('');
    toast.success(`Preset "${name}" guardado`);
  }

  function reset() {
    onChange({ ...DEFAULT_FLIP_FILTERS, tiers: new Set(DEFAULT_FLIP_FILTERS.tiers) });
  }

  function toggleTier(t: 'A' | 'B' | 'C' | 'D') {
    const next = new Set(state.tiers);
    if (next.has(t)) next.delete(t);
    else next.add(t);
    patch({ tiers: next });
  }

  const hasNonDefault =
    state.eurM2Reform !== DEFAULT_FLIP_FILTERS.eurM2Reform ||
    state.maxTotalInvestment !== null ||
    state.minGrossMarginEur !== null ||
    state.minGrossMarginPct !== null ||
    state.minM2 !== null ||
    state.maxM2 !== null ||
    state.tiers.size !== 3 ||
    !state.excludeNegativeMomentum;

  return (
    <div className="border-border flex flex-col border">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="hover:bg-accent/30 flex items-center justify-between gap-3 px-4 py-2.5 text-left"
      >
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-medium">Filtros flip</span>
          <span className="text-muted-foreground text-xs">
            {hasNonDefault ? 'modificados' : 'por defecto'}
          </span>
        </div>
        {open ? (
          <ChevronUp className="text-muted-foreground size-4" />
        ) : (
          <ChevronDown className="text-muted-foreground size-4" />
        )}
      </button>

      {open ? (
        <div className="border-border flex flex-col gap-5 border-t px-4 py-4">
          {/* Barra de presets — cargar / guardar combinaciones */}
          <div className="bg-accent/20 border-border flex flex-wrap items-center gap-2 border p-2">
            <Popover open={presetsOpen} onOpenChange={setPresetsOpen}>
              <PopoverTrigger
                render={
                  <Button variant="outline" size="sm" disabled={presets.length === 0}>
                    <Bookmark className="size-3.5" />
                    Cargar preset {presets.length > 0 ? `(${presets.length})` : ''}
                  </Button>
                }
              />
              <PopoverContent className="w-72 p-2">
                {presets.length === 0 ? (
                  <p className="text-muted-foreground p-2 text-xs">No tienes presets guardados.</p>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {presets.map((preset) => (
                      <li
                        key={preset.id}
                        className="hover:bg-accent/40 flex items-center justify-between gap-2 px-2 py-1.5"
                      >
                        <button
                          type="button"
                          onClick={() => applyPreset(preset.id)}
                          className="flex-1 text-left text-sm"
                        >
                          <span className="font-medium">{preset.name}</span>
                          <span className="text-muted-foreground ml-2 text-[10px]">
                            {new Date(preset.createdAt).toLocaleDateString('es-ES')}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => remove(preset.id)}
                          className="text-muted-foreground hover:text-destructive"
                          aria-label="Eliminar preset"
                          title="Eliminar"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </PopoverContent>
            </Popover>

            <div className="flex flex-1 items-center gap-1.5">
              <Input
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    savePreset();
                  }
                }}
                placeholder="Nombre del preset…"
                className="h-8 text-sm"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={savePreset}
                disabled={!presetName.trim()}
              >
                <Save className="size-3.5" />
                Guardar
              </Button>
            </div>
          </div>

          {/* Reforma — el más importante: recalcula el flip al vuelo */}
          <FieldRow
            label="€/m² reforma"
            hint="placeholder 700€ a calibrar con tu constructor o primer flip real"
          >
            <NumberInput
              value={state.eurM2Reform}
              onChange={(v) => patch({ eurM2Reform: v ?? DEFAULT_FLIP_FILTERS.eurM2Reform })}
              min={0}
              step={50}
              suffix="€/m²"
            />
          </FieldRow>

          {/* Capital máximo */}
          <FieldRow
            label="Inversión total máxima"
            hint="compra + ITP + notaría + reforma. Vacío = sin tope"
          >
            <NumberInput
              value={state.maxTotalInvestment}
              onChange={(v) => patch({ maxTotalInvestment: v })}
              min={0}
              step={10000}
              suffix="€"
              placeholder="sin tope"
            />
          </FieldRow>

          {/* Margen bruto y % */}
          <div className="grid grid-cols-2 gap-4">
            <FieldRow label="Margen bruto mínimo">
              <NumberInput
                value={state.minGrossMarginEur}
                onChange={(v) => patch({ minGrossMarginEur: v })}
                min={0}
                step={5000}
                suffix="€"
                placeholder="sin filtro"
              />
            </FieldRow>
            <FieldRow label="Margen % mínimo sobre inversión">
              <NumberInput
                value={state.minGrossMarginPct}
                onChange={(v) => patch({ minGrossMarginPct: v })}
                min={0}
                max={500}
                step={5}
                suffix="%"
                placeholder="sin filtro"
              />
            </FieldRow>
          </div>

          {/* m² */}
          <div className="grid grid-cols-2 gap-4">
            <FieldRow label="m² mínimo">
              <NumberInput
                value={state.minM2}
                onChange={(v) => patch({ minM2: v })}
                min={0}
                step={10}
                suffix="m²"
                placeholder="sin filtro"
              />
            </FieldRow>
            <FieldRow label="m² máximo">
              <NumberInput
                value={state.maxM2}
                onChange={(v) => patch({ maxM2: v })}
                min={0}
                step={10}
                suffix="m²"
                placeholder="sin filtro"
              />
            </FieldRow>
          </div>

          {/* Tier del informe */}
          <FieldRow
            label="Tier de zona (informe Idealista/Indomio abril 2026)"
            hint="A: precio premium >4.000€/m² o crec. >12%. B: medio. C: bajo. D: momentum negativo"
          >
            <div className="flex flex-wrap gap-3">
              {(['A', 'B', 'C', 'D'] as const).map((t) => (
                <label key={t} className="flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox checked={state.tiers.has(t)} onCheckedChange={() => toggleTier(t)} />
                  <span
                    className={cn('font-mono', state.tiers.has(t) ? '' : 'text-muted-foreground')}
                  >
                    Tier {t}
                  </span>
                </label>
              ))}
            </div>
          </FieldRow>

          {/* Momentum negativo */}
          <FieldRow label="Momentum">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox
                checked={state.excludeNegativeMomentum}
                onCheckedChange={(v) => patch({ excludeNegativeMomentum: v === true })}
              />
              <span>Excluir zonas con crecimiento negativo (Premià Mar, Argentona)</span>
            </label>
          </FieldRow>

          {/* Reset */}
          <div className="border-border flex items-center justify-between border-t pt-3">
            <span className="text-muted-foreground text-xs">
              Los filtros se aplican en cliente sin recargar el servidor.
            </span>
            <Button variant="ghost" size="sm" onClick={reset} disabled={!hasNonDefault}>
              <RotateCcw className="size-3.5" />
              Reset
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function FieldRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
        {label}
      </span>
      {children}
      {hint ? <span className="text-muted-foreground/70 text-[11px]">{hint}</span> : null}
    </div>
  );
}

function NumberInput({
  value,
  onChange,
  min,
  max,
  step,
  suffix,
  placeholder,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  placeholder?: string;
}) {
  return (
    <div className="relative">
      <Input
        type="number"
        value={value === null ? '' : value}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === '') {
            onChange(null);
            return;
          }
          const parsed = Number(raw);
          if (Number.isNaN(parsed)) return;
          onChange(parsed);
        }}
        min={min}
        max={max}
        step={step}
        placeholder={placeholder}
        className="pr-12"
      />
      {suffix ? (
        <span className="text-muted-foreground pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs">
          {suffix}
        </span>
      ) : null}
    </div>
  );
}
