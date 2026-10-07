# 大头少年独立部署

目标：`https://datou.qdfb.tech`，既有 ECS `39.97.244.43`。所有命令由 root 在服务器执行；这些脚本不会上传代码或本机数据库。

## 准备

把经过检查的源码放到 `/opt/datou-classroom/releases/20261003-v1`。保留 `server.mjs`、`package.json`、`public/` 和 `deploy/`，不要包含开发数据、备份或截图。

先建立 `/etc/datou-classroom/app.env`，属主 `root:root`、权限 `0600`。文件不使用引号，包含下面这些变量以及单独生成的 `TEACHER_PASSWORD`（16 至 200 位 URL 安全随机字符）：

```ini
NODE_ENV=production
HOST=127.0.0.1
PORT=18173
DATA_DIR=/var/lib/datou-classroom
PUBLIC_ORIGIN=https://datou.qdfb.tech
TRUST_PROXY=loopback
SEED_DEMO=false
TZ=Asia/Shanghai
```

```sh
bash /opt/datou-classroom/releases/20261003-v1/deploy/prepare.sh
/opt/datou-classroom/deploy/publish-https.sh
/opt/datou-classroom/runtime/node /opt/datou-classroom/deploy/verify.mjs --expect-empty
```

`prepare.sh` 从既有服务器复制 Node 与 ACME 客户端程序，建立独立服务和空白持久数据目录。不会复制、删除或覆盖旧应用数据。HTTP 暂时仅允许 ACME 挑战，其他请求返回 503。默认 release 可通过第一个参数指定。

`publish-https.sh` 使用独立 ACME 账户目录签发证书，再开启 HTTPS 和 HTTP 跳转，安装每日续期计时器。日志在 `/etc/datou-classroom/logs`，仅 root 可读。HTTP 挑战文件允许 Caddy 读取；ACME 状态始终置于 root 专属目录中，私钥文件在操作后收紧为 0600。Caddy 使用的证书副本权限为 `root:caddy 0640`。

`verify.mjs` 检查健康、教师登录、安全 Cookie、空白业务数据及退出失效。只输出数量与检查结果；它读取服务器的环境文件，不输出密码。应用投入使用后运行时不加 `--expect-empty`。

## 路径与并发保护

- 服务：`datou-classroom.service`；续期：`datou-classroom-cert-renew.timer`。
- 持久数据库：`/var/lib/datou-classroom/classroom.sqlite`。
- 证书：`/var/lib/caddy/datou-qdfb-tech/tls/`。
- ACME 私有状态：`/etc/datou-classroom/acme/`。
- Caddy 备份：`/etc/datou-classroom/backups/`。

只替换 `BEGIN/END DATOU CLASSROOM MANAGED BLOCK` 标记之间的配置。候选配置经过验证，提交前复核原文件摘要，采用原子替换并平滑 reload。所有同时修改 Caddy 的任务应共用 `/run/lock/caddy-config.lock`；不遵守该锁的进程仍有极短竞争窗口，摘要变化会令脚本终止而不是覆盖。reload 失败时仅从最新文件撤销此次 Datou 块，保留其他任务的修改。

这些脚本不开放新公网端口、不变更 DNS，也不修改其他应用或其服务。完成后仍需从公网确认正常证书校验和页面访问。

## 2026-10-03 上线验收

发布版本 `20261003-v1` 已部署到 <https://datou.qdfb.tech>。部署包 SHA-256：`50872fbf0b409a3e88969506ad0acd8d353344e1d73b329cd52a87f5e6d809d7`。

- 自动测试 33/33 通过；`prepare.sh` 与 `publish-https.sh` 执行成功。
- 公网 HTTPS 返回 200，TLS 校验结果为 0（成功）；Let's Encrypt YE2 证书到期时间为 `2027-01-01 02:48:27 GMT`。
- 服务器验证显示学员、项目组、课程、考勤、评价数量均为 0，安全登录与退出验证通过；独立 Chrome 登录验证通过。
- `datou-classroom.service` 为 active、enabled，`NRestarts=0`；每日证书续期 timer 已启用。
- 手动运行证书续期检查返回 `Result=success`、`ExecMainStatus=0`；与上线前备份对比，大头少年标记块之外的 Caddy 配置保持一致。
- 同机既有站点检查正常：`f.qdfb.tech` 返回 307，`ai.qdfb.tech` 与 `yin.qdfb.tech` 返回 200。

以上为该次上线时的验收结果，业务数据数量会随之后的使用发生变化。
