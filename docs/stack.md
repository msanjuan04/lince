# Lince — Stack y decisiones técnicas

## Arquitectura (5 capas)

1. **Fuentes externas** — Pisos.com, BOE subastas, Solvia, SAREB vía servicers, banca, catastro, OCR carteles.
2. **Workers** — Node.js + TypeScript en droplet DigitalOcean (8 GB RAM, Frankfurt). Crawlers con Playwright/Cheerio + BullMQ.
3. **Core de datos** — Supabase Postgres (RLS + Auth + Realtime + Storage) + Redis Managed (BullMQ).
4. **Backend** — Next.js 16 API routes y Server Actions. Claude API (valoración + fichas), Replicate (foto IA), Google Maps, Resend, WhatsApp Cloud.
5. **Frontend** — Next.js 16 + shadcn/ui + Tailwind.

## Decisiones cerradas

- **TypeScript strict** en todo. NO `any` sin justificación.
- **Multi-tenancy con RLS** de Supabase (no schemas separados).
- **pnpm + Turborepo** como gestor y orquestador.
- **Auth.js v5** (next-auth beta) con Supabase como provider.
- **Prisma** para schema y migraciones (no Supabase migrations directas).
- **shadcn/ui** + Tailwind. NO añadir otra librería UI sin preguntar.
- **Server Actions > API routes** cuando sea posible.
- **Hosting**: DigitalOcean droplet Frankfurt — `apps/web`, `apps/landing` y `workers/` en el mismo droplet vía Docker + nginx. **NO Vercel** (decisión cerrada sprint 1).
- **Region**: Frankfurt (eu-central-1) — GDPR.
- **Node**: v22 LTS. **Package manager**: pnpm 11 (Corepack). **Next.js**: 16.2.6. **Prisma**: 6.x.

## Decisiones pendientes (pregunta a Marc)

- TLD del dominio (`.com`, `.cat`, `.app`)
- Email transaccional: subdominio o dominio principal
- Pago anual vs mensual de servicios externos
- Sprint 6: Idealista Data API oficial (€500-1000/mes) o seguir scraping ligero

## Servicios externos — coste estimado MVP (~€300/mes)

| Servicio              | Para qué                            | Coste       |
| --------------------- | ----------------------------------- | ----------- |
| DigitalOcean droplet  | Web + landing + workers (Frankfurt) | €48/mes     |
| Supabase Pro          | DB + Auth + Storage + Realtime      | €25/mes     |
| Redis (DO Managed)    | Queue BullMQ + caché                | €15/mes     |
| Anthropic Claude API  | Valoración + generación             | €80-120/mes |
| Google Maps Platform  | Geocoding + maps                    | €30/mes     |
| Resend                | Emails transaccionales              | €20/mes     |
| WhatsApp Cloud (Meta) | Alertas + contacto                  | €40-60/mes  |
| Replicate             | Foto IA + home staging              | €30/mes     |

## Estructura del repo

```
lince/
├── apps/
│   ├── web/              # Dashboard inmobiliaria (Next.js 16)
│   ├── landing/          # Landing comercial (Next.js 16)
│   └── admin/            # Panel admin interno (PENDIENTE)
├── packages/
│   ├── db/               # Prisma schema, cliente, helpers
│   ├── ui/               # Componentes shadcn/ui compartidos
│   ├── auth/             # Configuración Auth.js v5
│   ├── ai/               # Helpers Claude, prompts, valuator
│   ├── crawlers-core/    # Utilities compartidos crawlers
│   └── shared/           # Types y utils transversales
├── workers/
│   ├── crawler-portales/ # Pisos.com + BOE + Solvia
│   ├── crawler-subastas/ # (futuro)
│   ├── crawler-sareb/    # (WAF detectado, vía servicers)
│   ├── crawler-banca/    # Aliseda, Haya, Casaktua, Anida
│   ├── valuator/         # Score con Claude
│   ├── notifier/         # Resend + WhatsApp Cloud
│   └── publisher/        # XML feeds a portales
├── infra/
│   ├── docker-compose.yml
│   ├── nginx/
│   └── deploy/
└── CLAUDE.md
```

## Convenciones de código

### TypeScript

- Strict mode. `noUncheckedIndexedAccess: true`.
- Prefiere `unknown` > `any` para datos externos.
- Tipos derivados del schema Prisma cuando aplique.
- Validación de inputs públicos con **Zod** siempre.

### React / Next.js

- **Server Components por defecto**. `"use client"` solo si necesario.
- **Server Actions para mutaciones**. API routes solo si hay consumidor externo.
- NO `useState` para datos del servidor. Usa `useFormState` o Server Actions con `revalidatePath`.

### Naming

- Archivos TS no-React: `kebab-case.ts`
- Componentes React: `PascalCase.tsx`
- Hooks: `useCamelCase.ts`
- Variables/funciones: `camelCase`. Constantes globales: `SCREAMING_SNAKE`.
- Tablas/columnas DB: `snake_case`.

### Git

- Conventional commits **en español**: `feat:`, `fix:`, `chore:`, `refactor:`, `docs:`, `test:`.
- Branch por feature: `feat/crawler-idealista`.
- **NUNCA push a `main` directo**. Siempre PR.

### Testing

- **Vitest** para unit tests de lógica pura.
- **Playwright** para E2E a partir de sprint 7.
- Prioriza tests de: valuator, parsers de crawlers, RLS.

## `.env.example`

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
DATABASE_URL=
AUTH_SECRET=
AUTH_URL=http://localhost:3000
ANTHROPIC_API_KEY=
GOOGLE_MAPS_API_KEY=
RESEND_API_KEY=
RESEND_FROM_EMAIL=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_BUSINESS_ACCOUNT_ID=
REPLICATE_API_TOKEN=
REDIS_URL=
DO_API_TOKEN=
DO_DROPLET_IP=
NODE_ENV=development
LOG_LEVEL=debug
```
