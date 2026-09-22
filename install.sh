#!/usr/bin/env bash
set -euo pipefail

REPO_URL="https://github.com/ReVerfyx/TelePRIVAT.git"
INSTALL_DIR="${TELEPRIVAT_DIR:-/opt/teleprivat}"

if [ "${EUID}" -ne 0 ]; then
  echo "Run as root: sudo bash install.sh"
  exit 1
fi

need_cmd() {
  command -v "$1" >/dev/null 2>&1
}

ask() {
  local var_name="$1"
  local prompt="$2"
  local default_value="${3:-}"
  local current="${!var_name:-}"
  if [ -n "$current" ]; then
    printf -v "$var_name" '%s' "$current"
    return
  fi
  if [ -n "$default_value" ]; then
    read -r -p "$prompt [$default_value]: " current
    current="${current:-$default_value}"
  else
    read -r -p "$prompt: " current
  fi
  printf -v "$var_name" '%s' "$current"
}

ask_secret() {
  local var_name="$1"
  local prompt="$2"
  local current="${!var_name:-}"
  if [ -n "$current" ]; then
    printf -v "$var_name" '%s' "$current"
    return
  fi
  read -r -s -p "$prompt: " current
  echo
  printf -v "$var_name" '%s' "$current"
}

echo "== TelePRIVAT VPS installer =="

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl git openssl gnupg

if ! need_cmd docker; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  . /etc/os-release
  ARCH="$(dpkg --print-architecture)"
  echo "deb [arch=$ARCH signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $VERSION_CODENAME stable"     > /etc/apt/sources.list.d/docker.list
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
fi

if [ -d "$INSTALL_DIR/.git" ]; then
  git -C "$INSTALL_DIR" fetch origin main
  git -C "$INSTALL_DIR" reset --hard origin/main
else
  rm -rf "$INSTALL_DIR"
  git clone "$REPO_URL" "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"

ask TELEPRIVAT_DOMAIN "Domain for the API, for example api.example.com"
ask TELEGRAM_API_ID "Telegram api_id from my.telegram.org"
ask_secret TELEGRAM_API_HASH "Telegram api_hash"
ask_secret TELEGRAM_BOT_TOKEN "Bot token from @BotFather"
ask TELEGRAM_PROXY_HOST "MTProto proxy host/IP"
ask TELEGRAM_PROXY_PORT "MTProto proxy port" "443"
ask_secret TELEGRAM_PROXY_SECRET "MTProto proxy secret"

if ! [[ "$TELEGRAM_API_ID" =~ ^[0-9]+$ ]]; then
  echo "TELEGRAM_API_ID must be numeric"
  exit 1
fi
if ! [[ "$TELEGRAM_PROXY_PORT" =~ ^[0-9]+$ ]]; then
  echo "TELEGRAM_PROXY_PORT must be numeric"
  exit 1
fi
if [ -z "$TELEPRIVAT_DOMAIN" ] || [ -z "$TELEGRAM_API_HASH" ] || [ -z "$TELEGRAM_BOT_TOKEN" ] || [ -z "$TELEGRAM_PROXY_HOST" ] || [ -z "$TELEGRAM_PROXY_SECRET" ]; then
  echo "Required value is empty."
  exit 1
fi

POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-$(openssl rand -hex 24)}"
JWT_SECRET="${JWT_SECRET:-$(openssl rand -hex 48)}"
ADMIN_TOKEN="${ADMIN_TOKEN:-$(openssl rand -hex 32)}"
TELEGRAM_RESOLVER_TOKEN="${TELEGRAM_RESOLVER_TOKEN:-$(openssl rand -hex 32)}"

cat > .env <<EOF
TELEPRIVAT_DOMAIN=$TELEPRIVAT_DOMAIN
POSTGRES_DB=teleprivat
POSTGRES_USER=teleprivat
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
DATABASE_URL=postgres://teleprivat:$POSTGRES_PASSWORD@db:5432/teleprivat
JWT_SECRET=$JWT_SECRET
ADMIN_TOKEN=$ADMIN_TOKEN
PORT=8080
PROFILE_CACHE_MAX_BYTES=32212254720
NODE_ENV=production

TELEGRAM_RESOLVER_URL=http://telegram-resolver:8090
TELEGRAM_RESOLVER_TOKEN=$TELEGRAM_RESOLVER_TOKEN
TELEGRAM_API_ID=$TELEGRAM_API_ID
TELEGRAM_API_HASH=$TELEGRAM_API_HASH
TELEGRAM_BOT_TOKEN=$TELEGRAM_BOT_TOKEN
TELEGRAM_PROXY_HOST=$TELEGRAM_PROXY_HOST
TELEGRAM_PROXY_PORT=$TELEGRAM_PROXY_PORT
TELEGRAM_PROXY_SECRET=$TELEGRAM_PROXY_SECRET
EOF

chmod 600 .env

docker compose up -d --build

echo
echo "Waiting for containers..."
sleep 5
docker compose ps

echo
echo "TelePRIVAT installed in: $INSTALL_DIR"
echo "API health: https://$TELEPRIVAT_DOMAIN/health"
echo
echo "IMPORTANT:"
echo "1. DNS A/AAAA for $TELEPRIVAT_DOMAIN must point to this VPS."
echo "2. TCP ports 80 and 443 must be reachable."
echo "3. Keep $INSTALL_DIR/.env private."
echo "4. ADMIN_TOKEN is stored only on this VPS; never put it into the Android APK."
echo
echo "Useful commands:"
echo "  cd $INSTALL_DIR"
echo "  docker compose ps"
echo "  docker compose logs -f api"
echo "  docker compose logs -f telegram-resolver"
