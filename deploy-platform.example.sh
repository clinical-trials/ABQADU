#!/usr/bin/env bash
set -euo pipefail

TARGET_HOST="${TARGET_HOST:-}"
TARGET_DIR="${TARGET_DIR:-/home/ahmad/abqadu-platform}"

if [ -z "$TARGET_HOST" ]; then
  echo "Set TARGET_HOST, for example: TARGET_HOST=ahmad@example.com ./deploy-platform.example.sh" >&2
  exit 1
fi

(cd platform/client && npm run build)

ssh "$TARGET_HOST" "mkdir -p '$TARGET_DIR/platform/client' '$TARGET_DIR/platform/server'"
rsync -az --delete platform/client/build/ "$TARGET_HOST:$TARGET_DIR/platform/client/build/"
rsync -az --delete \
  --exclude='node_modules' \
  --exclude='data' \
  platform/server/ "$TARGET_HOST:$TARGET_DIR/platform/server/"

ssh "$TARGET_HOST" "cd '$TARGET_DIR/platform/server' && npm install --omit=dev"

echo "Deploy copied. Start or restart the server on the host with: cd $TARGET_DIR/platform/server && npm start"
