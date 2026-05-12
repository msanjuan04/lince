# @lince/scheduler

Daemon de cron que dispara el job semanal de Lince Pulse (`weekly-snapshot`) — barrido secuencial de las fuentes Tier verde (Pisos.com → BOE → Solvia).

Por defecto se ejecuta **cada lunes a las 06:00 hora Madrid**.

## Uso

### Disparar el job al instante (CLI)

```bash
# Todas las fuentes, 50 propiedades por fuente
pnpm --filter @lince/scheduler trigger-now

# Solo una fuente, con cap más bajo (smoke / dev)
pnpm --filter @lince/scheduler trigger-now -- --sources solvia --max 10

# Filtro por CP
pnpm --filter @lince/scheduler trigger-now -- --postal 08003,08010 --max 20
```

### Daemon (long-running)

```bash
# Foreground — bloquea el shell, ideal para Docker / systemd
pnpm --filter @lince/scheduler start

# Watch mode (rebuild on change) para desarrollo
pnpm --filter @lince/scheduler dev
```

## Variables de entorno

| Variable                      | Default            | Descripción                                        |
| ----------------------------- | ------------------ | -------------------------------------------------- |
| `SCHEDULER_CRON`              | `0 6 * * 1`        | Cron string (lunes 06:00). Validado con node-cron. |
| `SCHEDULER_TZ`                | `Europe/Madrid`    | Timezone IANA.                                     |
| `SCHEDULER_SOURCES`           | `pisos,boe,solvia` | Lista CSV de fuentes a ejecutar (orden importa).   |
| `SCHEDULER_MAX_PER_SOURCE`    | `50`               | Máximo de propiedades a ingerir por fuente.        |
| `SCHEDULER_RUN_ON_START`      | (vacío)            | Si `=1`, dispara el job al arrancar el daemon.     |
| `DATABASE_URL` / `DIRECT_URL` | —                  | Heredados del workspace (Supabase).                |

## Diseño

- **node-cron in-process**: el job corre en el mismo proceso que el scheduler. Para un MVP con un solo droplet (BCN/Pulse) es lo más simple y operable. Sin colas, sin Redis, sin extra infra.
- **Secuencial por fuente**: cada `runSource` tiene rate limit propio (2.5-3.5s/req). Lanzarlos en paralelo no acelera porque el límite está en el origen, no en CPU local. Además respetamos el pool de conexiones de Supabase (Transaction pooler).
- **Auditoría en DB**: cada ejecución de un crawler crea una fila en `crawler_runs` con timestamps, contadores (found/new/updated) y errores. El scheduler solo orquesta y loggea totales.
- **Histórico automático**: cuando un crawler vuelve a observar una propiedad con precio cambiado, `upsertProperty` inserta una fila en `price_history` con el delta. Sin código adicional aquí.

## Migración a BullMQ + Redis (Fase 2.C)

Cuando `REDIS_URL` esté disponible:

1. Añadir dependencia `bullmq` + `ioredis`.
2. Reemplazar `cron.schedule(...)` por un `Worker` BullMQ que consume jobs `pulse:weekly-snapshot` de una cola.
3. Un proceso productor (que puede ser este mismo scheduler) añade el job a la cola en cada tick de cron.

El job (`runWeeklySnapshot` en `src/jobs/weekly-snapshot.ts`) **no cambia** — solo cambia cómo se dispara.

Ventaja del cambio: persistencia (si el worker se cae a las 6:05, BullMQ retiene el job pendiente), reintentos automáticos, y posibilidad de escalar a múltiples workers paralelos cuando crezca el volumen.

## Despliegue en DigitalOcean (sprint 7+)

Pensamos meter este scheduler en el `docker-compose.yml` del droplet como service `scheduler`:

```yaml
scheduler:
  build:
    context: .
    dockerfile: workers/scheduler/Dockerfile
  env_file: .env
  restart: unless-stopped
  depends_on: [redis]
```

Logs se escriben a stdout — los recogerá `journald` (si systemd) o el log driver de Docker.
