// Análisis visual de una propiedad con Claude Vision.
// Recibe URL de foto principal + contexto opcional (CP, m², descripción), llama
// a Claude para que detecte: estado general, elementos a reformar, banderas
// rojas visuales, coste reforma estimado, calidad de la foto.
//
// Modelo por defecto: claude-sonnet-4-5 (vision capable, mucho más barato que
// Opus). Coste estimado: ~0,01-0,02€ por foto.
//
// IMPORTANTE: la respuesta es estructurada JSON estricto. Si Claude no devuelve
// JSON válido, la función falla — NO inventamos un análisis vacío.

import Anthropic from '@anthropic-ai/sdk';

export const VISION_SYSTEM_PROMPT = `Eres un perito inmobiliario experto en análisis visual para flipping (comprar → reformar → vender) en el área metropolitana de Barcelona.

OBJETIVO: De la foto principal del anuncio de un piso, extraer información objetiva del estado y coste estimado de reforma.

REGLAS CRÍTICAS:
- Solo describes lo que VES en la foto. NO inventas habitaciones que no aparecen.
- Si la foto muestra una sola estancia (típico de anuncios), no extrapoles al piso entero — di "no visible".
- Si la foto es exterior o de fachada, di que solo evalúas exterior.
- El coste de reforma a 700€/m² es la base media calidad media BCN. Ajustas hacia arriba si ves elementos viejos a sustituir, hacia abajo si está casi listo.
- Calidad foto: "professional" si tiene gran angular + iluminación cuidada, "amateur" si parece móvil sin tratar (proxy de tipo de vendedor).

OUTPUT ESTRICTO en JSON, sin markdown, sin prefacio:
{
  "conditionScore": int 0-100 (0=ruina, 50=funcional pero antiguo, 80=buen estado, 100=como nuevo),
  "conditionLabel": "needs_reform" | "partial_reform" | "good" | "recently_reformed" | "new" | "unknown",
  "reformCostPerM2": int (€/m²) | null si no estimable,
  "elementsToReform": array de strings cortos ["cocina antigua", "baño años 80", "suelos terrazo", ...],
  "visualRedFlags": array ["humedad en techo", "viga vista no estructural", ...],
  "photoQuality": "professional" | "amateur",
  "summary": "2-3 frases describiendo lo que ves, en español"
}`;

export interface VisionAnalyzerOptions {
  apiKey?: string;
  /** Default 'claude-sonnet-4-5'. */
  model?: string;
  /** Default 1000. */
  maxTokens?: number;
}

export interface VisionAnalyzerInput {
  /** URL pública de la imagen. Claude la descarga directamente. */
  imageUrl: string;
  /** Contexto opcional para mejorar la lectura (CP, m², año construcción). */
  context?: {
    postalCode?: string;
    m2?: number;
    yearBuilt?: number;
    sourceLabel?: string;
  };
}

export interface VisionAnalysis {
  conditionScore: number | null;
  conditionLabel: string | null;
  reformCostPerM2: number | null;
  elementsToReform: string[];
  visualRedFlags: string[];
  photoQuality: string | null;
  summary: string | null;
}

export interface VisionAnalyzerResult {
  analysis: VisionAnalysis;
  model: string;
  promptVersion: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  estimatedCostEur: number;
  rawResponseText: string;
}

const PROMPT_VERSION = 'vision-v1';

/** Coste por 1M tokens (Sonnet 4-5 con vision). EUR≈USD para estimación rough. */
const PRICE_PER_M_INPUT_EUR = 3;
const PRICE_PER_M_OUTPUT_EUR = 15;

export async function analyzePropertyPhoto(
  input: VisionAnalyzerInput,
  opts: VisionAnalyzerOptions = {},
): Promise<VisionAnalyzerResult> {
  const apiKey = opts.apiKey ?? process.env['ANTHROPIC_API_KEY'];
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY no está definida.');
  }

  const client = new Anthropic({ apiKey });
  const model = opts.model ?? 'claude-sonnet-4-5';
  const maxTokens = opts.maxTokens ?? 1000;

  const contextLines: string[] = [];
  if (input.context?.postalCode) contextLines.push(`CP: ${input.context.postalCode}`);
  if (input.context?.m2) contextLines.push(`Superficie: ${input.context.m2}m²`);
  if (input.context?.yearBuilt) contextLines.push(`Año construcción: ${input.context.yearBuilt}`);
  if (input.context?.sourceLabel) contextLines.push(`Fuente: ${input.context.sourceLabel}`);
  const contextText = contextLines.length > 0 ? `Contexto:\n${contextLines.join('\n')}\n\n` : '';

  // Anthropic SDK 0.36 no soporta `type: 'url'` para imágenes — bajamos la
  // imagen y la mandamos como base64. Si el SDK se actualiza a >=0.40, podemos
  // cambiar a url source directamente.
  const { data: base64Data, mediaType } = await downloadImageAsBase64(input.imageUrl);

  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system: VISION_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mediaType,
              data: base64Data,
            },
          },
          {
            type: 'text',
            text: `${contextText}Analiza esta foto principal del anuncio. Devuelve SOLO el JSON con el formato especificado en el system prompt.`,
          },
        ],
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  const rawText = textBlock && 'text' in textBlock ? textBlock.text : '';

  if (!rawText) {
    throw new Error('Claude no devolvió texto en la respuesta de visión.');
  }

  const analysis = parseAnalysisJson(rawText);

  const inputTokens = response.usage.input_tokens;
  const outputTokens = response.usage.output_tokens;
  const estimatedCostEur =
    Math.round(
      ((inputTokens * PRICE_PER_M_INPUT_EUR + outputTokens * PRICE_PER_M_OUTPUT_EUR) / 1_000_000) *
        10000,
    ) / 10000;

  return {
    analysis,
    model: response.model,
    promptVersion: PROMPT_VERSION,
    usage: { inputTokens, outputTokens },
    estimatedCostEur,
    rawResponseText: rawText,
  };
}

/**
 * Parsea la respuesta de Claude. Si no es JSON estricto válido, intenta
 * extraer el JSON de dentro de un bloque ```json``` o texto narrativo.
 * Si nada funciona, lanza — política de honestidad: mejor fallar que devolver
 * análisis vacío inventado.
 */
/**
 * Descarga la imagen y la devuelve como base64. Detecta el content-type para
 * pasarlo al SDK (Anthropic requiere media_type concreto). Si la URL no
 * devuelve content-type válido, asumimos image/jpeg que es lo más común.
 */
async function downloadImageAsBase64(
  url: string,
): Promise<{ data: string; mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' }> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'LinceBot/1.0 (+https://lince.cat/bot)' },
  });
  if (!res.ok) {
    throw new Error(`Imagen no descargable (HTTP ${res.status}): ${url}`);
  }
  const contentType = (res.headers.get('content-type') ?? 'image/jpeg').toLowerCase();
  let mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' = 'image/jpeg';
  if (contentType.includes('png')) mediaType = 'image/png';
  else if (contentType.includes('gif')) mediaType = 'image/gif';
  else if (contentType.includes('webp')) mediaType = 'image/webp';

  const buffer = await res.arrayBuffer();
  // Límite de seguridad: Anthropic vision acepta hasta ~5MB. Si supera 4MB
  // (margen de seguridad), fallamos para evitar errores opacos.
  if (buffer.byteLength > 4 * 1024 * 1024) {
    throw new Error(`Imagen demasiado grande (${(buffer.byteLength / 1024 / 1024).toFixed(1)}MB)`);
  }
  const data = Buffer.from(buffer).toString('base64');
  return { data, mediaType };
}

function parseAnalysisJson(raw: string): VisionAnalysis {
  // Intento directo
  let candidate = raw.trim();

  // Limpiar bloques ```json ... ```
  const fenceMatch = candidate.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
  if (fenceMatch && fenceMatch[1]) {
    candidate = fenceMatch[1].trim();
  } else {
    // Buscar primer { y último }
    const firstBrace = candidate.indexOf('{');
    const lastBrace = candidate.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      candidate = candidate.slice(firstBrace, lastBrace + 1);
    }
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch (err) {
    throw new Error(
      `Claude devolvió texto no parseable como JSON. raw="${raw.slice(0, 200)}…" err=${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('JSON parseado no es un objeto.');
  }

  const obj = parsed as Record<string, unknown>;

  return {
    conditionScore: typeof obj.conditionScore === 'number' ? obj.conditionScore : null,
    conditionLabel: typeof obj.conditionLabel === 'string' ? obj.conditionLabel : null,
    reformCostPerM2: typeof obj.reformCostPerM2 === 'number' ? obj.reformCostPerM2 : null,
    elementsToReform: Array.isArray(obj.elementsToReform)
      ? obj.elementsToReform.filter((e): e is string => typeof e === 'string')
      : [],
    visualRedFlags: Array.isArray(obj.visualRedFlags)
      ? obj.visualRedFlags.filter((e): e is string => typeof e === 'string')
      : [],
    photoQuality: typeof obj.photoQuality === 'string' ? obj.photoQuality : null,
    summary: typeof obj.summary === 'string' ? obj.summary : null,
  };
}
