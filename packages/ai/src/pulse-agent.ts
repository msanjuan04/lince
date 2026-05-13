// Agente Pulse: llama a Claude con el system prompt versionado + el input de datos
// cargado por `loadPulseData`. Devuelve el informe en Markdown listo para renderizar.

import Anthropic from '@anthropic-ai/sdk';
import {
  PULSE_AGENT_SYSTEM_PROMPT,
  buildPulseUserMessage,
  type PulseReportInput,
} from './prompts/pulse-agent';

export interface GeneratePulseReportOptions {
  /** API key. Default: process.env.ANTHROPIC_API_KEY. */
  apiKey?: string;
  /** Model ID. Default: claude-opus-4-7. */
  model?: string;
  /** Max tokens del output. Default: 6000 — suficiente para un informe de 5 oportunidades con razonamiento. */
  maxTokens?: number;
}

export interface PulseReportResult {
  markdown: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheCreationInputTokens: number;
    cacheReadInputTokens: number;
  };
  model: string;
  stopReason: string | null;
}

/** Genera el informe Pulse llamando a Claude. */
export async function generatePulseReport(
  input: PulseReportInput,
  opts: GeneratePulseReportOptions = {},
): Promise<PulseReportResult> {
  const apiKey = opts.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY no está definida. Pásala en opts.apiKey o vía env.');
  }

  const client = new Anthropic({ apiKey });
  const model = opts.model ?? 'claude-opus-4-7';
  const maxTokens = opts.maxTokens ?? 6000;

  // Prompt caching: el system prompt es estable entre informes. Marcamos ephemeral
  // para que Anthropic cachee y los siguientes informes paguen solo el delta.
  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system: [
      {
        type: 'text',
        text: PULSE_AGENT_SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: buildPulseUserMessage(input),
      },
    ],
  });

  const textBlock = response.content.find((c) => c.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error(
      `Claude devolvió respuesta sin bloque de texto. stop_reason=${response.stop_reason}`,
    );
  }

  return {
    markdown: textBlock.text,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheCreationInputTokens: response.usage.cache_creation_input_tokens ?? 0,
      cacheReadInputTokens: response.usage.cache_read_input_tokens ?? 0,
    },
    model: response.model,
    stopReason: response.stop_reason,
  };
}
