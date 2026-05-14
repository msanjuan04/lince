// Cliente Telegram Bot API. Envía mensajes a chats individuales o grupos.
//
// Docs: https://core.telegram.org/bots/api
//
// Cómo obtener un chat_id:
//   - Chat privado: el usuario abre la conversación con el bot y manda /start.
//     Después, GET https://api.telegram.org/bot<TOKEN>/getUpdates devuelve
//     el chat.id (entero positivo).
//   - Grupo: añadir el bot al grupo, mandar un mensaje cualquiera, y el mismo
//     getUpdates devuelve el chat.id (entero NEGATIVO para grupos).
//   - Canal: añadir el bot como admin del canal. El chat_id es de la forma
//     -100xxxxxxxxxx.
//
// Variables de entorno:
//   TELEGRAM_BOT_TOKEN — el token de BotFather (formato '123456:ABC-DEF...').
//
// Si falta el token, el cliente entra en dry-mode: loggea pero no manda.

const API_BASE = 'https://api.telegram.org';
const MAX_MESSAGE_LENGTH = 4096;
/** Telegram limita los captions de fotos a 1024 chars. */
const MAX_PHOTO_CAPTION_LENGTH = 1024;
/** sendMediaGroup acepta entre 2 y 10 items por álbum. */
const MAX_MEDIA_GROUP_SIZE = 10;
const MIN_MEDIA_GROUP_SIZE = 2;

export type TelegramParseMode = 'MarkdownV2' | 'HTML' | 'plain';

export interface TelegramConfig {
  botToken: string;
  /** Si true, no llama a la API — solo loggea. Default: auto si no hay token. */
  dryRun?: boolean;
}

export interface TelegramSendMessageInput {
  chatId: string | number;
  text: string;
  parseMode?: TelegramParseMode;
  disableWebPagePreview?: boolean;
  disableNotification?: boolean;
}

export interface TelegramSendResult {
  ok: boolean;
  dryRun: boolean;
  messageIds?: number[];
  error?: string;
  /** Cantidad de chunks enviados (si el texto fue dividido por longitud). */
  chunks: number;
}

export interface TelegramPhotoInput {
  /** URL pública o file_id ya subido. Telegram baja la URL por sí mismo (máx ~5 MB). */
  photoUrl: string;
  /** Caption opcional, máx 1024 chars (se trunca si es más largo). */
  caption?: string;
  parseMode?: TelegramParseMode;
}

export interface TelegramSendPhotoInput extends TelegramPhotoInput {
  chatId: string | number;
  disableNotification?: boolean;
}

export interface TelegramSendMediaGroupInput {
  chatId: string | number;
  items: TelegramPhotoInput[];
  disableNotification?: boolean;
}

export function getTelegramConfigFromEnv(): TelegramConfig | null {
  const botToken = process.env['TELEGRAM_BOT_TOKEN'];
  if (!botToken) return null;
  return { botToken };
}

export class TelegramClient {
  private readonly config: TelegramConfig;
  private readonly dryRun: boolean;

  constructor(config: TelegramConfig | null) {
    if (!config) {
      this.config = { botToken: '' };
      this.dryRun = true;
      console.warn(
        '[telegram] TELEGRAM_BOT_TOKEN no configurado. Modo DRY: los mensajes se loggean sin enviar.',
      );
    } else {
      this.config = config;
      this.dryRun = config.dryRun ?? false;
    }
  }

  /**
   * Envía un mensaje. Si supera 4096 chars, lo divide en chunks por linea.
   * Devuelve el resultado agregado (ok=true si todos los chunks fueron OK).
   */
  async sendMessage(input: TelegramSendMessageInput): Promise<TelegramSendResult> {
    const chunks = splitForTelegram(input.text);

    if (this.dryRun) {
      console.log(
        `[telegram DRY] chat_id=${input.chatId} parse_mode=${input.parseMode ?? 'plain'} chunks=${chunks.length}`,
      );
      for (let i = 0; i < chunks.length; i += 1) {
        const preview = chunks[i]!.slice(0, 120).replace(/\n/g, ' ');
        console.log(`[telegram DRY]   [${i + 1}/${chunks.length}] "${preview}..."`);
      }
      return { ok: true, dryRun: true, chunks: chunks.length };
    }

    const url = `${API_BASE}/bot${this.config.botToken}/sendMessage`;
    const messageIds: number[] = [];

    for (let i = 0; i < chunks.length; i += 1) {
      const chunk = chunks[i]!;
      const body: Record<string, unknown> = {
        chat_id: input.chatId,
        text: chunk,
        disable_web_page_preview: input.disableWebPagePreview ?? true,
        disable_notification: input.disableNotification ?? false,
      };
      if (input.parseMode && input.parseMode !== 'plain') {
        body.parse_mode = input.parseMode;
      }

      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = (await res.json()) as
          | { ok: true; result: { message_id: number } }
          | { ok: false; description?: string; error_code?: number };
        if (!res.ok || !data.ok) {
          const desc = !data.ok ? (data.description ?? `HTTP ${res.status}`) : `HTTP ${res.status}`;
          return {
            ok: false,
            dryRun: false,
            chunks: chunks.length,
            messageIds,
            error: `chunk ${i + 1}/${chunks.length}: ${desc}`,
          };
        }
        messageIds.push(data.result.message_id);
      } catch (err) {
        return {
          ok: false,
          dryRun: false,
          chunks: chunks.length,
          messageIds,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }

    return { ok: true, dryRun: false, chunks: chunks.length, messageIds };
  }

  /**
   * Envía una foto individual con caption opcional. Telegram descarga la URL
   * directamente (no hace falta subirla a su CDN). Tamaño máx ~5 MB.
   * El caption admite HTML/MarkdownV2 igual que sendMessage.
   */
  async sendPhoto(input: TelegramSendPhotoInput): Promise<TelegramSendResult> {
    const caption = input.caption ? truncateCaption(input.caption) : undefined;

    if (this.dryRun) {
      const preview = caption ? caption.slice(0, 80).replace(/\n/g, ' ') : '(sin caption)';
      console.log(
        `[telegram DRY] sendPhoto chat_id=${input.chatId} photo=${input.photoUrl.slice(0, 80)} caption="${preview}"`,
      );
      return { ok: true, dryRun: true, chunks: 1 };
    }

    const url = `${API_BASE}/bot${this.config.botToken}/sendPhoto`;
    const body: Record<string, unknown> = {
      chat_id: input.chatId,
      photo: input.photoUrl,
      disable_notification: input.disableNotification ?? false,
    };
    if (caption) body.caption = caption;
    if (input.parseMode && input.parseMode !== 'plain') {
      body.parse_mode = input.parseMode;
    }

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as
        | { ok: true; result: { message_id: number } }
        | { ok: false; description?: string; error_code?: number };
      if (!res.ok || !data.ok) {
        const desc = !data.ok ? (data.description ?? `HTTP ${res.status}`) : `HTTP ${res.status}`;
        return { ok: false, dryRun: false, chunks: 1, error: desc };
      }
      return { ok: true, dryRun: false, chunks: 1, messageIds: [data.result.message_id] };
    } catch (err) {
      return {
        ok: false,
        dryRun: false,
        chunks: 1,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Envía un álbum de fotos (2-10 items). Telegram las agrupa visualmente en
   * un solo bloque. Solo el primer item puede llevar caption (es el que se
   * muestra debajo del álbum). Si pasas >10 items se trocea en varios albums.
   * Si pasas 1 solo item, cae a sendPhoto. Si pasas 0, devuelve OK no-op.
   */
  async sendMediaGroup(input: TelegramSendMediaGroupInput): Promise<TelegramSendResult> {
    const items = input.items.filter((i) => !!i.photoUrl);
    if (items.length === 0) {
      return { ok: true, dryRun: this.dryRun, chunks: 0 };
    }
    if (items.length === 1) {
      const first = items[0]!;
      return this.sendPhoto({
        chatId: input.chatId,
        photoUrl: first.photoUrl,
        caption: first.caption,
        parseMode: first.parseMode,
        disableNotification: input.disableNotification,
      });
    }

    // Trocear si supera 10.
    const batches: TelegramPhotoInput[][] = [];
    for (let i = 0; i < items.length; i += MAX_MEDIA_GROUP_SIZE) {
      batches.push(items.slice(i, i + MAX_MEDIA_GROUP_SIZE));
    }

    const messageIds: number[] = [];
    let totalChunks = 0;

    for (const batch of batches) {
      // sendMediaGroup requiere al menos 2 items.
      if (batch.length < MIN_MEDIA_GROUP_SIZE) {
        const first = batch[0]!;
        const r = await this.sendPhoto({
          chatId: input.chatId,
          photoUrl: first.photoUrl,
          caption: first.caption,
          parseMode: first.parseMode,
          disableNotification: input.disableNotification,
        });
        if (!r.ok) return r;
        if (r.messageIds) messageIds.push(...r.messageIds);
        totalChunks += 1;
        continue;
      }

      if (this.dryRun) {
        console.log(`[telegram DRY] sendMediaGroup chat_id=${input.chatId} items=${batch.length}`);
        for (let i = 0; i < batch.length; i += 1) {
          const item = batch[i]!;
          const preview = item.caption ? item.caption.slice(0, 60).replace(/\n/g, ' ') : '—';
          console.log(
            `[telegram DRY]   [${i + 1}/${batch.length}] ${item.photoUrl.slice(0, 60)}... "${preview}"`,
          );
        }
        totalChunks += 1;
        continue;
      }

      const media = batch.map((item, idx) => {
        const m: Record<string, unknown> = { type: 'photo', media: item.photoUrl };
        // Telegram solo muestra el caption del primer item del álbum.
        if (idx === 0 && item.caption) {
          m.caption = truncateCaption(item.caption);
          if (item.parseMode && item.parseMode !== 'plain') m.parse_mode = item.parseMode;
        }
        return m;
      });

      const url = `${API_BASE}/bot${this.config.botToken}/sendMediaGroup`;
      const body = {
        chat_id: input.chatId,
        media,
        disable_notification: input.disableNotification ?? false,
      };

      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = (await res.json()) as
          | { ok: true; result: Array<{ message_id: number }> }
          | { ok: false; description?: string; error_code?: number };
        if (!res.ok || !data.ok) {
          const desc = !data.ok ? (data.description ?? `HTTP ${res.status}`) : `HTTP ${res.status}`;
          return {
            ok: false,
            dryRun: false,
            chunks: totalChunks + 1,
            messageIds,
            error: desc,
          };
        }
        for (const m of data.result) messageIds.push(m.message_id);
        totalChunks += 1;
      } catch (err) {
        return {
          ok: false,
          dryRun: false,
          chunks: totalChunks + 1,
          messageIds,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }

    return { ok: true, dryRun: false, chunks: totalChunks, messageIds };
  }

  /** Lista de chats que han hablado con el bot en las últimas 24h aprox. Útil para descubrir chat IDs. */
  async getUpdates(): Promise<
    Array<{ chatId: number; type: string; title?: string; firstName?: string }>
  > {
    if (this.dryRun) return [];
    const url = `${API_BASE}/bot${this.config.botToken}/getUpdates`;
    const res = await fetch(url);
    const data = (await res.json()) as {
      ok: boolean;
      result?: Array<{
        message?: { chat: { id: number; type: string; title?: string; first_name?: string } };
      }>;
    };
    if (!data.ok || !data.result) return [];
    const seen = new Map<
      number,
      { chatId: number; type: string; title?: string; firstName?: string }
    >();
    for (const upd of data.result) {
      const chat = upd.message?.chat;
      if (!chat) continue;
      if (!seen.has(chat.id)) {
        seen.set(chat.id, {
          chatId: chat.id,
          type: chat.type,
          title: chat.title,
          firstName: chat.first_name,
        });
      }
    }
    return Array.from(seen.values());
  }

  isDryRun(): boolean {
    return this.dryRun;
  }
}

/** Trunca un caption a 1024 chars con "…" final para no cortar a medio carácter. */
function truncateCaption(text: string): string {
  if (text.length <= MAX_PHOTO_CAPTION_LENGTH) return text;
  return text.slice(0, MAX_PHOTO_CAPTION_LENGTH - 1).trimEnd() + '…';
}

/**
 * Divide un texto en chunks que cada uno cabe en 4096 chars. Intenta cortar
 * en saltos de línea para no partir frases ni bloques markdown.
 */
export function splitForTelegram(text: string): string[] {
  if (text.length <= MAX_MESSAGE_LENGTH) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > MAX_MESSAGE_LENGTH) {
    // Buscar el último \n antes del límite.
    let cut = remaining.lastIndexOf('\n', MAX_MESSAGE_LENGTH);
    if (cut < MAX_MESSAGE_LENGTH * 0.5) {
      // Si no hay salto razonable, cortar duro en el límite.
      cut = MAX_MESSAGE_LENGTH;
    }
    chunks.push(remaining.slice(0, cut).trimEnd());
    remaining = remaining.slice(cut).trimStart();
  }
  if (remaining.length > 0) chunks.push(remaining);
  return chunks;
}

/**
 * Convierte un subset de Markdown a HTML compatible con Telegram.
 * Soporta: # ## ### → <b>, **bold** → <b>, *italic* → <i>, `code` → <code>,
 * ```block``` → <pre>, [text](url) → <a>. El resto se escapa.
 */
export function markdownToTelegramHtml(md: string): string {
  // Paso 1: extraer code blocks ``` para no procesar markdown dentro.
  const codeBlocks: string[] = [];
  let s = md.replace(/```([\s\S]*?)```/g, (_, code: string) => {
    const idx = codeBlocks.length;
    codeBlocks.push(code.trim());
    return `CODEBLOCK${idx}`;
  });

  // Paso 2: extraer inline code `code` para preservar contenido literal.
  const inlineCodes: string[] = [];
  s = s.replace(/`([^`\n]+)`/g, (_, code: string) => {
    const idx = inlineCodes.length;
    inlineCodes.push(code);
    return `INLINE${idx}`;
  });

  // Paso 3: escapar HTML.
  s = s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Paso 4: headers — convertir a bold + salto.
  s = s.replace(/^###\s+(.+)$/gm, '<b>$1</b>');
  s = s.replace(/^##\s+(.+)$/gm, '<b>$1</b>');
  s = s.replace(/^#\s+(.+)$/gm, '<b>$1</b>');

  // Paso 5: bold **text** → <b>text</b>
  s = s.replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>');

  // Paso 6: italic *text* → <i>text</i> (después de bold para no chocar)
  s = s.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<i>$2</i>');

  // Paso 7: links [text](url) → <a href="url">text</a>
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text: string, url: string) => {
    return `<a href="${url.replace(/"/g, '%22')}">${text}</a>`;
  });

  // Paso 8: divisores '---' → línea simple
  s = s.replace(/^---+\s*$/gm, '──────────');

  // Paso 9: restaurar inline codes y code blocks (escapando su contenido).
  const escapeHtml = (t: string) =>
    t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  s = s.replace(/INLINE(\d+)/g, (_, idx: string) => {
    const code = inlineCodes[Number(idx)] ?? '';
    return `<code>${escapeHtml(code)}</code>`;
  });
  s = s.replace(/CODEBLOCK(\d+)/g, (_, idx: string) => {
    const code = codeBlocks[Number(idx)] ?? '';
    return `<pre>${escapeHtml(code)}</pre>`;
  });

  return s;
}
