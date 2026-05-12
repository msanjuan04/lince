# Lince · CLAUDE.md

> Plataforma B2B SaaS de captación inmobiliaria automatizada para Catalunya.
> Este documento es la **fuente de verdad** del proyecto. Léelo entero antes de cualquier acción.
> Si tomas una decisión que no está aquí, **actualiza este archivo** en el mismo commit.

---

## TL;DR para ti, Claude Code

- Soy **Marc Sanjuan**, co-fundador de [GNERAI](https://gnerai.com). Construyo Lince contigo (Marc Cortada se sumará en sprints concretos).
- **Stack**: Next.js 16 + Supabase + DigitalOcean + Anthropic API. Bootstrap puro, sin inversión externa.
- Estamos en **sprint 0** (bootstrap del repo). El plan completo de 14 semanas está en la sección 6.
- **Antes de cualquier acción destructiva, costosa o ambigua**: pregunta. Para todo lo demás: muestra plan, ejecuta, resume.
- Comunícate en **español**. Términos técnicos en inglés cuando sea natural (`commit`, `pull request`, `crawler`, etc.).

---

## 1. Producto

### Qué es Lince

Lince detecta inmuebles infravalorados en Catalunya **antes que la competencia** y le da a la inmobiliaria todo lo que necesita para captarlos y luego venderlos. Multi-fuente (portales, subastas BOE, SAREB, banca, notarías, OCR carteles), valoración con IA, alertas en minutos desde la publicación, mini-CRM de captación, y módulo de marketing 360 (ficha SEO, foto IA, distribución multi-portal, retargeting).

### Cliente objetivo (ICP)

**Sí**:

- Inmobiliarias independientes con 2-10 agentes
- Catalunya: Barcelona, Maresme, Costa Brava
- Activas (>5 anuncios/mes en Idealista)
- Decisor accesible (gerente o dueño)
  **No**:
- Microempresas de 1 persona
- Franquicias grandes con CRM corporativo impuesto (Tecnocasa, Engel & Völkers España)
- Solo alquiler turístico u obra nueva con promotor único
- Inactivas

### Pricing

| Plan  | Precio   | Para quién                                                    |
| ----- | -------- | ------------------------------------------------------------- |
| Basic | €99/mes  | Inmobiliaria local, 1 zona, portales solo                     |
| Pro   | €249/mes | BCN/Maresme, 3 zonas, + subastas BOE + SAREB + multi-portal   |
| Élite | €499/mes | Costa Brava, fuentes premium, foto IA, retargeting, ilimitado |

**Programa Lince Founder** (los 10 primeros): 50% durante 6 meses + 14 días gratis sin tarjeta + 30 días money-back, a cambio de testimonio + caso de uso público + feedback semanal.

### Naming y brand

- **Nombre**: **Lince** (cerrado definitivamente). Hubo un intento intermedio de renombrar a `Gimm` que se revirtió. La carpeta raíz del repo aún se llama `Gimm/` por accidente histórico — renombrar a `lince/` cuando se haga el primer push a GitHub.
- **Estética**: flat, near-monocromo, tipografía limpia tipo `Inter` o similar. Inspiración visual: gnerai.com. Nada de gradientes, sombras o decoración.

---

## 2. Arquitectura técnica

### Cinco capas (de fuera hacia adentro)

1. **Fuentes externas** — portales (Idealista, Fotocasa, Habitaclia), subastas BOE, SAREB, banca (Aliseda, Solvia, Haya, Casaktua, Anida), catastro abierto, OCR carteles de calle.
2. **Workers** — Node.js + TypeScript en droplet DigitalOcean (8 GB RAM, Frankfurt — compartido con web/landing). Crawlers con Playwright/Cheerio + BullMQ. Procesos: crawler-portales, crawler-subastas, crawler-sareb, crawler-banca, valuator (IA), notifier, publisher de feeds XML.
3. **Core de datos** — Supabase (Postgres con RLS + Auth + Realtime + Storage) + Redis Managed (queue BullMQ).
4. **Backend** — Next.js 16 API routes y Server Actions. Integraciones con Claude API (valoración + generación de fichas/propuestas), Replicate (foto IA + home staging), Google Maps Platform, Resend (email), WhatsApp Cloud API (Meta).
5. **Frontend** — Next.js 16 + shadcn/ui + Tailwind. Dashboard inmobiliaria, alertas en tiempo real (vía Supabase Realtime), generador de propuestas, panel de captures y listings.

### Decisiones técnicas cerradas

- **TypeScript strict** en todo el monorepo. NO `any` salvo justificado en comentario.
- **Multi-tenancy con Row-Level Security** de Supabase, no schemas separados.
- **pnpm + Turborepo** como gestor de paquetes y orquestador.
- **Auth.js v5** (next-auth beta) con Supabase como provider de credenciales y email magic link.
- **Prisma** para schema y migraciones (no Supabase migrations directas).
- **shadcn/ui** + Tailwind. NO añadir otra librería UI sin preguntar.
- **Server Actions > API routes** cuando sea posible.
- **Hosting**: **DigitalOcean droplet (Frankfurt) para todo** — `apps/web`, `apps/landing` y `workers/` corren en el mismo droplet vía Docker + nginx reverse proxy. **NO usamos Vercel** (decisión cerrada en sprint 1 — control de coste y datos en EU). Supabase para DB y Storage.
- **Region**: Frankfurt (eu-central-1) — GDPR.
- **Node**: v22 LTS (anclado en `.nvmrc`). Actualizado desde v20 en sprint 0 — entorno de Marc ya tenía v22.
- **Package manager**: pnpm 11 (activado vía Corepack).
- **Next.js**: 16.2.6 (subido desde Next 15 en sprint 0 — `create-next-app@latest` instala 16, compatible con todo el stack y React 19).
- **Prisma**: 6.x.

### Decisiones pendientes (no inventes — pregunta a Marc)

- TLD del dominio (`.com`, `.cat`, `.app`)
- Email transaccional: subdominio (`notify.dominio`) o dominio principal
- Pago anual (-20%) o mensual de los servicios externos
- Si en sprint 6 usamos Idealista Data API oficial (€500-1000/mes) o seguimos con scraping ligero

---

## 3. Estructura del repo

```
lince/
├── apps/
│   ├── web/              # Dashboard inmobiliaria (Next.js 16)
│   ├── landing/          # Landing comercial (Next.js 16)
│   └── admin/            # Panel admin interno de Marc (PENDIENTE — se crea cuando toque)
├── packages/
│   ├── db/               # Prisma schema, cliente, helpers
│   ├── ui/               # Componentes shadcn/ui compartidos (solo si se usan en >1 app)
│   ├── auth/             # Configuración Auth.js v5
│   ├── ai/               # Helpers Claude, prompts, valuator
│   ├── crawlers-core/    # Utilities compartidos por crawlers (rate-limit, robots, dedup)
│   └── shared/           # Types y utils transversales
├── workers/
│   ├── crawler-portales/ # Iter 1.A: Pisos.com + BOE. Iter 1.B: Solvia (SPA, requiere Playwright/API).
│   │                     # Idealista/Fotocasa/Habitaclia descartados por WAF (ver §9).
│   ├── crawler-subastas/ # (futuro) — actualmente BOE vive en crawler-portales
│   ├── crawler-sareb/    # SAREB (WAF detectado en sprint 1, vía Anticipa/Aliseda)
│   ├── crawler-banca/    # Aliseda, Haya, Casaktua, Anida (pendientes de URL correcta)
│   ├── valuator/         # Score €/m² con Claude
│   ├── notifier/         # Resend + WhatsApp Cloud
│   └── publisher/        # XML feeds out a portales
├── infra/
│   ├── docker-compose.yml
│   ├── nginx/
│   └── deploy/
├── CLAUDE.md             # Este archivo
├── README.md             # Setup para humanos
├── package.json          # workspace root
├── pnpm-workspace.yaml
├── turbo.json
├── tsconfig.base.json
├── .env.example
└── .gitignore
```

**Nota sprint 0**: `apps/admin` y `workers/*` no se crean aún. Se añaden cuando arranque su sprint correspondiente (sección 6).

---

## 4. Schema de base de datos

Prisma sobre Postgres (Supabase). El schema vive en `packages/db/prisma/schema.prisma`. SQL equivalente para referencia:

```sql
-- Multi-tenant: cada inmobiliaria es un agency
CREATE TABLE agencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  plan TEXT NOT NULL CHECK (plan IN ('basic','pro','elite','founder')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  active BOOLEAN DEFAULT TRUE
);
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE agency_members (
  agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner','agent','admin')),
  PRIMARY KEY (agency_id, user_id)
);
-- Propiedades capturadas (global, no multi-tenant)
CREATE TABLE properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL,           -- idealista, fotocasa, boe, sareb, aliseda, ...
  source_id TEXT NOT NULL,
  source_url TEXT,
  type TEXT,                      -- piso, casa, local, etc.
  address TEXT,
  city TEXT,
  postal_code TEXT,
  province TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  cadastral_ref TEXT,
  m2 INTEGER,
  rooms INTEGER,
  bathrooms INTEGER,
  year_built INTEGER,
  price NUMERIC(12,2),
  price_per_m2 NUMERIC(10,2),
  zone_avg_price_per_m2 NUMERIC(10,2),
  opportunity_score NUMERIC(5,2), -- 0..100
  status TEXT,                    -- active, sold, withdrawn
  raw_data JSONB,                 -- payload original de la fuente
  first_seen TIMESTAMPTZ DEFAULT NOW(),
  last_seen TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (source, source_id)
);
CREATE INDEX idx_properties_postal ON properties(postal_code);
CREATE INDEX idx_properties_score ON properties(opportunity_score DESC);
CREATE INDEX idx_properties_geo ON properties(lat, lng);
-- Zonas que cada inmobiliaria monitoriza
CREATE TABLE zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE,
  name TEXT,
  geometry JSONB,                 -- GeoJSON polygon
  postal_codes TEXT[],
  filters JSONB,                  -- min_score, max_price, type, etc.
  alert_channels TEXT[],          -- ['email', 'whatsapp']
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
-- Pipeline de captación
CREATE TABLE captures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE,
  property_id UUID REFERENCES properties(id),
  status TEXT CHECK (status IN ('new','contacted','meeting','signed','lost')),
  notes TEXT,
  owner_name TEXT,
  owner_phone TEXT,
  owner_email TEXT,
  proposal_pdf_url TEXT,
  contacted_at TIMESTAMPTZ,
  signed_at TIMESTAMPTZ,
  deal_value NUMERIC(12,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
-- Listings (al captar, ponemos a la venta)
CREATE TABLE listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  capture_id UUID REFERENCES captures(id),
  agency_id UUID REFERENCES agencies(id) ON DELETE CASCADE,
  ficha_seo_text TEXT,
  photos JSONB,                   -- [{url, alt, order}]
  staging_photos JSONB,           -- versiones IA-enhanced
  price NUMERIC(12,2),
  status TEXT CHECK (status IN ('draft','live','sold','withdrawn')),
  distributed_to TEXT[],          -- ['idealista','fotocasa',...]
  views_count INTEGER DEFAULT 0,
  leads_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
-- Leads de compradores
CREATE TABLE listing_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID REFERENCES listings(id),
  agency_id UUID REFERENCES agencies(id),
  name TEXT,
  email TEXT,
  phone TEXT,
  source TEXT,
  message TEXT,
  status TEXT CHECK (status IN ('new','contacted','qualified','lost','closed')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
-- Auditoría de runs de crawler
CREATE TABLE crawler_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL,
  status TEXT,
  properties_found INTEGER,
  properties_new INTEGER,
  properties_updated INTEGER,
  errors JSONB,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ
);
-- RLS: cada miembro solo ve datos de su agency
ALTER TABLE zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE captures ENABLE ROW LEVEL SECURITY;
ALTER TABLE listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE listing_leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members see own agency zones"
  ON zones FOR SELECT
  USING (agency_id IN (
    SELECT agency_id FROM agency_members WHERE user_id = auth.uid()
  ));
-- Replicar política equivalente para captures, listings, listing_leads.
```

**Notas de modelado**:

- `properties` es global (sin `agency_id`) — la captamos una vez por fuente y todas las inmobiliarias la ven según sus zonas.
- `captures` y `listings` son por agency — ahí entra RLS.
- `raw_data` JSONB guarda el payload original de la fuente para reprocesar si cambiamos el parser.

---

## 5. Servicios externos y variables de entorno

### Imprescindibles MVP

| Servicio              | Para qué                                         | Coste       | Estado         |
| --------------------- | ------------------------------------------------ | ----------- | -------------- |
| DigitalOcean droplet  | Web + landing + workers (8 GB Frankfurt, Docker) | €48/mes     | pendiente alta |
| Supabase Pro          | DB + Auth + Storage + Realtime                   | €25/mes     | pendiente alta |
| Redis (DO Managed)    | Queue BullMQ + caché                             | €15/mes     | pendiente alta |
| Anthropic Claude API  | Valoración + generación                          | €80-120/mes | pendiente alta |
| Google Maps Platform  | Geocoding + maps                                 | €30/mes     | pendiente alta |
| Resend                | Emails transaccionales                           | €20/mes     | pendiente alta |
| WhatsApp Cloud (Meta) | Alertas + contacto                               | €40-60/mes  | pendiente alta |
| Replicate             | Foto IA + home staging                           | €30/mes     | pendiente alta |

**Total MVP**: ~€300/mes. Break-even con 2 founders pagando.

**Nota deploy**: el droplet corre Docker Compose con `apps/web`, `apps/landing` y `workers/*`. Nginx hace reverse proxy: `lince.cat` → landing, `app.lince.cat` → web. Self-host de Next 16 con `next start` + `sharp` para optimización de imágenes. **NO usamos Vercel** (decisión cerrada en sprint 1).

### Opcionales (escalado)

- **Idealista Data API oficial** — €500-1000/mes. Solo cuando haya >10 clientes pagando.
- **Google Vision API** — €20-40/mes. Para módulo OCR carteles.
- **Sentry + Better Stack** — €0-30/mes (free tier hasta cierto volumen).

### `.env.example`

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
DATABASE_URL=                      # Postgres connection string para Prisma
# Auth.js v5
AUTH_SECRET=                       # generar con `openssl rand -hex 32`
AUTH_URL=http://localhost:3000
# Anthropic Claude
ANTHROPIC_API_KEY=
# Google Maps Platform
GOOGLE_MAPS_API_KEY=
# Resend
RESEND_API_KEY=
RESEND_FROM_EMAIL=                 # ej: notify@lince.cat
# WhatsApp Cloud (Meta)
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_BUSINESS_ACCOUNT_ID=
# Replicate
REPLICATE_API_TOKEN=
# Redis
REDIS_URL=
# DigitalOcean (workers deployment)
DO_API_TOKEN=
DO_DROPLET_IP=
# Misc
NODE_ENV=development
LOG_LEVEL=debug
```

---

## 6. Plan de sprints (14 semanas)

| Sprint | Semanas | Foco                   | Output esperado                                                                                    |
| ------ | ------- | ---------------------- | -------------------------------------------------------------------------------------------------- |
| 0      | —       | Bootstrap              | Monorepo creado, dependencias instaladas, hello-world deployable                                   |
| 1      | 1-2     | Setup y fundamentos    | Auth, schema base, dashboard skeleton, landing mínima                                              |
| 2      | 3-4     | Crawlers de portales   | Idealista + Fotocasa para BCN/Maresme operativos, normalización con catastro, dedup                |
| 3      | 5-6     | Inteligencia y alertas | Score €/m² (Claude), alertas email (Resend) y Telegram bot, dashboard de oportunidades con filtros |
| 4      | 7-8     | Captación              | Pipeline de captures, generador propuesta PDF (Puppeteer), templates WhatsApp/email                |
| 5      | 9-10    | Marketing venta        | Ficha SEO con Claude, foto IA con Replicate, distribución XML a Idealista                          |
| 6      | 11-12   | Fuentes premium        | Crawler BOE subastas + crawler SAREB, score adaptado, integración dashboard                        |
| 7      | 13-14   | Beta cerrada           | Onboarding 4-5 founders, soporte WhatsApp en directo, recogida de feedback estructurada            |

**Cada sprint termina con**:

- Demo en local funcionando.
- Push a `main` con tag `sprint-N`.
- Update de `CLAUDE.md` con decisiones nuevas.
- Lista de open questions / blockers.

---

## 7. Convenciones de código

### TypeScript

- Strict mode en `tsconfig.base.json`. `noUncheckedIndexedAccess: true`.
- Prefiere `unknown` > `any` para datos externos.
- Tipos derivados del schema Prisma (`Prisma.PropertyGetPayload<...>`) cuando aplique.
- Validación de inputs públicos con **Zod** siempre.

### React / Next.js

- **Server Components por defecto**. Client Components solo cuando necesario (`"use client"` arriba del archivo).
- **Server Actions para mutaciones** siempre que se pueda. API routes solo si hay un consumidor externo.
- Hooks personalizados en `apps/web/src/hooks/`.
- shadcn/ui como base. Componentes propios en `packages/ui/` solo si se reutilizan en >1 app.
- NO `useState` para datos del servidor. Usa `useFormState` o Server Actions con `revalidatePath`.

### Naming

- Archivos TS no-React: `kebab-case.ts` (`get-property-score.ts`).
- Componentes React: `PascalCase.tsx` (`PropertyCard.tsx`).
- Hooks: `useCamelCase.ts` (`useZoneAlerts.ts`).
- Variables/funciones: `camelCase`. Constantes globales: `SCREAMING_SNAKE`.
- Tipos/interfaces: `PascalCase`, **sin** prefijo `I`.
- Tablas/columnas DB: `snake_case`.

### Git

- Conventional commits **en español**: `feat:`, `fix:`, `chore:`, `refactor:`, `docs:`, `test:`.
  - Ejemplo: `feat: añadir crawler de SAREB con rate limiting`
- Branch por feature: `feat/crawler-idealista`, `fix/auth-redirect`.
- **NUNCA push a `main` directo**. Siempre PR.
- **NO** `git push --force` sin avisar.
- **NO** `git commit --no-verify`.

### Comentarios

- Solo donde el porqué no se ve del código. **NO comentar el qué**.
- JSDoc para funciones exportadas con lógica de negocio o efectos.
- TODOs con contexto y autor: `// TODO(marc): mover a worker cuando crawler-banca esté listo`.

### Testing

- **Vitest** para unit tests de lógica pura (valuator, helpers, parsers de crawler).
- **Playwright** para E2E del dashboard a partir de sprint 7.
- NO testing obsesivo en MVP. Prioriza tests de:
  - Valuator (cálculo €/m² y score).
  - Parsers de cada crawler.
  - RLS (que un usuario no vea datos de otra agency).

### Estilo y linting

- ESLint con config compartida en raíz.
- Prettier con `.prettierrc` compartido.
- Husky + lint-staged: lint + typecheck + format en pre-commit.
- Tailwind: clases en orden lógico (layout → spacing → typography → color → state).

---

## 8. Cómo quiero trabajar contigo

### Antes de empezar una tarea

- **Lee** este CLAUDE.md y los archivos relevantes antes de tocar nada.
- Si la tarea tiene **>3 pasos o es ambigua**, escribe el plan y enséñamelo antes de ejecutar.
- Si una decisión no está aquí, **pregunta**. NO inventes.

### Durante el trabajo

- Usa **TodoWrite** para tareas multi-paso.
- **Edita archivos existentes** antes de crear nuevos cuando sea posible.
- Si añades una **dependencia nueva**, justifícala en el commit message.
- Si tomas una **decisión técnica que vale registrar**, actualiza este CLAUDE.md en el mismo commit.

### Antes de dar por terminado

- `pnpm lint` sin errores.
- `pnpm typecheck` sin errores.
- `pnpm test` (cuando haya tests) verde.
- Resumen al final: qué hiciste, qué quedó pendiente, qué bloquea.

### Cuando preguntar **siempre**

- Operaciones destructivas: `DROP`, `DELETE FROM`, `rm -rf`, force-push.
- Cambios de schema en producción.
- Pagos o suscripciones nuevas.
- Cambios en `.env` que afecten producción.
- Cualquier acción que dispare emails / WhatsApps reales a usuarios.
- Llamadas a APIs externas con coste por uso superior a unos pocos céntimos por test.

### Cuando **NO** preguntar

- Crear archivos del scope del sprint actual.
- Refactor local sin cambios de API pública.
- Instalar dependencias del stack ya decidido.
- Correr lints, builds, tests.
- Resolver conflictos triviales de tipos o imports.

### Si te bloqueas

Dime exactamente:

1. Qué intentaste.
2. Qué error o ambigüedad tienes.
3. Qué opciones ves y cuál recomiendas.
   Nunca te quedes en silencio o devuelvas un "lo intenté pero no pude" sin contexto.

---

## 9. Restricciones legales y de privacidad

### Scraping

- **Respeta `robots.txt`** de cada sitio.
- **Rate limit defensivo**:
  - Portales (Idealista, Fotocasa, Habitaclia): 1 request cada 2-3 segundos máximo.
  - Banca (Aliseda, Solvia, Haya): 1 request cada 5 segundos.
  - BOE / SAREB / catastro: respetar headers que devuelvan, conservador por defecto.
- **User-Agent identificable**: `LinceBot/1.0 (+https://lince.cat/bot)`.
- Almacenar `first_seen` y `last_seen` para auditoría.
- **NO scraping agresivo de Idealista**. Si un sprint requiere volumen serio, escalamos a la API oficial (~€500-1000/mes), no aumentamos rate.

#### Mapa de fuentes confirmado (sprint 1 — Lince Pulse Fase 1)

Tras barrido de 25+ fuentes, este es el estado real del mercado:

**✅ Tier 1 — scrapeable directo con UA `LinceBot/1.0`** (en producción):

- **Pisos.com** — portal mainstream, HTML estático con SSR, sin WAF. Listado paginado por CP, detalle con `<h1>`, descripción, características en `<li>`. Rate 3.5s. Cubre Bucket A (vendedor desesperado), C (margen reforma), E (premium oculto), F (yield).
- **BOE Subastas** — oficial, HTML clásico. Dos fetches por subasta: `?ver=1` (datos subasta: valor, tasación) + `?ver=3` (datos del bien: dirección, CP, ref catastral, descripción legal). Rate 2.5s. Cubre Bucket B (origen institucional).

**⚠️ Tier 2 — pospuesto a iteración 1.B**:

- **Solvia** — bank-owned servicer. SSR Angular: el HTML sirve URLs de detalle, pero el precio se carga dinámicamente vía JS, no aparece en HTML estático. La API interna `/api/inmuebles/v1/...` existe (404 JSON estructurado, no WAF) pero los endpoints comunes devuelven 404. Requiere Playwright o descubrir la API exacta. Aporta Bucket B bank-owned cuando se integre.

**🚧 Pendientes de URL correcta** (verificar en iteración 1.B):

- **Haya, Casaktua, Anida (BBVA)** — timeouts / SSL errors en URLs candidatas. Dominio puede haber cambiado.
- **Engel & Völkers, Servihabitat, Hipoges, Tucasa, Enalquiler** — HTML 404 en URLs candidatas pero sin WAF; URL correcta a descubrir.

**❌ Tier rojo — WAF activo, descartados** (no scrapear sin acuerdo de partnership o Data API oficial):

- **Idealista** — DataDome, devuelve captcha incluso para `robots.txt`. Requiere Idealista Data API oficial (€500-1000/mes, Sprint 6+ según plan).
- **Fotocasa** — Cloudflare/Akamai, HTTP 403 a `curl` y `LinceBot/1.0`. Mismo dueño que Habitaclia (Adevinta).
- **Habitaclia** — PerimeterX ("Pardon Our Interruption"), HTTP 403.
- **Yaencontre** — DataDome, mismo que Idealista.
- **SAREB oficial** — HTTP 403 con WAF Cloudflare-style. Inventario SAREB se accede vía Anticipa/Solvia/Aliseda como servicers.
- **Altamira** — Akamai Access Denied.

**Política de UA híbrido (excepción documentada)**:

- Si en el futuro una fuente del Tier 2 requiere browser-real para acceder, **primero** intentamos UA Chrome estándar **con sufijo `LinceBot/1.0 (+https://lince.cat/bot)`** (opción A: Chrome+Lince — identificable). Solo si la fuente filtra el sufijo, caemos a UA Chrome puro (opción B), respetando estrictamente `robots.txt` y rate limit conservador. Nunca evadimos captchas ni WAFs activos.

### GDPR

- Postgres en Frankfurt (Supabase región eu-central-1). Storage también.
- Datos personales (nombres, teléfonos de propietarios y compradores) **cifrados en reposo** vía pgcrypto cuando aplique.
- Logs **sin PII** salvo necesario; redactar en producción.
- **Política de retención**:
  - Datos de captures: 5 años (cumple obligaciones fiscales y de actividad inmobiliaria).
  - Leads compradores: 2 años desde último contacto.
  - Logs aplicativos: 90 días.
  - Logs de crawler runs: 1 año.

### Comunicaciones a terceros

- Cuando enviemos email/WhatsApp a propietarios o compradores **vía la inmobiliaria cliente**, registrar:
  - Consentimiento (origen del dato + base legal).
  - Mecanismo de opt-out claro en cada mensaje.
- Plantillas de WhatsApp Business deben estar **pre-aprobadas por Meta** antes de enviarse en producción.
- Email transaccional: SPF + DKIM + DMARC configurados desde el dominio.

---

## 10. Estado actual y primera tarea

### Estado actual (sprint 1 — Lince Pulse Fase 1 ✅)

- [x] Repo bootstrapeado en `Gimm/` (carpeta; producto se llama Lince).
- [x] Naming cerrado en **Lince** (2026-05-11).
- [x] Schema Prisma con tablas Pulse-ready (description, condition, isAuction, isBankOwned, redFlags, etc.).
- [x] Migración inicial aplicada: `prisma/migrations/20260512212525_pulse_phase_1_initial/`.
- [x] Supabase Frankfurt conectado (proyecto `ribgzxsseihjwjflzqlw`, Transaction pooler en `aws-1-eu-central-1`).
- [x] `packages/crawlers-core` con rate-limit, http (UA Lince), parsers tolerantes (m², precio, condition, terraza, ascensor, planta, orientación, banderas rojas).
- [x] `packages/db/src/repositories/` con `upsertProperty` (con diff de precio/descripción para Fase 2) y `crawlerRuns`.
- [x] `workers/crawler-portales` con módulos **Pisos.com** y **BOE**, orchestrator y CLI (`pnpm --filter @lince/crawler-portales crawl --source <pisos|boe> --max N`).
- [x] Smoke en producción: 25 propiedades de Pisos.com + 15 de BOE en DB. 0 errores.

### Pendientes Fase 1.B (próxima iteración del crawler)

- [ ] Crawler **Solvia** con Playwright o API descubierta (precio crítico para Bucket B).
- [ ] Crawler **Aliseda** (SPA Angular, similar a Solvia).
- [ ] Verificar URL correcta de **Haya, Casaktua, Anida** (probables, sin WAF detectado).
- [ ] Filtro estricto de provincia en Pisos.com (vimos una entrada CP 25497 de Lleida en listado BCN).
- [ ] Resolver `city` en Pisos.com (parser tolerante actual deja null cuando CP está presente, hay que derivarlo).
- [ ] Integrar Catastro como enriquecedor (ref catastral → m², año, uso) cuando una fuente no expone esos campos.

### Open questions / TODO para Marc

- [ ] Confirmar TLD del dominio (`.com` / `.cat` / `.app`)
- [ ] Comprar dominio en IONOS
- [ ] Crear cuentas en: Anthropic, Google Cloud, Resend, Meta Business, Replicate, DigitalOcean
- [ ] Crear repo GitHub privado en org GNERAI e invitarme
- [x] Crear proyecto Supabase Frankfurt y compartir credenciales (DB connection string aplicado en `.env.local`)
- [ ] **Rotar password de DB Supabase** — se compartió en chat 2026-05-12, rotar tras Fase 1.
- [ ] Crear droplet DigitalOcean Frankfurt 8 GB y compartir SSH (sirve web + landing + workers)
- [ ] Pasar lista de inmobiliarias warm-leads (los pre-founders) con CP de su zona

---

## Apéndice A — Prompts del valuator (referencia)

El valuator combina cálculo determinista (mediana €/m² del CP) con razonamiento de Claude para ajustar el score con factores cualitativos (estado del inmueble, urgencia del anuncio, indicadores de motivación del vendedor en el texto).
Pseudocódigo del flujo:

```ts
// packages/ai/src/valuator.ts
async function scoreProperty(property: Property): Promise<{ score: number; rationale: string }> {
  const zoneStats = await getZoneStats(property.postal_code, property.type);
  const baseDelta = (zoneStats.median - property.price_per_m2) / zoneStats.median;
  const baseScore = Math.max(0, Math.min(100, baseDelta * 200)); // -50% = 100, 0% = 0
  // Ajuste cualitativo con Claude
  const qualitative = await claude.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 500,
    messages: [
      {
        role: 'user',
        content: buildValuatorPrompt(property, zoneStats, baseScore),
      },
    ],
  });
  const adjusted = parseAdjustedScore(qualitative);
  return { score: adjusted.score, rationale: adjusted.rationale };
}
```

## El prompt completo del valuator vive en `packages/ai/src/prompts/valuator.ts` y se versiona como cualquier otro código.

## Apéndice B — Cómo correr en local

```bash
# Una sola vez
corepack enable                    # activa pnpm (incluido en Node 22)
pnpm install
cp .env.example .env.local
# Rellenar variables en .env.local
# Migrar DB (cuando exista proyecto Supabase)
pnpm --filter @lince/db prisma migrate dev
# Arrancar todo
pnpm dev
# Solo un app
pnpm --filter @lince/web dev
```

---

**Última actualización**: sprint 0 — bootstrap del monorepo (2026-05-10)
**Mantenido por**: Marc Sanjuan + Claude Code
