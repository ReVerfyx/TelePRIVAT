CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username CITEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL,
    avatar_url TEXT,
    telegram_user_id BIGINT UNIQUE,
    telegram_username CITEXT,
    stars_balance BIGINT NOT NULL DEFAULT 0 CHECK (stars_balance >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gift_catalog (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    price_stars BIGINT NOT NULL CHECK (price_stars >= 0),
    asset_url TEXT,
    total_supply BIGINT,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gift_instances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gift_id UUID NOT NULL REFERENCES gift_catalog(id),
    serial_number BIGINT NOT NULL,
    owner_user_id UUID NOT NULL REFERENCES users(id),
    original_sender_user_id UUID REFERENCES users(id),
    traits JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    transferred_at TIMESTAMPTZ,
    UNIQUE (gift_id, serial_number)
);

CREATE INDEX IF NOT EXISTS gift_instances_owner_idx ON gift_instances(owner_user_id);

CREATE TABLE IF NOT EXISTS gift_transfers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gift_instance_id UUID NOT NULL REFERENCES gift_instances(id),
    from_user_id UUID REFERENCES users(id),
    to_user_id UUID NOT NULL REFERENCES users(id),
    price_stars BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stars_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    amount BIGINT NOT NULL,
    kind TEXT NOT NULL,
    reference_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS stars_ledger_user_idx ON stars_ledger(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS telegram_profile_cache (
    telegram_user_id BIGINT PRIMARY KEY,
    username CITEXT,
    display_name TEXT,
    bio TEXT,
    avatar_remote_url TEXT,
    avatar_cache_path TEXT,
    avatar_size_bytes BIGINT NOT NULL DEFAULT 0,
    verified BOOLEAN NOT NULL DEFAULT false,
    last_synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_accessed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS telegram_profile_cache_username_idx ON telegram_profile_cache(username);
CREATE INDEX IF NOT EXISTS telegram_profile_cache_lru_idx ON telegram_profile_cache(last_accessed_at);

INSERT INTO gift_catalog (slug, title, description, price_stars, asset_url, total_supply)
VALUES
  ('first-star', 'First Star', 'TelePRIVAT launch collectible', 250, NULL, 100000),
  ('crystal-heart', 'Crystal Heart', 'Animated-style collectible gift', 500, NULL, 50000),
  ('golden-box', 'Golden Box', 'Rare TelePRIVAT collectible gift', 1000, NULL, 10000)
ON CONFLICT (slug) DO NOTHING;
