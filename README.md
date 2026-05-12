# Lince

Plataforma B2B SaaS de captación inmobiliaria automatizada para Catalunya. Detecta inmuebles infravalorados antes que la competencia y le da a la inmobiliaria el flujo completo: alerta → captación → puesta en venta multi-portal.

> **La fuente de verdad del proyecto es [`CLAUDE.md`](./CLAUDE.md)**. Léelo entero antes de tocar código. Este README solo cubre el setup técnico.

---

## Stack

- **pnpm + Turborepo** monorepo
- **Next.js 16** + React 19 (App Router, Server Components, Tailwind 4)
- **Prisma 6** + Postgres (Supabase, región Frankfurt)
- **TypeScript 5** strict + `noUncheckedIndexedAccess`
- **shadcn/ui** + Tailwind 4
- Workers en **Node 22** sobre droplet DigitalOcean (BullMQ + Redis), no incluidos aún

## Requisitos

- **Node 22** (anclado en `.nvmrc`)
- **pnpm 11** (vía Corepack: `corepack enable`)
- **Git 2.40+**

## Setup

```bash
# Una sola vez
corepack enable                    # activa pnpm
pnpm install
cp .env.example .env.local
# Rellenar variables en .env.local (ver sección 5 de CLAUDE.md)

# Generar cliente Prisma (no requiere DB)
pnpm --filter @lince/db prisma generate

# Cuando exista proyecto Supabase, aplicar schema
pnpm --filter @lince/db db:migrate
```

## Scripts comunes

```bash
pnpm dev              # arranca todos los apps en paralelo (web :3000, landing :3001)
pnpm build            # build de todos
pnpm lint             # ESLint en todo el repo
pnpm typecheck        # tsc --noEmit en todos los packages
pnpm format           # Prettier sobre todo

# Filtrar a un workspace concreto
pnpm --filter @lince/web dev
pnpm --filter @lince/db db:studio
```

## Estructura

```
.
├── apps/
│   ├── web/              # Dashboard inmobiliaria (Next.js)
│   └── landing/          # Landing comercial (Next.js)
├── packages/
│   ├── db/               # Prisma schema + cliente
│   ├── ui/               # Componentes compartidos (vacío hasta que haga falta)
│   ├── auth/             # Auth.js v5 (sprint 1)
│   ├── ai/               # Claude API + valuator (sprint 3)
│   ├── crawlers-core/    # Utilities crawlers (sprint 2)
│   └── shared/           # Types y utils transversales
├── workers/              # Procesos largos (sprints 2+)
├── CLAUDE.md             # Fuente de verdad del proyecto
└── README.md
```

## Convenciones

- Commits: **conventional commits en español** (`feat: …`, `fix: …`, `chore: …`).
- Pre-commit ejecuta `lint-staged` (Prettier sobre archivos staged).
- **NUNCA** `git push --force` ni `--no-verify` sin avisar.
- Detalles completos en [`CLAUDE.md` §7](./CLAUDE.md#7-convenciones-de-código).

## Estado

Sprint 0 (bootstrap) completo. Próximo: sprint 1 — Auth, schema en Supabase, dashboard skeleton, landing mínima.
