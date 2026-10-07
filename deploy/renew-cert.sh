#!/usr/bin/env bash
set -euo pipefail
umask 077
[[ $(id -u) == 0 ]] || exit 1
exec 9>/run/lock/datou-classroom-acme.lock
flock -n 9 || exit 0
LOG=/etc/datou-classroom/logs/acme-renew-$(date -u +%Y%m%dT%H%M%SZ).log
status=0
(umask 022; /opt/datou-classroom/acme/acme.sh --cron --home /opt/datou-classroom/acme --config-home /etc/datou-classroom/acme --cert-home /etc/datou-classroom/acme/certs) >"$LOG" 2>&1 || status=$?
find /etc/datou-classroom/acme -type d -exec chmod 0700 {} +
find /etc/datou-classroom/acme -type f -exec chmod 0600 {} +
if [[ "$status" != 0 ]]; then
  echo "Datou certificate renewal failed. Inspect private log: $LOG" >&2
  exit 1
fi
