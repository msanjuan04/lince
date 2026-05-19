#!/bin/bash
# Wrapper que carga el entorno y dispara el snapshot diario completo.
# Invocado por launchd cada día a las 04:00 (ver com.lince.scheduler-daily.plist).
#
# Lo que hace:
#   1. Carga PATH (necesario porque launchd no hereda el de tu shell login).
#   2. Carga .env del proyecto.
#   3. Ejecuta `pnpm --filter @lince/scheduler trigger-now`, que internamente:
#      crawl (Pisos, BOE, Solvia, Servihabitat, Aliseda) → enrich-catastro →
#      score-properties → evaluate-zones → detect-disappeared → analyze-photos.
#
# Logs en infra/launchd/logs/. Si la corrida falla, exit code != 0 y launchd
# escribe stderr al log.

set -euo pipefail

# nvm Node 24 + pnpm location (ajustar si cambias la versión node con `nvm use`).
export PATH="/Users/marccortadaroca/.nvm/versions/node/v24.11.1/bin:/usr/local/bin:/usr/bin:/bin"

PROJECT_DIR="/Users/marccortadaroca/lince/lince"
cd "$PROJECT_DIR"

# Carga .env (set -a hace que cualquier var leída sea exportada automáticamente).
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

LOG_DIR="$PROJECT_DIR/infra/launchd/logs"
mkdir -p "$LOG_DIR"
TS=$(date +'%Y-%m-%d_%H-%M-%S')
LOG_FILE="$LOG_DIR/daily-$TS.log"

echo "[lince-daily] start $(date)" | tee -a "$LOG_FILE"
pnpm --filter @lince/scheduler trigger-now -- --max 300 2>&1 | tee -a "$LOG_FILE"
echo "[lince-daily] end $(date)" | tee -a "$LOG_FILE"
