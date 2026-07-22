# Lince — Plan de sprints y estado actual

## Plan (14 semanas)

| Sprint | Semanas | Foco                   | Output esperado                                                            |
| ------ | ------- | ---------------------- | -------------------------------------------------------------------------- |
| 0      | —       | Bootstrap              | Monorepo creado, dependencias instaladas                                   |
| 1      | 1-2     | Setup y fundamentos    | Auth, schema base, dashboard skeleton, landing mínima                      |
| 2      | 3-4     | Crawlers de portales   | Pisos.com + BOE para BCN/Maresme, normalización con catastro, dedup        |
| 3      | 5-6     | Inteligencia y alertas | Score €/m² (Claude), alertas email + Telegram bot, dashboard oportunidades |
| 4      | 7-8     | Captación              | Pipeline captures, generador propuesta PDF, templates WhatsApp/email       |
| 5      | 9-10    | Marketing venta        | Ficha SEO con Claude, foto IA con Replicate, distribución XML a Idealista  |
| 6      | 11-12   | Fuentes premium        | Crawler BOE subastas + SAREB, score adaptado                               |
| 7      | 13-14   | Beta cerrada           | Onboarding 4-5 founders, soporte en directo, feedback estructurado         |

Cada sprint termina con: demo en local, push a `main` con tag `sprint-N`, update de `CLAUDE.md`, lista de open questions.

## Estado actual — Sprint 1 (Lince Pulse Fase 1 ✅)

- [x] Repo bootstrapeado en `lince/`
- [x] Naming cerrado en **Lince** (2026-05-11)
- [x] Schema Prisma Pulse-ready con migración aplicada (`20260512212525_pulse_phase_1_initial`)
- [x] Supabase Frankfurt conectado (proyecto `ribgzxsseihjwjflzqlw`)
- [x] `packages/crawlers-core` con rate-limit, http (UA Lince), parsers tolerantes
- [x] `packages/db/src/repositories/` con `upsertProperty` y `crawlerRuns`
- [x] `workers/crawler-portales` con **Pisos.com**, **BOE** y **Solvia**, orchestrator y CLI
- [x] Smoke en producción: 25 propiedades Pisos.com + 15 BOE en DB. 0 errores.

## Pendientes Fase 1.B

- [ ] Crawler **Aliseda** (SPA Angular, Playwright o API)
- [ ] Verificar URL de **Haya, Casaktua, Anida**
- [ ] Filtro estricto provincia Pisos.com (CP que no empieza por 08/17/25/43)
- [ ] Resolver `city` null en Pisos.com (derivar desde CP)
- [ ] Integrar Catastro como enriquecedor (ref catastral → m², año, uso)

## Open questions / TODO para Marc

- [ ] Confirmar TLD del dominio (`.com` / `.cat` / `.app`)
- [ ] Comprar dominio en IONOS
- [ ] Crear cuentas: Anthropic, Google Cloud, Resend, Meta Business, Replicate, DigitalOcean
- [ ] Crear repo GitHub privado en org GNERAI
- [x] Proyecto Supabase Frankfurt creado y credenciales compartidas
- [ ] **Rotar password de DB Supabase** (se compartió en chat 2026-05-12)
- [ ] Crear droplet DigitalOcean Frankfurt 8 GB + SSH
- [ ] Pasar lista de inmobiliarias warm-leads con CP de su zona
