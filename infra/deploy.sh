#!/usr/bin/env bash
# Deploy Lince al droplet DigitalOcean (razol.gnerai.com).
# Uso desde tu Mac, en la raíz del monorepo:
#   bash infra/deploy.sh
#   bash infra/deploy.sh --skip-build   # solo código + .env, sin rebuild

set -euo pipefail

DEPLOY_USER="${DEPLOY_USER:-root}"
DEPLOY_HOST="${DEPLOY_HOST:-46.101.185.148}"
DEPLOY_PATH="${DEPLOY_PATH:-/var/www/lince}"
SKIP_BUILD=false

for arg in "$@"; do
  case "$arg" in
    --skip-build) SKIP_BUILD=true ;;
    -h | --help)
      echo "Uso: bash infra/deploy.sh [--skip-build]"
      exit 0
      ;;
    *)
      echo "Opción desconocida: $arg"
      exit 1
      ;;
  esac
done

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -f .env ]]; then
  echo "[deploy] ERROR: no hay .env en la raíz. Copia .env.example y rellénalo."
  exit 1
fi

echo "[deploy] → ${DEPLOY_USER}@${DEPLOY_HOST}:${DEPLOY_PATH}"

rsync -avz --delete \
  --exclude node_modules \
  --exclude .next \
  --exclude .git \
  --exclude .turbo \
  --exclude 'infra/launchd/logs' \
  ./ "${DEPLOY_USER}@${DEPLOY_HOST}:${DEPLOY_PATH}/"

REMOTE_SCRIPT=$(cat <<EOF
set -euo pipefail
cd ${DEPLOY_PATH}
corepack enable
corepack prepare pnpm@11.0.9 --activate
node scripts/link-env.mjs
pnpm install --frozen-lockfile
pnpm --filter @lince/db db:generate
if [ "${SKIP_BUILD}" = "false" ]; then
  export NODE_OPTIONS="--max-old-space-size=1536"
  echo "[deploy] Build web (2-4 min en droplet 2GB, parece quieto pero va)..."
  NODE_ENV=production pnpm --filter @lince/web build
fi
pm2 restart lince-web
pm2 restart lince-landing 2>/dev/null || true
pm2 save
echo "[deploy] AUTH_URL en servidor:"
grep '^AUTH_URL=' .env || true
echo "[deploy] FLIP_MIN_MARGIN_PCT en servidor:"
grep '^FLIP_MIN_MARGIN_PCT=' .env || echo "(no definido → default código 0.18)"
curl -s -o /dev/null -w "lince-web :3006 → HTTP %{http_code}\n" http://localhost:3006/login || true
EOF
)

ssh -o ServerAliveInterval=30 -o ServerAliveCountMax=120 \
  "${DEPLOY_USER}@${DEPLOY_HOST}" "$REMOTE_SCRIPT"

echo "[deploy] Listo. Comprueba: https://razol.gnerai.com"
