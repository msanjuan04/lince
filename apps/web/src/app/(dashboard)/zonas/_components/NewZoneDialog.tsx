'use client';

import { Plus } from 'lucide-react';
import { useActionState, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { createZoneAction, type CreateZoneState } from '../_actions';

const INITIAL_STATE: CreateZoneState = { status: 'idle' };

const TYPE_OPTIONS = [
  { value: 'piso', label: 'Piso' },
  { value: 'atico', label: 'Ático' },
  { value: 'casa', label: 'Casa' },
  { value: 'duplex', label: 'Dúplex' },
  { value: 'local', label: 'Local' },
] as const;

const CHANNEL_OPTIONS = [
  { value: 'email', label: 'Email' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'telegram', label: 'Telegram' },
] as const;

export function NewZoneButton() {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(createZoneAction, INITIAL_STATE);

  const [prevState, setPrevState] = useState(state);
  if (prevState !== state) {
    setPrevState(state);
    if (state.status === 'success') {
      setOpen(false);
      toast.success('Zona creada');
    } else if (state.status === 'error' && state.formError) {
      toast.error(state.formError);
    }
  }

  const errors = state.status === 'error' ? state.fieldErrors : {};

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>
        <Plus className="size-3.5" />
        Nueva zona
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nueva zona</DialogTitle>
          <DialogDescription>
            Códigos postales y filtros para recibir alertas cuando aparezcan inmuebles que
            coincidan.
          </DialogDescription>
        </DialogHeader>

        <form action={action} className="flex flex-col gap-5">
          <Field label="Nombre" name="name" error={errors.name?.[0]}>
            <Input
              id="name"
              name="name"
              placeholder="Ej: Eixample Esquerra + Sant Antoni"
              autoComplete="off"
              required
              defaultValue=""
            />
          </Field>

          <Field
            label="Códigos postales"
            name="postalCodes"
            hint="Separa con comas, espacios o saltos de línea"
            error={errors.postalCodes?.[0]}
          >
            <Textarea
              id="postalCodes"
              name="postalCodes"
              placeholder="08015, 08036, 08011"
              rows={2}
              required
              className="font-mono text-sm tabular-nums"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Score mínimo" name="minScore" error={errors.minScore?.[0]}>
              <Input
                id="minScore"
                name="minScore"
                type="number"
                min={0}
                max={100}
                defaultValue={60}
                required
                className="tabular-nums"
              />
            </Field>
            <Field label="Habitaciones (mín.)" name="minRooms" error={errors.minRooms?.[0]}>
              <Input
                id="minRooms"
                name="minRooms"
                type="number"
                min={0}
                max={10}
                placeholder="cualquiera"
                className="tabular-nums"
              />
            </Field>
          </div>

          <Field
            label="Precio máximo (€)"
            name="maxPrice"
            hint="Vacío para sin tope"
            error={errors.maxPrice?.[0]}
          >
            <Input
              id="maxPrice"
              name="maxPrice"
              type="number"
              min={0}
              step={1000}
              placeholder="600000"
              className="tabular-nums"
            />
          </Field>

          <Field label="Tipos de inmueble" name="types" error={errors.types?.[0]}>
            <div className="flex flex-wrap gap-3">
              {TYPE_OPTIONS.map((opt) => (
                <label key={opt.value} className="flex items-center gap-2 text-sm">
                  <Checkbox name="types" value={opt.value} />
                  {opt.label}
                </label>
              ))}
            </div>
          </Field>

          <Field label="Canales de alerta" name="alertChannels" error={errors.alertChannels?.[0]}>
            <div className="flex flex-wrap gap-3">
              {CHANNEL_OPTIONS.map((opt) => (
                <label key={opt.value} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    name="alertChannels"
                    value={opt.value}
                    defaultChecked={opt.value === 'email'}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </Field>

          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" disabled={pending} />}>
              Cancelar
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? 'Creando…' : 'Crear zona'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  name,
  hint,
  error,
  children,
}: {
  label: string;
  name: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={name} className={cn(error && 'text-destructive')}>
        {label}
      </Label>
      {children}
      {error ? (
        <p className="text-destructive text-xs">{error}</p>
      ) : hint ? (
        <p className="text-muted-foreground text-xs">{hint}</p>
      ) : null}
    </div>
  );
}
