#!/usr/bin/env python3
"""Replace only this app's Caddy block, preserving concurrent unrelated edits."""
import datetime
import fcntl
import hashlib
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import uuid

CONFIG = Path('/etc/caddy/Caddyfile')
STATE = Path('/etc/datou-classroom')
BEGIN = '# BEGIN DATOU CLASSROOM MANAGED BLOCK'
END = '# END DATOU CLASSROOM MANAGED BLOCK'


def split_block(text):
    if text.count(BEGIN) != text.count(END) or text.count(BEGIN) > 1:
        raise RuntimeError('Invalid or duplicate Datou markers; no configuration changed.')
    if BEGIN not in text:
        return text, '', ''
    start = text.index(BEGIN)
    stop = text.index(END) + len(END)
    if stop <= start:
        raise RuntimeError('Invalid Datou marker ordering.')
    return text[:start], text[start:stop], text[stop:]


def replace_block(text, block):
    before, previous, after = split_block(text)
    if previous:
        return before + block + after
    if 'datou.qdfb.tech' in text:
        raise RuntimeError('Datou appears outside this managed block; review before proceeding.')
    return text.rstrip('\n') + '\n\n' + block + '\n'


def render(mode):
    common = '''    handle /.well-known/acme-challenge/* {
        root * /var/lib/caddy/datou-qdfb-tech/webroot
        file_server
    }'''
    if mode == 'challenge':
        body = 'http://datou.qdfb.tech {\n' + common + '''
    handle {
        respond "Datou classroom is being prepared." 503
    }
}'''
    else:
        body = 'http://datou.qdfb.tech {\n' + common + '''
    handle {
        redir https://datou.qdfb.tech{uri} 308
    }
}

https://datou.qdfb.tech {
    tls /var/lib/caddy/datou-qdfb-tech/tls/fullchain.pem /var/lib/caddy/datou-qdfb-tech/tls/key.pem
    encode gzip
    reverse_proxy 127.0.0.1:18173 {
        header_up Host datou.qdfb.tech
        header_up X-Real-IP {remote_host}
    }
}'''
    return BEGIN + '\n' + body + '\n' + END


def digest(data):
    return hashlib.sha256(data).digest()


def run(command, log):
    with log.open('ab') as output:
        result = subprocess.run(command, stdout=output, stderr=subprocess.STDOUT)
    if result.returncode:
        raise RuntimeError('Command failed; inspect the private deployment log: ' + str(log))


def install(expected, proposed, log):
    metadata = CONFIG.stat()
    fd, candidate = tempfile.mkstemp(prefix='.datou-candidate-', dir=str(CONFIG.parent))
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, 'wb') as output:
            output.write(proposed)
            output.flush()
            os.fsync(output.fileno())
        run([shutil.which('caddy') or '/usr/bin/caddy', 'validate', '--config', candidate, '--adapter', 'caddyfile'], log)
        os.chown(candidate, metadata.st_uid, metadata.st_gid)
        os.chmod(candidate, metadata.st_mode & 0o777)
        if digest(CONFIG.read_bytes()) != digest(expected):
            raise RuntimeError('Caddyfile changed concurrently; no replacement performed. Retry against the latest file.')
        os.replace(candidate, CONFIG)
    finally:
        if os.path.exists(candidate):
            os.unlink(candidate)


def main():
    if os.geteuid() != 0 or len(sys.argv) != 2 or sys.argv[1] not in ('challenge', 'https'):
        raise SystemExit('Usage (root): patch-caddy.py challenge|https')
    os.umask(0o077)
    for name in ('logs', 'backups'):
        (STATE / name).mkdir(parents=True, exist_ok=True, mode=0o700)
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '-' + uuid.uuid4().hex[:8]
    log = STATE / 'logs' / ('caddy-' + stamp + '.log')
    with open('/run/lock/caddy-config.lock', 'a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        original = CONFIG.read_bytes()
        text = original.decode('utf-8')
        before, previous, after = split_block(text)
        if 'datou.qdfb.tech' in before + after:
            raise RuntimeError('Datou appears outside this managed block; no configuration changed.')
        block = render(sys.argv[1])
        proposed = replace_block(text, block).encode('utf-8')
        if proposed == original:
            run(['systemctl', 'reload', 'caddy'], log)
            print('Datou Caddy block is already current; reload succeeded.')
            return
        backup = STATE / 'backups' / ('Caddyfile-' + stamp + '.before')
        backup.write_bytes(original)
        install(original, proposed, log)
        try:
            run(['systemctl', 'reload', 'caddy'], log)
        except RuntimeError:
            # Revert our block in the latest file, never restore the whole backup
            # over another task's subsequent changes.
            latest = CONFIG.read_bytes()
            left, active, right = split_block(latest.decode('utf-8'))
            if active != block:
                raise RuntimeError('Reload failed and our block changed concurrently; manual review required. Log: ' + str(log))
            restored = (left + previous + right).encode('utf-8')
            install(latest, restored, log)
            run(['systemctl', 'reload', 'caddy'], log)
            raise RuntimeError('Reload failed; only the Datou block was reverted. Log: ' + str(log))
        print('Datou Caddy block validated and reloaded. Backup: ' + str(backup))


if __name__ == '__main__':
    try:
        main()
    except (OSError, RuntimeError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
