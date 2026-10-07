#!/usr/bin/env bash
set -euo pipefail
umask 077
[[ $(id -u) == 0 ]] || { echo 'Run as root.' >&2; exit 1; }
exec 8>/run/lock/datou-classroom-acme.lock
flock -x 8
BASE=/opt/datou-classroom
DOMAIN=datou.qdfb.tech
STATE=/etc/datou-classroom/acme
CERTS=/var/lib/caddy/datou-qdfb-tech/tls
WEBROOT=/var/lib/caddy/datou-qdfb-tech/webroot
LOG=/etc/datou-classroom/logs/acme-issue-$(date -u +%Y%m%dT%H%M%SZ).log
[[ -x "$BASE/acme/acme.sh" && -d "$WEBROOT" ]] || { echo 'Run prepare.sh first.' >&2; exit 1; }
curl --fail --silent --max-time 5 -H "Host: $DOMAIN" http://127.0.0.1:18173/api/health | python3 -c 'import json,sys; assert json.load(sys.stdin).get("ok") is True'
ACME=("$BASE/acme/acme.sh" --home "$BASE/acme" --config-home "$STATE" --cert-home "$STATE/certs")
issue_status=0
(umask 022; "${ACME[@]}" --issue --server letsencrypt --domain "$DOMAIN" --webroot "$WEBROOT" --keylength ec-256) >"$LOG" 2>&1 || issue_status=$?
find "$STATE" -type d -exec chmod 0700 {} +
find "$STATE" -type f -exec chmod 0600 {} +
# acme.sh returns 2 when the dedicated certificate is already current.
if [[ "$issue_status" != 0 && "$issue_status" != 2 ]]; then
  echo "Certificate issuance did not complete. Inspect private log: $LOG" >&2; exit 1
fi
if ! "${ACME[@]}" --install-cert --domain "$DOMAIN" --ecc --fullchain-file "$CERTS/fullchain.pem" --key-file "$CERTS/key.pem" --reloadcmd "$BASE/deploy/reload-cert.sh" >>"$LOG" 2>&1; then
  echo "Certificate installation did not complete. Inspect private log: $LOG" >&2; exit 1
fi
python3 "$BASE/deploy/patch-caddy.py" https
cat > /etc/systemd/system/datou-classroom-cert-renew.service <<'UNIT'
[Unit]
Description=Renew Datou classroom TLS certificate
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
UMask=0077
ExecStart=/opt/datou-classroom/deploy/renew-cert.sh
UNIT
cat > /etc/systemd/system/datou-classroom-cert-renew.timer <<'UNIT'
[Unit]
Description=Daily Datou classroom certificate renewal check

[Timer]
OnCalendar=daily
RandomizedDelaySec=3600
Persistent=true
Unit=datou-classroom-cert-renew.service

[Install]
WantedBy=timers.target
UNIT
chmod 0644 /etc/systemd/system/datou-classroom-cert-renew.service /etc/systemd/system/datou-classroom-cert-renew.timer
systemctl daemon-reload
systemctl enable --now datou-classroom-cert-renew.timer
curl --fail --silent --show-error --max-time 10 --resolve "$DOMAIN:443:127.0.0.1" "https://$DOMAIN/api/health" | python3 -c 'import json,sys; assert json.load(sys.stdin).get("ok") is True'
echo 'Datou HTTPS health check passed with normal certificate validation. Daily renewal timer enabled.'
