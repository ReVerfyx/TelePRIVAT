# Android integration

TelePRIVAT uses the official Telegram Android source as the UI base where practical.

Prepare:

    git clone https://github.com/ReVerfyx/TelePRIVAT.git
    cd TelePRIVAT
    chmod +x scripts/bootstrap-telegram.sh
    ./scripts/bootstrap-telegram.sh

The script creates telegram-upstream/ and copies the TelePRIVAT overlay.

Migration order:

1. Username/password login.
2. Multi-account switcher.
3. TelePRIVAT profile lookup.
4. Local Stars balance.
5. Gift catalog.
6. Buy/send gift.
7. Profile gift collection.
8. Transfer collectible.
9. Remove Telegram messaging/network paths that are no longer reachable.

Do not delete MTProto first: Telegram UI/controllers depend on it heavily. TelePRIVAT features instead call TelePrivatApi over HTTPS and are migrated screen by screen.

Before release:
- use a distinct name/package/icon;
- show an Unofficial / private server notice;
- keep GPL notices and publish corresponding source;
- do not describe TelePRIVAT Stars or collectibles as official Telegram assets.
