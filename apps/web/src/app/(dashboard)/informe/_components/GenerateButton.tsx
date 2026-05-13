'use client';

import { useTransition } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { generatePulseReportAction } from '../_actions';

export function GenerateButton() {
  const [pending, startTransition] = useTransition();

  function generate() {
    startTransition(async () => {
      const r = await generatePulseReportAction({ readerRole: 'inversor_directo' });
      if (r.ok) {
        if (r.dryRun) {
          toast.warning('Generado en modo DRY-RUN (falta ANTHROPIC_API_KEY)');
        } else {
          toast.success(
            `Informe generado · ${r.tokensIn ?? 0}+${r.tokensOut ?? 0} tokens · ${r.costEur?.toFixed(3)}€`,
          );
        }
      } else {
        toast.error(r.error ?? 'Error generando informe');
      }
    });
  }

  return (
    <Button onClick={generate} disabled={pending}>
      {pending ? (
        <>
          <Loader2 className="size-3.5 animate-spin" />
          Generando…
        </>
      ) : (
        <>
          <Sparkles className="size-3.5" />
          Generar informe ahora
        </>
      )}
    </Button>
  );
}
