# Lince · CLAUDE.md

> Plataforma B2B SaaS de captación inmobiliaria automatizada para Catalunya.
> Comunícate en **español**. Términos técnicos en inglés cuando sea natural.

---

## TL;DR

- **Marc Sanjuan** (co-fundador GNERAI) construye Lince con Claude Code.
- **Stack**: Next.js 16 + Supabase + DigitalOcean + Anthropic API. Bootstrap puro.
- **Sprint actual**: 1 completado (Pulse Fase 1 ✅). Ver estado y pendientes → [`docs/sprints.md`](docs/sprints.md)
- **Antes de cualquier acción destructiva, costosa o ambigua**: pregunta.

---

## Referencias rápidas

| Documento                                          | Qué contiene                                                     |
| -------------------------------------------------- | ---------------------------------------------------------------- |
| [`docs/sprints.md`](docs/sprints.md)               | Plan de sprints, estado actual, open questions                   |
| [`docs/stack.md`](docs/stack.md)                   | Arquitectura, decisiones técnicas, estructura repo, convenciones |
| [`docs/schema.md`](docs/schema.md)                 | Schema DB completo (Prisma/SQL), valuator                        |
| [`docs/legal.md`](docs/legal.md)                   | Scraping (robots.txt, rate limits, fuentes), GDPR                |
| [`docs/PULSE-PIPELINE.md`](docs/PULSE-PIPELINE.md) | Cómo funciona el pipeline de scraping por dentro                 |

---

## Producto

**Lince** detecta inmuebles infravalorados en Catalunya antes que la competencia. Multi-fuente (portales, subastas BOE, banca), valoración con IA, alertas en minutos, mini-CRM de captación, marketing 360.

**ICP**: Inmobiliarias independientes 2-10 agentes, Catalunya (BCN, Maresme, Costa Brava), activas (>5 anuncios/mes).

**Pricing**: Basic €99 · Pro €249 · Élite €499. Programa Founder (10 primeros): 50% durante 6 meses.

---

## Cómo trabajamos

### Antes de empezar

- Lee los docs relevantes de la tabla anterior antes de tocar nada.
- Si la tarea tiene >3 pasos o es ambigua: escribe el plan y enséñamelo antes de ejecutar.
- Si una decisión no está documentada: **pregunta. NO inventes.**

### Durante el trabajo

- Edita archivos existentes antes de crear nuevos.
- Si añades una dependencia nueva, justifícala en el commit.
- Si tomas una decisión técnica que vale registrar, actualiza el doc correspondiente.

### Antes de dar por terminado

- `pnpm lint` sin errores.
- `pnpm typecheck` sin errores.
- `pnpm test` (cuando haya tests) verde.
- Resumen: qué hiciste, qué quedó pendiente, qué bloquea.

### Preguntar SIEMPRE antes de

- `DROP`, `DELETE FROM`, `rm -rf`, force-push.
- Cambios de schema en producción.
- Pagos o suscripciones nuevas.
- Cualquier acción que dispare emails / WhatsApps reales.
- Llamadas a APIs externas con coste >unos céntimos por test.

---

## Cómo correr en local

```bash
corepack enable
pnpm install
cp .env.example .env.local
# Rellenar variables en .env.local
pnpm --filter @lince/db prisma migrate dev
pnpm dev
# Solo workers/crawler:
pnpm --filter @lince/crawler-portales crawl --source pisos --max 25
```

---

**Última actualización**: sprint 1 completado (2026-05-13) · Mantenido por Marc Sanjuan + Claude Code
