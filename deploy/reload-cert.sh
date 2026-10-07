#!/usr/bin/env bash
set -euo pipefail
umask 077
[[ $(id -u) == 0 ]] || exit 1
CERTS=/var/lib/caddy/datou-qdfb-tech/tls
[[ -s "$CERTS/fullchain.pem" && -s "$CERTS/key.pem" ]] || exit 1
chown root:caddy "$CERTS/fullchain.pem" "$CERTS/key.pem"
chmod 0640 "$CERTS/fullchain.pem" "$CERTS/key.pem"
exec 9>/run/lock/caddy-config.lock
flock -x 9
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
systemctl reload caddy
