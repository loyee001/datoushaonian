#!/usr/bin/env bash
set -euo pipefail
umask 077

[[ $(id -u) == 0 ]] || { echo 'Run as root.' >&2; exit 1; }
BASE=/opt/datou-classroom
RELEASE=${1:-$BASE/releases/20261003-v1}
SCRIPT_DIR=$(cd -- "$(dirname -- "$0")" && pwd)
ENV_FILE=/etc/datou-classroom/app.env
NODE_SOURCE=/root/tongbanji-20260925-VVox8g/runtime/bin/node
ACME_SOURCE=/root/tongbanji-20260925-VVox8g/acme/client/acme.sh

case "$RELEASE" in "$BASE"/releases/*) ;; *) echo 'Release must be inside /opt/datou-classroom/releases.' >&2; exit 1;; esac
[[ -f "$RELEASE/server.mjs" && -f "$RELEASE/public/index.html" ]] || { echo 'Release source is missing.' >&2; exit 1; }
[[ -x "$NODE_SOURCE" && -f "$ACME_SOURCE" ]] || { echo 'Existing Node/acme source is missing.' >&2; exit 1; }
command -v python3 >/dev/null
command -v curl >/dev/null
command -v flock >/dev/null
command -v caddy >/dev/null

# Read the root-created environment without executing its contents or printing secrets.
python3 - "$ENV_FILE" <<'PY'
import os, stat, sys
p = sys.argv[1]
s = os.stat(p)
if s.st_uid != 0 or s.st_gid != 0 or stat.S_IMODE(s.st_mode) != 0o600:
    raise SystemExit('app.env must be root:root with mode 0600.')
values = {}
for line in open(p, encoding='utf-8'):
    line = line.strip()
    if not line or line.startswith('#'):
        continue
    if '=' not in line:
        raise SystemExit('Invalid environment file.')
    key, value = line.split('=', 1)
    if key in values:
        raise SystemExit('Duplicate environment variable.')
    values[key] = value
expected = {'NODE_ENV':'production', 'HOST':'127.0.0.1', 'PORT':'18173',
            'PUBLIC_ORIGIN':'https://datou.qdfb.tech', 'TRUST_PROXY':'loopback',
            'SEED_DEMO':'false', 'TZ':'Asia/Shanghai', 'DATA_DIR':'/var/lib/datou-classroom'}
if any(values.get(k) != v for k, v in expected.items()):
    raise SystemExit('Production environment does not match the deployment contract.')
password = values.get('TEACHER_PASSWORD', '')
if not 16 <= len(password) <= 200 or not all(c.isalnum() or c in '_-' for c in password):
    raise SystemExit('Use a generated URL-safe TEACHER_PASSWORD of 16 to 200 characters.')
PY

if ! id datou-classroom >/dev/null 2>&1; then
  useradd --system --user-group --home-dir /var/lib/datou-classroom --shell /sbin/nologin datou-classroom
fi
getent group caddy >/dev/null
install -d -o root -g root -m 0755 "$BASE" "$BASE/releases" "$BASE/runtime" "$BASE/deploy" "$BASE/acme"
install -d -o root -g root -m 0700 /etc/datou-classroom /etc/datou-classroom/acme /etc/datou-classroom/acme/certs /etc/datou-classroom/logs /etc/datou-classroom/backups
install -d -o datou-classroom -g datou-classroom -m 0700 /var/lib/datou-classroom
install -d -o root -g caddy -m 0755 /var/lib/caddy/datou-qdfb-tech /var/lib/caddy/datou-qdfb-tech/webroot
install -d -o root -g caddy -m 0755 /var/lib/caddy/datou-qdfb-tech/webroot/.well-known /var/lib/caddy/datou-qdfb-tech/webroot/.well-known/acme-challenge
install -d -o root -g caddy -m 0750 /var/lib/caddy/datou-qdfb-tech/tls
install -o root -g root -m 0755 "$NODE_SOURCE" "$BASE/runtime/.node.$$"
mv -Tf -- "$BASE/runtime/.node.$$" "$BASE/runtime/node"
install -o root -g root -m 0755 "$ACME_SOURCE" "$BASE/acme/acme.sh"
if [[ "$SCRIPT_DIR" != "$BASE/deploy" ]]; then
  for script in prepare.sh publish-https.sh patch-caddy.py renew-cert.sh reload-cert.sh verify.mjs; do
    install -o root -g root -m 0755 "$SCRIPT_DIR/$script" "$BASE/deploy/$script"
  done
fi
"$BASE/runtime/node" --check "$RELEASE/server.mjs"
for script in "$RELEASE"/public/*.js; do "$BASE/runtime/node" --check "$script"; done
chmod 0755 "$RELEASE" "$RELEASE/public"
chmod 0644 "$RELEASE/server.mjs" "$RELEASE/package.json"
find "$RELEASE/public" -type d -exec chmod 0755 {} +
find "$RELEASE/public" -type f -exec chmod 0644 {} +

if [[ -e "$BASE/current" && ! -L "$BASE/current" ]]; then
  echo 'Current path is not a symlink; leaving it unchanged.' >&2; exit 1
fi
NEXT="$BASE/.current.$$"
trap 'rm -f -- "$NEXT"' EXIT
ln -s -- "$RELEASE" "$NEXT"
mv -Tf -- "$NEXT" "$BASE/current"

cat > /etc/systemd/system/datou-classroom.service <<'UNIT'
[Unit]
Description=Datou classroom
After=network.target

[Service]
Type=simple
User=datou-classroom
Group=datou-classroom
WorkingDirectory=/opt/datou-classroom/current
EnvironmentFile=/etc/datou-classroom/app.env
ExecStart=/opt/datou-classroom/runtime/node --experimental-sqlite server.mjs
Restart=on-failure
RestartSec=3
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/datou-classroom

[Install]
WantedBy=multi-user.target
UNIT
chmod 0644 /etc/systemd/system/datou-classroom.service
systemctl daemon-reload
systemctl enable datou-classroom.service
systemctl restart datou-classroom.service
healthy=false
for attempt in {1..20}; do
  if curl --fail --silent --max-time 2 -H 'Host: datou.qdfb.tech' http://127.0.0.1:18173/api/health | python3 -c 'import json,sys; assert json.load(sys.stdin).get("ok") is True' 2>/dev/null; then
    healthy=true; break
  fi
  sleep 1
done
[[ "$healthy" == true ]] || { echo 'Datou service health check failed; inspect its journal.' >&2; exit 1; }
python3 "$BASE/deploy/patch-caddy.py" challenge
echo 'Datou service is healthy on 127.0.0.1:18173. HTTP ACME challenge route is ready; other requests return 503.'
