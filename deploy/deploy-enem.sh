#!/usr/bin/env bash
# Deploy disparado pelo GitHub Actions.
#
# Instalado na VPS em /usr/local/bin/deploy-enem, e amarrado à chave do CI no
# authorized_keys: a chave não abre shell, só executa este script.

set -euo pipefail

REPO=/root/enem-project
COMPOSE="$REPO/deploy/docker-compose.yml"

cd "$REPO"

# reset em vez de pull: o deploy é sempre exatamente o que está na main. O
# deploy/.env não é versionado, então sobrevive.
git fetch --quiet origin main
git reset --quiet --hard origin/main

docker compose -f "$COMPOSE" up -d --build

# Cada build deixa a imagem anterior órfã (~950 MB). Sem isto o disco enche.
docker image prune -f > /dev/null

echo "deploy ok: $(git rev-parse --short HEAD)"
