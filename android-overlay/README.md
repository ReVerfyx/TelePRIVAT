# Android overlay

This directory is copied over an upstream Telegram Android checkout by `scripts/bootstrap-telegram.sh`.

The first milestone deliberately does not delete MTProto from upstream. Instead, TelePRIVAT features use their own API client and session store. Once login/profile/Stars/Gifts screens are fully switched to TelePRIVAT, unreachable Telegram messaging/network paths can be removed in smaller safe patches.

Primary upstream UI areas to adapt:

- `org.telegram.ui.Stars.StarsIntroActivity`
- `org.telegram.ui.Stars.StarGiftSheet`
- `org.telegram.ui.Stars.GiftOfferSheet`
- profile gift rendering in `ProfileActivity`
- login/launcher flow
- account switcher

Do not route official Telegram purchases or gifts through the private backend. TelePRIVAT Stars/collectibles are separate local assets.

The application branding must also be changed so users can clearly see that this is an unofficial project.
