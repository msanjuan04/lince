'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { loginAction, type LoginFormState } from './actions';

const initialState: LoginFormState = {};

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, initialState);

  return (
    <form action={formAction} className="space-y-5">
      <div>
        <Label htmlFor="phone" className="text-sm">
          Móvil
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
          type="password"
          inputMode="numeric"
          pattern="\d{6}"
          maxLength={6}
          minLength={6}
          required
          autoComplete="current-password"
          placeholder="••••••"
          className="mt-1.5 font-mono tracking-[0.5em]"
          aria-invalid={!!state.fieldErrors?.pin}
        />
        {state.fieldErrors?.pin && (
          <p className="text-destructive mt-1 text-xs">{state.fieldErrors.pin}</p>
        )}
      </div>

      {state.error && (
        <div className="bg-destructive/10 text-destructive rounded-lg p-3 text-sm">
          {state.error}
        </div>
      )}

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? 'Entrando…' : 'Entrar'}
      </Button>
    </form>
  );
}
