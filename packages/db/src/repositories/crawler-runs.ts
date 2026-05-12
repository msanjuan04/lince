// Auditoría de runs del crawler. Cada invocación del orquestador crea una fila
// y va acumulando contadores y errores hasta finish.

import { Prisma, prisma } from '../index';

export type ErrorRecord = {
  url?: string;
  message: string;
  stack?: string;
  at: string;
};

export type FinishRunInput = {
  status: 'ok' | 'partial' | 'error';
  propertiesFound: number;
  propertiesNew: number;
  propertiesUpdated: number;
  errors: ErrorRecord[];
};

export async function startCrawlerRun(source: string): Promise<{ id: string; startedAt: Date }> {
  const startedAt = new Date();
  const row = await prisma.crawlerRun.create({
    data: {
      source,
      status: 'running',
      startedAt,
      propertiesFound: 0,
      propertiesNew: 0,
      propertiesUpdated: 0,
      errors: Prisma.JsonNull,
    },
    select: { id: true, startedAt: true },
  });
  // startedAt nunca debería ser null aquí, pero el tipo lo permite.
  return { id: row.id, startedAt: row.startedAt ?? startedAt };
}

export async function finishCrawlerRun(id: string, input: FinishRunInput): Promise<void> {
  await prisma.crawlerRun.update({
    where: { id },
    data: {
      status: input.status,
      propertiesFound: input.propertiesFound,
      propertiesNew: input.propertiesNew,
      propertiesUpdated: input.propertiesUpdated,
      errors:
        input.errors.length > 0
          ? (input.errors as unknown as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      endedAt: new Date(),
    },
  });
}
