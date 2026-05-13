'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PULSE_ROLES, PULSE_ROLE_LABEL, PULSE_ROLE_DESCRIPTION } from '@lince/auth';
import { registerAction, type RegisterFormState } from './actions';

const initialState: RegisterFormState = {};

export function RegisterForm() {
  const [state, formAction, pending] = useActionState(registerAction, initialState);

  return (
    <form action={formAction} className="space-y-5">
      <div>
        <Label htmlFor="phone" className="text-sm">
          Móvil (con WhatsApp)
        </Label>
        <Input
          id="phone"
          name="phone"
          type="tel"
          inputMode="tel"
          required
          autoComplete="tel"
          placeholder="666 12 34 56"
          className="mt-1.5"
          aria-invalid={!!state.fieldErrors?.phone}
        />
        <p className="text-muted-foreground mt-1 text-xs">
          Recibirás un código por WhatsApp para verificar.
        </p>
        {state.fieldErrors?.phone && (
          <p className="text-destructive mt-1 text-xs">{state.fieldErrors.phone}</p>
        )}
      </div>

      <div>
        <Label htmlFor="pin" className="text-sm">
          Código de 6 dígitos
        </Label>
        <Input
          id="pin"
          name="pin"
          type="text"
          inputMode="numeric"
          pattern="\d{6}"
          maxLength={6}
          minLength={6}
          required
          autoComplete="off"
          placeholder="123456"
          className="mt-1.5 font-mono tracking-[0.5em]"
          aria-invalid={!!state.fieldErrors?.pin}
        />
        <p className="text-muted-foreground mt-1 text-xs">
          Elige uno que recuerdes — lo usarás para entrar.
        </p>
        {state.fieldErrors?.pin && (
          <p className="text-destructive mt-1 text-xs">{state.fieldErrors.pin}</p>
        )}
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Tu rol</legend>
        <div className="space-y-2">
          {PULSE_ROLES.map((role) => (
            <label
              key={role}
              className="border-input hover:bg-muted/50 has-[:checked]:border-primary has-[:checked]:bg-primary/5 flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors"
            >
              <input type="radio" name="pulseRole" value={role} required className="mt-1" />
              <div className="flex-1">
                <div className="text-sm font-medium">{PULSE_ROLE_LABEL[role]}</div>
                <div className="text-muted-foreground text-xs">{PULSE_ROLE_DESCRIPTION[role]}</div>
              </div>
            </label>
          ))}
        </div>
        {state.fieldErrors?.pulseRole && (
          <p className="text-destructive text-xs">{state.fieldErrors.pulseRole}</p>
        )}
      </fieldset>

      {state.error && (
        <div className="bg-destructive/10 text-destructive rounded-lg p-3 text-sm">
          {state.error}
        </div>
      )}

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? 'Enviando código…' : 'Crear cuenta y enviar código'}
      </Button>
    </form>
  );
}
