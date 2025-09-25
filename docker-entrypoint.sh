#!/bin/sh
set -e

TEMPLATE="/usr/share/nginx/html/assets/config.template.js"
TARGET="/usr/share/nginx/html/assets/config.js"

if [ -f "$TEMPLATE" ]; then
  cp "$TEMPLATE" "$TARGET"

  : "${API_BASE_URL:=}"
  : "${API_WS_URL:=}"

  sed -i "s|%%API_BASE_URL%%|${API_BASE_URL}|g" "$TARGET"
  sed -i "s|%%API_WS_URL%%|${API_WS_URL}|g" "$TARGET"
fi

exec "$@"

