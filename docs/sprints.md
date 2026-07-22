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

## Estado actual (act. 2026-07-22)

Sprint 1 completo y Sprints 2–3 sustancialmente entregados. El código va por
delante de este doc; lo que sigue está verificado contra el repo.

### Sprint 1 — Setup y fundamentos ✅

- [x] Repo bootstrapeado en `lince/`
- [x] Naming cerrado en **Lince** (2026-05-11)
- [x] Schema Prisma Pulse-ready con migración aplicada (`20260512212525_pulse_phase_1_initial`)
- [x] Supabase Frankfurt conectado (proyecto `ribgzxsseihjwjflzqlw`)
- [x] `packages/crawlers-core` con rate-limit, http (UA Lince), parsers tolerantes
- [x] `packages/db/src/repositories/` con `upsertProperty` y `crawlerRuns`

### Sprint 2 — Crawlers de portales ✅ (en producción)

- [x] Sources implementados: **Pisos.com**, **BOE**, **Solvia**, **Servihabitat**, **Aliseda**
- [x] **Aliseda** vía API interna (`laravel.alisedainmobiliaria.com/api/v2/new-search`), no Playwright — smoke OK (3/3, 0 errores, 2026-07-22)
- [x] Filtro estricto de provincia Pisos.com (descarta CP que no empiece por 08/17/25/43)
- [x] `city` derivada del slug en Pisos.com (ya no queda null)
- [x] Catastro integrado como enriquecedor (`workers/scheduler/src/enrichers/catastro.ts` → año, superficie, uso)

### Sprint 3 — Inteligencia y alertas 🟡 (mayoría hecha)

- [x] `opportunityScore` + `flip-estimator` (margen bruto, umbrales calibrables por env)
- [x] Alertas **Telegram** (HTML) y **WhatsApp** (texto) con los 3 datos clave: tiempo publicado, histórico de rebajas, datos de Catastro (+ link a Sede Electrónica). Valor catastral monetario NO se expone (dato fiscal protegido)
- [x] Evaluación de zonas con dedup `new_property`/`price_drop` por propertyId
- [ ] Dashboard de oportunidades — pendiente de repaso/QA
- [ ] Alertas por email (Resend) — pendiente

## Pendientes / próximos

- [ ] Crawler **Haya**, **Casaktua**, **Anida** (aún sin implementar)
- [ ] Verificar salud periódica del resto de sources (smoke programado)

## Open questions / TODO para Marc

- [ ] Confirmar TLD del dominio (`.com` / `.cat` / `.app`)
- [ ] Comprar dominio en IONOS
- [ ] Crear cuentas: Anthropic, Google Cloud, Resend, Meta Business, Replicate, DigitalOcean
- [ ] Crear repo GitHub privado en org GNERAI
- [x] Proyecto Supabase Frankfurt creado y credenciales compartidas
- [ ] **Rotar password de DB Supabase** (se compartió en chat 2026-05-12)
- [ ] Crear droplet DigitalOcean Frankfurt 8 GB + SSH
- [ ] Pasar lista de inmobiliarias warm-leads con CP de su zona
