'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { verifyAction, resendOtpAction, type VerifyFormState } from './actions';

const initialState: VerifyFormState = {};

export function VerifyForm({ phone }: { phone: string }) {
  const [state, formAction, pending] = useActionState(verifyAction, initialState);
  const [resendState, resendAction, resendPending] = useActionState(resendOtpAction, initialState);

  return (
    <>
      <form action={formAction} className="space-y-5">
        <input type="hidden" name="phone" value={phone} />

        <div>
          <Label htmlFor="otp" className="text-sm">
            Código recibido por WhatsApp
          </Label>
          <Input
            id="otp"
            name="otp"
            type="text"
            inputMode="numeric"
            pattern="\d{6}"
            maxLength={6}
            minLength={6}
            required
            autoComplete="one-time-code"
            placeholder="123456"
            className="mt-1.5 font-mono tracking-[0.5em]"
            aria-invalid={!!state.fieldErrors?.otp}
          />
          {state.fieldErrors?.otp && (
            <p className="text-destructive mt-1 text-xs">{state.fieldErrors.otp}</p>
          )}
        </div>

        <div>
          <Label htmlFor="pin" className="text-sm">
            Tu PIN de 6 dígitos
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
            autoComplete="new-password"
            placeholder="••••••"
            className="mt-1.5 font-mono tracking-[0.5em]"
            aria-invalid={!!state.fieldErrors?.pin}
          />
          <p className="text-muted-foreground mt-1 text-xs">
            El mismo PIN que elegiste al registrarte.
          </p>
          {state.fieldErrors?.pin && (
            <p className="text-destructive mt-1 text-xs">{state.fieldErrors.pin}</p>
          )}
        </div>

        {state.error && (
          <div className="bg-destructive/10 text-destructive rounded-lg p-3 text-sm">
            {state.error}
          </div>
        )}
        {resendState.info && (
          <div className="bg-primary/10 text-primary rounded-lg p-3 text-sm">
            {resendState.info}
          </div>
        )}
        {resendState.error && (
          <div className="bg-destructive/10 text-destructive rounded-lg p-3 text-sm">
            {resendState.error}
          </div>
        )}

        <Button type="submit" disabled={pending} className="w-full">
          {pending ? 'Verificando…' : 'Verificar y entrar'}
        </Button>
      </form>

      <form action={resendAction} className="mt-4 text-center">
        <input type="hidden" name="phone" value={phone} />
        <button
          type="submit"
          disabled={resendPending}
          className="text-muted-foreground hover:text-foreground text-xs underline-offset-4 hover:underline disabled:opacity-50"
        >
          {resendPending ? 'Reenviando…' : 'Reenviar código'}
        </button>
      </form>
    </>
  );
}
