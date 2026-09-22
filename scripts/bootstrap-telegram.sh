#!/usr/bin/env bash
set -euo pipefail

UPSTREAM_DIR="${1:-telegram-upstream}"

if [ ! -d "$UPSTREAM_DIR/.git" ]; then
  git clone --recursive --shallow-submodules https://github.com/DrKLO/Telegram.git "$UPSTREAM_DIR"
else
  git -C "$UPSTREAM_DIR" pull --ff-only
  git -C "$UPSTREAM_DIR" submodule update --init --recursive --depth=1
fi

cp -R android-overlay/TMessagesProj/. "$UPSTREAM_DIR/TMessagesProj/"

echo "TelePRIVAT overlay copied to $UPSTREAM_DIR"
echo "Next: configure your own app id/signing/API values before distribution."
