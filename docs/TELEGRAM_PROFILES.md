# Where Telegram-looking profiles come from

TelePRIVAT has two separate identity layers.

## 1. TelePRIVAT accounts

These are real accounts of this private service and are stored in PostgreSQL.

They are created with:

- unique TelePRIVAT username
- password
- local Stars balance
- local gift inventory

They do not require a phone number.

## 2. Public Telegram profile cache

When a user searches for a public @username and it is not in the cache, the API asks the private `telegram-resolver` service.

The resolver:

1. runs TDLib/TDLight;
2. authenticates as a dedicated Telegram bot;
3. enables the configured MTProto proxy;
4. resolves the public username through Telegram;
5. returns only public profile fields;
6. the API stores the result in `telegram_profile_cache`.

The service does not import phone numbers, private chats, contact books, or secret chats.

There is no supported Telegram API for downloading every Telegram account. Public profiles are discovered on demand and cached.

A raw numeric Telegram ID can only be useful when that profile is already known to the resolver/cache; public discovery is username-based.

## Required Telegram values

The VPS installer asks for:

- `TELEGRAM_API_ID`
- `TELEGRAM_API_HASH`
- `TELEGRAM_BOT_TOKEN`
- MTProto proxy host
- MTProto proxy port
- MTProto proxy secret

The bot is a read-only service identity for profile lookup. TelePRIVAT users still log in with TelePRIVAT username/password.
