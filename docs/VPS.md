# VPS deployment

Target: Ubuntu 24.04 + Docker Compose + PostgreSQL + Caddy HTTPS.

1. Point a domain such as api.example.com to the VPS.
2. Open TCP 80 and 443.
3. Install Docker Engine and Docker Compose plugin from Docker's official Ubuntu repository.
4. Clone this repository.
5. Copy .env.example to .env and replace TELEPRIVAT_DOMAIN, POSTGRES_PASSWORD, DATABASE_URL, JWT_SECRET and ADMIN_TOKEN.
6. Start the stack:

    sudo docker compose up -d --build

7. Check:

    sudo docker compose ps
    sudo docker compose logs -f api
    curl https://YOUR_DOMAIN/health

Expected health response:

    {"ok":true,"service":"teleprivat-api"}

Register:

    curl -X POST https://YOUR_DOMAIN/api/v1/auth/register \
      -H 'Content-Type: application/json' \
      -d '{"username":"reverfyx","password":"CHANGE_THIS_PASSWORD","displayName":"ReVerfyx"}'

For testing, local TelePRIVAT Stars can be credited only with the private admin endpoint:

    curl -X POST https://YOUR_DOMAIN/api/v1/admin/credit-stars \
      -H 'Content-Type: application/json' \
      -H 'X-Admin-Token: YOUR_ADMIN_TOKEN' \
      -d '{"username":"reverfyx","amount":"10000"}'

Never put ADMIN_TOKEN into the APK.

Back up PostgreSQL regularly. The avatar/profile cache is disposable and can be rebuilt.
