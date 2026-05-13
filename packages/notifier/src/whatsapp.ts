// Cliente WhatsApp Cloud API (Meta).
//
// Docs: https://developers.facebook.com/docs/whatsapp/cloud-api
//
// Para producción real, las **plantillas tienen que estar pre-aprobadas por
// Meta**. En dev / testing inmediato, el "WhatsApp test number" que Meta da
// al crear una app permite enviar TEXT messages a los 5 destinatarios de
// prueba sin necesidad de plantilla aprobada.
//
// Variables de entorno:
//   WHATSAPP_ACCESS_TOKEN       — token de acceso (Meta App)
//   WHATSAPP_PHONE_NUMBER_ID    — ID del número emisor
//   WHATSAPP_BUSINESS_ACCOUNT_ID — (informativo)
//
// Si las variables no están, el cliente queda en "dry mode": loggea el
// mensaje que ENVIARÍA pero no llama a la API. Eso permite que Marc
// construya el flujo entero sin tener las credenciales activadas todavía.

const GRAPH_API_VERSION = 'v21.0';

export interface WhatsAppConfig {
  accessToken: string;
  phoneNumberId: string;
  /** Si true, NO llama a Meta. Solo loggea. Default: auto-detecta por falta de credenciales. */
  dryRun?: boolean;
}

export interface WhatsAppTextMessage {
  to: string; // E.164 sin '+', ej. "34666123456"
  body: string;
}

export interface WhatsAppSendResult {
  ok: boolean;
  messageId?: string;
  dryRun: boolean;
  error?: string;
}

/** Resuelve la config desde env. Devuelve null si falta algo crítico. */
export function getWhatsAppConfigFromEnv(): WhatsAppConfig | null {
  const accessToken = process.env['WHATSAPP_ACCESS_TOKEN'];
  const phoneNumberId = process.env['WHATSAPP_PHONE_NUMBER_ID'];
  if (!accessToken || !phoneNumberId) return null;
  return { accessToken, phoneNumberId };
}

export class WhatsAppClient {
  private readonly config: WhatsAppConfig;
  private readonly dryRun: boolean;

  constructor(config: WhatsAppConfig | null) {
    if (!config) {
      // Sin credenciales — modo dry. El cliente sigue funcionando pero solo loggea.
      this.config = { accessToken: '', phoneNumberId: '' };
      this.dryRun = true;
      console.warn(
        '[whatsapp] credenciales no configuradas (WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID). Modo DRY: los mensajes se loggean sin enviar.',
      );
    } else {
      this.config = config;
      this.dryRun = config.dryRun ?? false;
    }
  }

  /** Envía un mensaje de texto simple (requiere ventana de 24h activa con el destinatario, o test number en dev). */
  async sendText(msg: WhatsAppTextMessage): Promise<WhatsAppSendResult> {
    const to = normalizeE164(msg.to);
    if (!to) {
      return { ok: false, dryRun: this.dryRun, error: `Número inválido: ${msg.to}` };
    }

    if (this.dryRun) {
      console.log(`[whatsapp DRY] to=${to} body="${msg.body.slice(0, 100)}..."`);
      return { ok: true, dryRun: true };
    }

    const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${this.config.phoneNumberId}/messages`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to,
          type: 'text',
          text: { preview_url: false, body: msg.body },
        }),
      });
      const data = (await res.json()) as
        | { messages?: Array<{ id: string }>; error?: { message: string; code: number } }
        | undefined;
      if (!res.ok || data?.error) {
        return {
          ok: false,
          dryRun: false,
          error: data?.error?.message ?? `HTTP ${res.status}`,
        };
      }
      return {
        ok: true,
        dryRun: false,
        messageId: data?.messages?.[0]?.id,
      };
    } catch (err) {
      return {
        ok: false,
        dryRun: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Envía un OTP usando un template AUTHENTICATION pre-aprobado por Meta.
   * El template debe tener:
   *   - 1 variable BODY {{1}} → el código
   *   - 1 botón COPY_CODE con el mismo código en el quick reply (opcional pero recomendado)
   *
   * Nombre del template: env WHATSAPP_OTP_TEMPLATE_NAME (default 'lince_otp').
   * Idioma: env WHATSAPP_OTP_TEMPLATE_LANG (default 'es').
   *
   * En dry mode (sin credenciales) loggea el código y devuelve ok.
   */
  async sendOtpTemplate(to: string, code: string): Promise<WhatsAppSendResult> {
    const normalized = normalizeE164(to);
    if (!normalized) {
      return { ok: false, dryRun: this.dryRun, error: `Número inválido: ${to}` };
    }

    if (this.dryRun) {
      console.log(`[whatsapp DRY/OTP] to=${normalized} code=${code}`);
      return { ok: true, dryRun: true };
    }

    const templateName = process.env['WHATSAPP_OTP_TEMPLATE_NAME'] ?? 'lince_otp';
    const templateLang = process.env['WHATSAPP_OTP_TEMPLATE_LANG'] ?? 'es';
    const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${this.config.phoneNumberId}/messages`;

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: normalized,
          type: 'template',
          template: {
            name: templateName,
            language: { code: templateLang },
            components: [
              {
                type: 'body',
                parameters: [{ type: 'text', text: code }],
              },
              {
                type: 'button',
                sub_type: 'url',
                index: '0',
                parameters: [{ type: 'text', text: code }],
              },
            ],
          },
        }),
      });
      const data = (await res.json()) as
        | { messages?: Array<{ id: string }>; error?: { message: string; code: number } }
        | undefined;
      if (!res.ok || data?.error) {
        return {
          ok: false,
          dryRun: false,
          error: data?.error?.message ?? `HTTP ${res.status}`,
        };
      }
      return { ok: true, dryRun: false, messageId: data?.messages?.[0]?.id };
    } catch (err) {
      return {
        ok: false,
        dryRun: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  isDryRun(): boolean {
    return this.dryRun;
  }
}

/**
 * Normaliza un número español a E.164 sin '+'.
 * Acepta entradas con +, espacios, guiones. Si no empieza por 34 y son
 * 9 dígitos, asume España.
 */
export function normalizeE164(raw: string): string | null {
  const digits = raw.replace(/[^\d]/g, '');
  if (digits.length === 0) return null;
  if (digits.length === 9) return `34${digits}`;
  if (digits.length === 11 && digits.startsWith('34')) return digits;
  if (digits.length >= 11 && digits.length <= 15) return digits;
  return null;
}
