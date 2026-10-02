#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  if [ -s "$HOME/.nvm/nvm.sh" ]; then
    . "$HOME/.nvm/nvm.sh"
  fi
fi
if ! command -v node >/dev/null 2>&1; then
  echo "请先安装 Node.js 22.12 或更新版本，再打开课堂。"
  read -r
  exit 1
fi
echo "教师端：http://127.0.0.1:4173"
echo "此窗口关闭后，本地课堂服务会停止。"
exec node --experimental-sqlite server.mjs
