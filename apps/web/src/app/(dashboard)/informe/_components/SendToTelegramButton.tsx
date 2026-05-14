'use client';

import { useState, useTransition } from 'react';
import { Send, Loader2, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  listTelegramRecipientsAction,
  sendPulseReportToTelegramAction,
  type TelegramRecipientSuggestion,
} from '../_actions';

interface Props {
  reportId: string;
  /** Si el informe es dry-run, deshabilita el botón y muestra tooltip. */
  disabled?: boolean;
}

export function SendToTelegramButton({ reportId, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pending, startTransition] = useTransition();
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [suggestions, setSuggestions] = useState<TelegramRecipientSuggestion[]>([]);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [customInput, setCustomInput] = useState('');
  const [customs, setCustoms] = useState<string[]>([]);

  async function loadRecipients() {
    setLoading(true);
    try {
      const r = await listTelegramRecipientsAction();
      if (!r.ok) {
        toast.error(r.error ?? 'Error cargando destinatarios');
        setConfigured(false);
        return;
      }
      setConfigured(r.configured);
      setSuggestions(r.recipients);
      // Pre-check todos por default — Marc normalmente quiere mandarlo a todos los que tiene.
      setChecked(new Set(r.recipients.map((s) => s.chatId)));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen && configured === null) {
      // Cargar destinatarios la primera vez que se abre.
      void loadRecipients();
    }
  }

  function toggle(chatId: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(chatId)) next.delete(chatId);
      else next.add(chatId);
      return next;
    });
  }

  function addCustom() {
    const trimmed = customInput.trim();
    if (!trimmed) return;
    // Validación ligera: chat_id es número (puede ser negativo para grupos)
    if (!/^-?\d+$/.test(trimmed)) {
      toast.error('Chat ID debe ser numérico (ej: 8591040911 o -1001234567890)');
      return;
    }
    if (customs.includes(trimmed) || suggestions.some((s) => s.chatId === trimmed)) {
      toast.warning('Ese chat ya está en la lista');
      setCustomInput('');
      return;
    }
    setCustoms((prev) => [...prev, trimmed]);
    setChecked((prev) => new Set(prev).add(trimmed));
    setCustomInput('');
  }

  function removeCustom(chatId: string) {
    setCustoms((prev) => prev.filter((c) => c !== chatId));
    setChecked((prev) => {
      const next = new Set(prev);
      next.delete(chatId);
      return next;
    });
  }

  function send() {
    const chatIds = Array.from(checked);
    if (chatIds.length === 0) {
      toast.error('Selecciona al menos un destinatario');
      return;
    }
    startTransition(async () => {
      const r = await sendPulseReportToTelegramAction({ reportId, chatIds });
      if (r.error && r.sent === 0) {
        toast.error(r.error);
        return;
      }
      if (r.failed > 0) {
        const detail = r.errors.map((e) => `${e.chatId}: ${e.error}`).join(' · ');
        toast.warning(`${r.sent}/${chatIds.length} enviados · ${r.failed} fallos · ${detail}`);
      } else {
        toast.success(
          `Informe enviado a ${r.sent} chat${r.sent > 1 ? 's' : ''}${
            r.albumSize > 0 ? ` · ${r.albumSize} foto${r.albumSize > 1 ? 's' : ''}` : ' (sin fotos)'
          }`,
        );
        setOpen(false);
      }
    });
  }

  const allItems = [
    ...suggestions,
    ...customs.map((chatId) => ({ chatId, label: chatId, custom: true as const })),
  ];

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button variant="outline" disabled={disabled}>
            <Send className="size-3.5" />
            Enviar a Telegram
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Enviar informe a Telegram</DialogTitle>
          <DialogDescription>
            Elige a quién mandar este informe. Se enviará la narrativa completa más un álbum visual
            con las top oportunidades que tengan foto.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          {loading ? (
            <div className="text-muted-foreground flex items-center gap-2 text-sm">
              <Loader2 className="size-3.5 animate-spin" />
              Cargando destinatarios…
            </div>
          ) : configured === false ? (
            <div className="border-border flex flex-col gap-2 border p-3 text-xs">
              <span className="font-medium">No hay chats configurados en el entorno.</span>
              <span className="text-muted-foreground">
                Define <code className="font-mono">TELEGRAM_CHAT_IDS</code> en{' '}
                <code className="font-mono">.env.local</code>, o añade un chat ID manual aquí abajo.
              </span>
            </div>
          ) : null}

          {!loading && allItems.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                Destinatarios
              </span>
              <ul className="flex flex-col">
                {allItems.map((item) => (
                  <li
                    key={item.chatId}
                    className="border-border flex items-center gap-3 border-b py-2 last:border-b-0"
                  >
                    <Checkbox
                      id={`tg-${item.chatId}`}
                      checked={checked.has(item.chatId)}
                      onCheckedChange={() => toggle(item.chatId)}
                    />
                    <label htmlFor={`tg-${item.chatId}`} className="flex-1 cursor-pointer text-sm">
                      <span className="font-mono">{item.chatId}</span>
                      {'role' in item && item.role ? (
                        <span className="text-muted-foreground ml-2 text-xs">{item.role}</span>
                      ) : null}
                      {'custom' in item && item.custom ? (
                        <span className="text-muted-foreground ml-2 text-xs">(manual)</span>
                      ) : null}
                    </label>
                    {'custom' in item && item.custom ? (
                      <button
                        type="button"
                        onClick={() => removeCustom(item.chatId)}
                        className="text-muted-foreground hover:text-foreground"
                        aria-label="Quitar"
                      >
                        <X className="size-3.5" />
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
              Añadir chat ID manual
            </span>
            <div className="flex gap-2">
              <Input
                placeholder="ej: 8591040911 o -1001234567890"
                value={customInput}
                onChange={(e) => setCustomInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addCustom();
                  }
                }}
              />
              <Button type="button" variant="outline" onClick={addCustom}>
                <Plus className="size-3.5" />
                Añadir
              </Button>
            </div>
            <span className="text-muted-foreground text-xs">
              Para descubrir chat IDs nuevos: el usuario abre el bot y manda{' '}
              <code className="font-mono">/start</code>, luego corre{' '}
              <code className="font-mono">pnpm --filter @lince/ai telegram:list-chats</code>.
            </span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={send} disabled={pending || checked.size === 0}>
            {pending ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                Enviando…
              </>
            ) : (
              <>
                <Send className="size-3.5" />
                Enviar a {checked.size || 0} chat{checked.size === 1 ? '' : 's'}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
