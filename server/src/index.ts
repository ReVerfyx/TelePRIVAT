import Fastify, { FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import argon2 from "argon2";
import jwt from "jsonwebtoken";
import pg from "pg";
import { z } from "zod";

const { Pool } = pg;

const PORT = Number(process.env.PORT ?? 8080);
const DATABASE_URL = process.env.DATABASE_URL;
const JWT_SECRET = process.env.JWT_SECRET;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
const TELEGRAM_RESOLVER_URL = process.env.TELEGRAM_RESOLVER_URL ?? "http://telegram-resolver:8090";
const TELEGRAM_RESOLVER_TOKEN = process.env.TELEGRAM_RESOLVER_TOKEN;

if (!DATABASE_URL) throw new Error("DATABASE_URL is required");
if (!JWT_SECRET || JWT_SECRET.length < 32) throw new Error("JWT_SECRET must be at least 32 characters");

const pool = new Pool({ connectionString: DATABASE_URL });
const app = Fastify({ logger: true });
await app.register(cors, { origin: false });

type JwtPayload = { sub: string; username: string };
type AuthedRequest = FastifyRequest & { user: JwtPayload };

function tokenFor(user: { id: string; username: string }) {
  return jwt.sign({ sub: user.id, username: user.username }, JWT_SECRET!, {
    expiresIn: "30d",
    issuer: "teleprivat-api"
  });
}

async function auth(request: FastifyRequest): Promise<JwtPayload> {
  const h = request.headers.authorization;
  if (!h?.startsWith("Bearer ")) throw Object.assign(new Error("UNAUTHORIZED"), { statusCode: 401 });
  try {
    return jwt.verify(h.slice(7), JWT_SECRET!, { issuer: "teleprivat-api" }) as JwtPayload;
  } catch {
    throw Object.assign(new Error("UNAUTHORIZED"), { statusCode: 401 });
  }
}

function cleanUsername(value: string) {
  return value.trim().replace(/^@/, "").toLowerCase();
}

const usernameSchema = z.string().transform(cleanUsername).pipe(
  z.string().regex(/^[a-z0-9_]{3,32}$/, "username must be 3-32 chars: a-z, 0-9, _")
);
const passwordSchema = z.string().min(8).max(128);

type TelegramResolvedProfile = {
  telegram_user_id: string;
  username: string;
  display_name: string;
  has_avatar?: boolean;
  source: "telegram_mtproto";
};

async function resolveTelegramUsername(rawUsername: string): Promise<TelegramResolvedProfile | null> {
  if (!TELEGRAM_RESOLVER_TOKEN) return null;
  const username = usernameSchema.parse(rawUsername);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const url = new URL("/resolve", TELEGRAM_RESOLVER_URL);
    url.searchParams.set("username", username);
    const response = await fetch(url, {
      headers: { "X-Resolver-Token": TELEGRAM_RESOLVER_TOKEN },
      signal: controller.signal
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error("TELEGRAM_RESOLVER_UNAVAILABLE");

    const profile = await response.json() as TelegramResolvedProfile;
    await pool.query(
      `INSERT INTO telegram_profile_cache(
          telegram_user_id, username, display_name, verified, last_synced_at, last_accessed_at
        )
        VALUES($1,$2,$3,false,now(),now())
        ON CONFLICT (telegram_user_id) DO UPDATE SET
          username=EXCLUDED.username,
          display_name=EXCLUDED.display_name,
          last_synced_at=now(),
          last_accessed_at=now()`,
      [profile.telegram_user_id, profile.username, profile.display_name]
    );
    return profile;
  } finally {
    clearTimeout(timer);
  }
}

app.setErrorHandler((error, _request, reply) => {
  const status = (error as any).statusCode ?? 400;
  reply.code(status).send({ error: error.message || "BAD_REQUEST" });
});

app.get("/health", async () => {
  await pool.query("SELECT 1");
  return { ok: true, service: "teleprivat-api" };
});

app.get("/api/v1/auth/check/:username", async (request) => {
  const username = usernameSchema.parse((request.params as any).username);
  const { rowCount } = await pool.query("SELECT 1 FROM users WHERE username=$1", [username]);
  return { username, exists: (rowCount ?? 0) > 0 };
});

app.post("/api/v1/auth/register", async (request, reply) => {
  const body = z.object({
    username: usernameSchema,
    password: passwordSchema,
    displayName: z.string().trim().min(1).max(64).optional()
  }).parse(request.body);

  const hash = await argon2.hash(body.password, { type: argon2.argon2id });
  try {
    const { rows } = await pool.query(
      `INSERT INTO users(username,password_hash,display_name)
       VALUES($1,$2,$3)
       RETURNING id, username::text, display_name, avatar_url, stars_balance::text`,
      [body.username, hash, body.displayName ?? body.username]
    );
    const user = rows[0];
    reply.code(201);
    return { token: tokenFor(user), user };
  } catch (e: any) {
    if (e.code === "23505") {
      reply.code(409);
      return { error: "USERNAME_TAKEN" };
    }
    throw e;
  }
});

app.post("/api/v1/auth/login", async (request, reply) => {
  const body = z.object({ username: usernameSchema, password: passwordSchema }).parse(request.body);
  const { rows } = await pool.query(
    "SELECT id, username::text, display_name, avatar_url, stars_balance::text, password_hash FROM users WHERE username=$1",
    [body.username]
  );
  const user = rows[0];
  if (!user || !(await argon2.verify(user.password_hash, body.password))) {
    reply.code(401);
    return { error: "INVALID_CREDENTIALS" };
  }
  await pool.query("UPDATE users SET last_seen_at=now() WHERE id=$1", [user.id]);
  delete user.password_hash;
  return { token: tokenFor(user), user };
});

app.get("/api/v1/me", async (request) => {
  const session = await auth(request);
  const { rows } = await pool.query(
    `SELECT id, username::text, display_name, avatar_url,
            telegram_user_id::text, telegram_username::text,
            stars_balance::text, created_at, last_seen_at
       FROM users WHERE id=$1`,
    [session.sub]
  );
  if (!rows[0]) throw Object.assign(new Error("USER_NOT_FOUND"), { statusCode: 404 });
  return { user: rows[0] };
});

app.get("/api/v1/users/:username", async (request) => {
  const username = usernameSchema.parse((request.params as any).username);
  const { rows } = await pool.query(
    `SELECT id, username::text, display_name, avatar_url,
            telegram_user_id::text, telegram_username::text, created_at
       FROM users WHERE username=$1`,
    [username]
  );
  if (!rows[0]) throw Object.assign(new Error("USER_NOT_FOUND"), { statusCode: 404 });
  const gifts = await pool.query(
    `SELECT gi.id, gi.serial_number::text, gi.traits, gi.created_at,
            gc.slug, gc.title, gc.asset_url
       FROM gift_instances gi
       JOIN gift_catalog gc ON gc.id=gi.gift_id
       WHERE gi.owner_user_id=$1
       ORDER BY gi.created_at DESC
       LIMIT 100`,
    [rows[0].id]
  );
  return { user: rows[0], gifts: gifts.rows };
});

app.get("/api/v1/market/gifts", async () => {
  const { rows } = await pool.query(
    `SELECT id, slug, title, description, price_stars::text, asset_url,
            total_supply::text, active
       FROM gift_catalog WHERE active=true ORDER BY price_stars ASC`
  );
  return { gifts: rows };
});

app.get("/api/v1/stars/balance", async (request) => {
  const session = await auth(request);
  const { rows } = await pool.query("SELECT stars_balance::text AS balance FROM users WHERE id=$1", [session.sub]);
  return { balance: rows[0]?.balance ?? "0", currency: "TPSTAR" };
});

app.post("/api/v1/admin/credit-stars", async (request, reply) => {
  if (!ADMIN_TOKEN || request.headers["x-admin-token"] !== ADMIN_TOKEN) {
    reply.code(403);
    return { error: "FORBIDDEN" };
  }
  const body = z.object({
    username: usernameSchema,
    amount: z.coerce.bigint().positive().max(10_000_000_000n)
  }).parse(request.body);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `UPDATE users SET stars_balance=stars_balance+$1
       WHERE username=$2
       RETURNING id, stars_balance::text`,
      [body.amount.toString(), body.username]
    );
    if (!rows[0]) {
      await client.query("ROLLBACK");
      reply.code(404);
      return { error: "USER_NOT_FOUND" };
    }
    await client.query(
      "INSERT INTO stars_ledger(user_id,amount,kind) VALUES($1,$2,'admin_credit')",
      [rows[0].id, body.amount.toString()]
    );
    await client.query("COMMIT");
    return { ok: true, balance: rows[0].stars_balance };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
});

app.post("/api/v1/gifts/send", async (request, reply) => {
  const session = await auth(request);
  const body = z.object({
    giftSlug: z.string().min(1).max(80),
    toUsername: usernameSchema
  }).parse(request.body);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const giftQ = await client.query(
      "SELECT id, title, price_stars, total_supply FROM gift_catalog WHERE slug=$1 AND active=true FOR UPDATE",
      [body.giftSlug]
    );
    const gift = giftQ.rows[0];
    if (!gift) throw Object.assign(new Error("GIFT_NOT_FOUND"), { statusCode: 404 });

    const receiverQ = await client.query("SELECT id, username::text FROM users WHERE username=$1", [body.toUsername]);
    const receiver = receiverQ.rows[0];
    if (!receiver) throw Object.assign(new Error("RECIPIENT_NOT_FOUND"), { statusCode: 404 });

    const senderQ = await client.query(
      "SELECT id, username::text, stars_balance FROM users WHERE id=$1 FOR UPDATE",
      [session.sub]
    );
    const sender = senderQ.rows[0];
    if (!sender) throw Object.assign(new Error("SENDER_NOT_FOUND"), { statusCode: 404 });

    if (BigInt(sender.stars_balance) < BigInt(gift.price_stars)) {
      throw Object.assign(new Error("NOT_ENOUGH_STARS"), { statusCode: 409 });
    }

    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [gift.id]);
    const serialQ = await client.query(
      "SELECT COALESCE(MAX(serial_number),0)+1 AS next FROM gift_instances WHERE gift_id=$1",
      [gift.id]
    );
    const serial = BigInt(serialQ.rows[0].next);

    if (gift.total_supply !== null && serial > BigInt(gift.total_supply)) {
      throw Object.assign(new Error("GIFT_SOLD_OUT"), { statusCode: 409 });
    }

    const traits = {
      model: ["Classic", "Crystal", "Neon"][Number(serial % 3n)],
      backdrop: ["Midnight", "Aurora", "Graphite"][Number(serial % 3n)],
      pattern: ["Stars", "Waves", "Rings"][Number((serial / 3n) % 3n)]
    };

    await client.query(
      "UPDATE users SET stars_balance=stars_balance-$1 WHERE id=$2",
      [gift.price_stars, sender.id]
    );
    await client.query(
      "INSERT INTO stars_ledger(user_id,amount,kind,reference_id) VALUES($1,$2,'gift_purchase',$3)",
      [sender.id, (-BigInt(gift.price_stars)).toString(), gift.id]
    );

    const instanceQ = await client.query(
      `INSERT INTO gift_instances(gift_id,serial_number,owner_user_id,original_sender_user_id,traits)
       VALUES($1,$2,$3,$4,$5)
       RETURNING id, serial_number::text, traits, created_at`,
      [gift.id, serial.toString(), receiver.id, sender.id, traits]
    );
    const instance = instanceQ.rows[0];
    await client.query(
      "INSERT INTO gift_transfers(gift_instance_id,from_user_id,to_user_id,price_stars) VALUES($1,$2,$3,$4)",
      [instance.id, sender.id, receiver.id, gift.price_stars]
    );

    await client.query("COMMIT");
    reply.code(201);
    return {
      ok: true,
      gift: { ...instance, slug: body.giftSlug, title: gift.title },
      from: sender.username,
      to: receiver.username
    };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
});

app.post("/api/v1/gifts/:instanceId/transfer", async (request) => {
  const session = await auth(request);
  const instanceId = z.string().uuid().parse((request.params as any).instanceId);
  const body = z.object({ toUsername: usernameSchema }).parse(request.body);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const targetQ = await client.query("SELECT id FROM users WHERE username=$1", [body.toUsername]);
    if (!targetQ.rows[0]) throw Object.assign(new Error("RECIPIENT_NOT_FOUND"), { statusCode: 404 });

    const ownedQ = await client.query(
      "SELECT id FROM gift_instances WHERE id=$1 AND owner_user_id=$2 FOR UPDATE",
      [instanceId, session.sub]
    );
    if (!ownedQ.rows[0]) throw Object.assign(new Error("GIFT_NOT_OWNED"), { statusCode: 403 });

    await client.query(
      "UPDATE gift_instances SET owner_user_id=$1, transferred_at=now() WHERE id=$2",
      [targetQ.rows[0].id, instanceId]
    );
    await client.query(
      "INSERT INTO gift_transfers(gift_instance_id,from_user_id,to_user_id,price_stars) VALUES($1,$2,$3,0)",
      [instanceId, session.sub, targetQ.rows[0].id]
    );
    await client.query("COMMIT");
    return { ok: true };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
});

app.get("/api/v1/gifts/mine", async (request) => {
  const session = await auth(request);
  const { rows } = await pool.query(
    `SELECT gi.id, gi.serial_number::text, gi.traits, gi.created_at, gi.transferred_at,
            gc.slug, gc.title, gc.asset_url
       FROM gift_instances gi
       JOIN gift_catalog gc ON gc.id=gi.gift_id
       WHERE gi.owner_user_id=$1
       ORDER BY gi.created_at DESC`,
    [session.sub]
  );
  return { gifts: rows };
});

app.get("/api/v1/telegram/resolve/:username", async (request, reply) => {
  const username = usernameSchema.parse((request.params as any).username);

  const cached = await pool.query(
    `SELECT telegram_user_id::text AS id, username::text, display_name,
            avatar_remote_url AS avatar_url, verified, 'telegram_cache' AS source
       FROM telegram_profile_cache
       WHERE username=$1
       LIMIT 1`,
    [username]
  );

  if (cached.rows[0]) {
    await pool.query(
      "UPDATE telegram_profile_cache SET last_accessed_at=now() WHERE telegram_user_id=$1",
      [cached.rows[0].id]
    );
    return { profile: cached.rows[0], cached: true };
  }

  const resolved = await resolveTelegramUsername(username);
  if (!resolved) {
    reply.code(404);
    return { error: "TELEGRAM_USERNAME_NOT_FOUND" };
  }

  return {
    profile: {
      id: resolved.telegram_user_id,
      username: resolved.username,
      display_name: resolved.display_name,
      avatar_url: null,
      verified: false,
      source: resolved.source
    },
    cached: false
  };
});

app.get("/api/v1/search", async (request) => {
  const qRaw = z.string().trim().min(2).max(64).parse((request.query as any).q);
  const q = qRaw.replace(/^@/, "");

  const local = await pool.query(
    `SELECT id, username::text, display_name, avatar_url, 'teleprivat' AS source
       FROM users WHERE username ILIKE $1 OR display_name ILIKE $1
       ORDER BY username LIMIT 25`,
    [`%${q}%`]
  );

  let cached = await pool.query(
    `SELECT telegram_user_id::text AS id, username::text, display_name,
            avatar_remote_url AS avatar_url, verified, 'telegram_cache' AS source
       FROM telegram_profile_cache
       WHERE username ILIKE $1 OR display_name ILIKE $1
       ORDER BY last_accessed_at DESC LIMIT 25`,
    [`%${q}%`]
  );

  const exactUsername = /^[a-zA-Z0-9_]{3,32}$/.test(q);
  const hasExact = cached.rows.some((row: any) => String(row.username).toLowerCase() === q.toLowerCase());

  if (exactUsername && !hasExact) {
    try {
      const resolved = await resolveTelegramUsername(q);
      if (resolved) {
        cached = await pool.query(
          `SELECT telegram_user_id::text AS id, username::text, display_name,
                  avatar_remote_url AS avatar_url, verified, 'telegram_cache' AS source
             FROM telegram_profile_cache
             WHERE username ILIKE $1 OR display_name ILIKE $1
             ORDER BY last_accessed_at DESC LIMIT 25`,
          [`%${q}%`]
        );
      }
    } catch (error) {
      app.log.warn({ err: error }, "Telegram resolver unavailable");
    }
  }

  return { results: [...local.rows, ...cached.rows].slice(0, 40) };
});

await app.listen({ host: "0.0.0.0", port: PORT });
