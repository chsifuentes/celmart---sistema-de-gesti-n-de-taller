#!/bin/sh
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
command -v docker >/dev/null 2>&1 || { echo 'Instala Docker con el plugin Compose.'; exit 1; }
docker compose version >/dev/null
docker info >/dev/null
if [ ! -f .env ]; then
  umask 077
  key=$(od -An -N32 -tx1 /dev/urandom | tr -d ' \n')
  pass=$(od -An -N32 -tx1 /dev/urandom | tr -d ' \n')
  printf 'AUTHENTICATION_API_KEY=%s\nPOSTGRES_PASSWORD=%s\nSERVER_URL=http://localhost:8080\nBIND_ADDRESS=127.0.0.1\nCORS_ORIGIN=*\n' "$key" "$pass" > .env
fi
docker compose up -d --wait --wait-timeout 120
printf '%s\n' 'Evolution API: http://localhost:8080 . Credenciales en .env.' 'Crea o conecta la instancia celmart siguiendo README.md.'
