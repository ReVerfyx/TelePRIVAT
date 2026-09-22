# TelePRIVAT

TelePRIVAT is an unofficial Android project inspired by Telegram's public Android client UI.

Important:
- TelePRIVAT is not Telegram and is not affiliated with Telegram.
- It uses its own VPS/backend, its own accounts, its own local Stars-like balance and collectible gifts.
- Local Stars and gifts are not official Telegram Stars/NFTs and have no Telegram/TON value unless a future explicit on-chain integration is added.
- Private messages from Telegram are not imported.
- Network traffic to the TelePRIVAT server uses HTTPS/TLS; the server operator can access server-side data because this is not end-to-end encrypted.

## Architecture

- Android UI: based on the GPL Telegram Android source where practical.
- TelePRIVAT API: REST + WebSocket over HTTPS.
- Backend: Node.js + TypeScript + PostgreSQL.
- Auth: unique username + password. Passwords are stored only as Argon2id hashes.
- Multi-account: each device can keep multiple independent TelePRIVAT sessions.
- Telegram profile link: optional. Public Telegram profile data can be cached, but phone numbers and private chats are not collected.
- Profile media cache target: configurable, default 30 GiB, with LRU-style cleanup.
- Marketplace: local Stars balance, gift catalog, unique collectible instances, serial numbers, traits and transfers.

## Why MTProto is not the TelePRIVAT backend

The upstream Telegram Android client is tightly coupled to Telegram's MTProto/network layer. Removing MTProto alone would break account state, users, updates, media and the official Stars/Gifts API.

TelePRIVAT therefore keeps/adapts useful UI code but routes TelePRIVAT account, profile, Stars and Gifts operations to its own HTTPS API.

## Repository layout

```
server/                  TelePRIVAT API
server/sql/              PostgreSQL schema
android-overlay/         code/config layered onto upstream Telegram Android
scripts/                 bootstrap/helper scripts
docker-compose.yml       VPS deployment
Caddyfile                HTTPS reverse proxy
.env.example             server settings
```

## VPS quick start

1. Point a domain such as `api.example.com` to the VPS.
2. Install Docker + Docker Compose.
3. Copy `.env.example` to `.env` and change all secrets.
4. Set `TELEPRIVAT_DOMAIN` to your domain.
5. Run:

```bash
docker compose up -d --build
```

The API is then available at `https://<TELEPRIVAT_DOMAIN>/api/v1`.

## Upstream Android source

Use the official source as the base:

```bash
./scripts/bootstrap-telegram.sh
```

This clones Telegram Android with submodules and applies/copies the TelePRIVAT overlay. Keep the upstream GPL notices and publish corresponding source for distributed builds.


## One-command VPS installer

On Ubuntu 24.04:

```bash
curl -fsSL https://raw.githubusercontent.com/ReVerfyx/TelePRIVAT/main/install.sh | sudo bash
```

The installer asks for the API domain, Telegram api_id/api_hash, a dedicated bot token, and an MTProto proxy host/port/secret. It generates database/JWT/admin/internal resolver secrets automatically and starts the full Docker Compose stack.

Public Telegram profiles are resolved on demand through the private TDLib resolver and cached; TelePRIVAT accounts themselves are stored in PostgreSQL and use TelePRIVAT username/password.
