# 渡口生产部署指南

本文适用于私人传输助手 `v1.0.0`，推荐在一台具有公网 IP 的 64 位 Linux 服务器上通过 Docker Compose 部署。默认拓扑为：

```text
浏览器 ── HTTPS / WebSocket ── Caddy ── app ── SQLite 与文件卷
                                          └──── OCR worker
```

只有 Caddy 对公网开放端口，应用和 OCR 不直接暴露。Caddy 自动申请和续期 HTTPS 证书；消息、数据库和上传文件保存在 Docker 卷中。

## 1. 部署前准备

### 1.1 服务器

最低建议配置：

- 2 核 CPU、2 GB 内存。
- 20 GB 以上可用磁盘；实际容量应根据文件保留量增加。
- 64 位 Linux。
- Docker Engine 与 Docker Compose v2。
- 建议额外配置 1–2 GB swap，避免首次加载 OCR 模型时内存不足。

检查 Docker：

```bash
docker --version
docker compose version
```

如果尚未安装 Docker，请使用 Docker 官方文档中对应 Linux 发行版的安装方式：<https://docs.docker.com/engine/install/>。

### 1.2 域名与端口

准备一个专用域名，例如 `transfer.example.com`，将其 `A` 记录解析到服务器公网 IPv4；使用 IPv6 时再添加正确的 `AAAA` 记录。

在云服务器安全组和系统防火墙中开放：

| 协议 | 端口 | 用途 |
| --- | ---: | --- |
| TCP | 22 | SSH；可按服务器实际端口调整 |
| TCP | 80 | HTTPS 证书签发与 HTTP 跳转 |
| TCP | 443 | HTTPS、WebSocket |
| UDP | 443 | HTTP/3，可选但推荐 |

不要向公网开放 `3000` 端口。

部署前确认域名已经解析到当前服务器：

```bash
getent hosts transfer.example.com
```

请把后续示例中的 `transfer.example.com` 换成你的真实域名。

### 1.3 获取项目

把项目源码上传或克隆到服务器。若通过 Git 部署，切换到主版本标签：

```bash
git fetch --tags
git checkout v1.0.0
```

进入项目根目录，确认能看到以下文件：

```bash
ls Dockerfile docker-compose.yml Caddyfile .env.example
```

## 2. 配置生产环境

先创建仅当前用户可读的环境文件：

```bash
umask 077
cp .env.example .env
chmod 600 .env
```

生成 Cookie 签名密钥：

```bash
openssl rand -base64 48
```

编辑 `.env`，至少修改以下内容：

```dotenv
DOMAIN=transfer.example.com
PUBLIC_ORIGIN=https://transfer.example.com
TRUST_PROXY=true

COOKIE_SECRET=粘贴刚才生成的随机值

MAIN_PASSWORD=你的主口令
ADMIN_PASSWORD=你的管理口令
```

配置要求：

- `DOMAIN` 只填域名，不带 `http://`、路径或末尾斜杠。
- `PUBLIC_ORIGIN` 必须是完整 HTTPS 源地址，且末尾不能有 `/`。
- `COOKIE_SECRET` 至少 32 个字符；部署后不要更换，否则现有长期设备会失效。
- 主口令和管理口令至少 8 位且不能相同，建议使用密码管理器生成 16 位以上随机口令。
- 主口令用于临时访问；管理口令用于授权长期设备和执行敏感设置。

检查是否仍有示例占位值。该命令不会打印实际密钥：

```bash
if grep -q 'replace-with\|example\.com' .env; then
  echo '错误：.env 仍包含示例值'
else
  echo '基础配置检查通过'
fi
```

常用可选项：

| 变量 | 默认值 | 说明 |
| --- | ---: | --- |
| `MAX_FILE_SIZE` | `10737418240` | 单文件最大字节数，默认 10 GiB |
| `TEMP_SESSION_HOURS` | `12` | 临时会话有效期 |
| `DEVICE_DAYS` | `90` | 长期设备有效期 |
| `OCR_ENABLED` | `true` | 容器级 OCR 总开关 |
| `OCR_MAX_EDGE` | `2200` | OCR 前图片最长边 |
| `OCR_DET_LIMIT_SIDE` | `1280` | OCR 检测输入最长边 |
| `OCR_CPU_THREADS` | `1` | OCR CPU 线程数；2 核服务器建议保持 1 |
| `OCR_RELEASE_MODEL_AFTER_SECONDS` | `300` | 空闲后释放 OCR 模型的秒数 |
| `BACKUP_RETENTION_DAYS` | `0` | 自动删除多少天前的备份；0 表示不删除 |

## 3. 首次启动

先验证 Compose 配置。`--quiet` 只返回检查结果，不把环境变量展开到终端：

```bash
docker compose config --quiet
```

构建并启动全部服务：

```bash
docker compose build --pull
docker compose up -d
docker compose ps
```

首次构建会下载 Node.js、Python、OCR 模型和依赖，耗时取决于服务器网络。随后查看启动日志：

```bash
docker compose logs --tail=200 app ocr caddy
```

正常状态应满足：

- `app` 显示 `healthy`。
- `ocr` 和 `caddy` 显示 `Up`。
- Caddy 日志中没有持续的证书申请错误。

打开：

```text
https://transfer.example.com
```

使用主口令登录，然后输入管理口令将当前浏览器设为长期设备。确认可以进入设置页、发送文本并上传一个小文件。

### 3.1 初始化后移除明文口令

主口令和管理口令只在数据库尚未初始化时读取。首次登录成功后，编辑 `.env`，删除以下两行：

```dotenv
MAIN_PASSWORD=...
ADMIN_PASSWORD=...
```

然后仅重建应用容器：

```bash
docker compose up -d --force-recreate app
docker compose ps
```

不要删除或修改 `COOKIE_SECRET`。口令哈希已经保存在 SQLite 数据库中，之后可在设置页修改口令。

## 4. 上线验收

建议逐项检查：

- 地址栏证书有效，访问 HTTP 会自动跳转到 HTTPS。
- 主口令可以进入临时会话，刷新页面后临时会话退出。
- 管理口令可以授权长期设备，设置页只允许长期设备访问。
- 手机与电脑分别发送文本、图片和文件，页面能实时同步。
- 图片稍后可以通过原文件名和 OCR 内容搜索。
- 隐私锁消息不会出现在临时设备的列表、搜索和下载接口中。
- 收藏、置顶、合并、自由复制、自由编辑、临时分享和投递链接工作正常。
- `docker compose ps` 中应用持续保持健康。

服务器侧检查：

```bash
curl -I https://transfer.example.com
docker compose exec app node -e "fetch('http://127.0.0.1:3000/api/auth/status').then(async r=>{console.log(r.status,await r.text())})"
docker stats --no-stream
```

## 5. 2 核 2 GB 服务器建议

Compose 已设置以下资源上限：

- 应用：512 MB、1.25 CPU。
- OCR：896 MB、1 CPU。
- Caddy：128 MB、0.25 CPU。

OCR 默认单任务、单线程，并在空闲 5 分钟后释放模型。若服务器同时运行其他服务或 OCR 频繁触发内存不足，可在 `.env` 中调整：

```dotenv
OCR_MAX_EDGE=1600
OCR_DET_LIMIT_SIDE=960
OCR_CPU_THREADS=1
```

然后重建 OCR：

```bash
docker compose up -d --force-recreate ocr
docker compose logs --tail=100 ocr
```

若完全不需要图片文字搜索：

```dotenv
OCR_ENABLED=false
```

也可在长期设备的设置页关闭 OCR。关闭 OCR 不影响图片上传、预览和下载。

## 6. 日常运维

```bash
# 查看服务状态
docker compose ps

# 查看资源占用
docker stats --no-stream

# 查看最近日志
docker compose logs --tail=200 app ocr caddy

# 持续查看日志
docker compose logs -f app ocr caddy

# 重启单个服务
docker compose restart app
docker compose restart ocr

# 停止服务但保留所有数据
docker compose down

# 再次启动
docker compose up -d
```

不要执行 `docker compose down -v`。`-v` 会删除数据库、消息和全部上传文件。

## 7. 备份

备份包含 SQLite 一致性快照和所有原始文件，不包含 `.env` 和 Caddy 证书。

为避免备份时恰好上传或永久删除文件，先暂停写入：

```bash
mkdir -p backups
docker compose stop app ocr
BACKUP_UID="$(id -u)" BACKUP_GID="$(id -g)" docker compose --profile tools run --rm backup
docker compose start app ocr
```

验证归档：

```bash
ls -lh backups/transfer-*.tar.gz
tar -tzf backups/transfer-YYYYmmddTHHMMSSZ.tar.gz | head
```

请将备份复制到另一台机器或对象存储，并单独加密保存 `.env`。只保存在同一块服务器磁盘上的备份无法防范磁盘故障。

### 7.1 定时备份

可用 root 的 cron 在低峰期执行同一组命令。无论使用何种调度方式，都应确保失败时仍会重新启动 `app` 和 `ocr`，并定期实际验证归档能否解压。

设置 `BACKUP_RETENTION_DAYS=30` 可清理 `backups` 目录内超过 30 天且名称符合 `transfer-*.tar.gz` 的归档。建议异地备份的保留策略独立设置。

## 8. 恢复

恢复会覆盖当前数据库和文件。开始前：

1. 确认选中的归档能通过 `tar -tzf` 校验。
2. 再备份一次当前数据。
3. 停止服务。
4. 确认操作目标是本项目的 `private-transfer-assistant_transfer_data` 卷。

先解压到独立目录：

```bash
mkdir -p restore
tar -xzf backups/transfer-YYYYmmddTHHMMSSZ.tar.gz -C restore
ls restore/transfer.db restore/files
```

停止服务并确认数据卷名称：

```bash
docker compose down
docker volume ls --filter label=com.docker.compose.project=private-transfer-assistant
```

确认卷名无误后再执行恢复：

```bash
docker run --rm \
  -v private-transfer-assistant_transfer_data:/data \
  -v "$PWD/restore:/restore:ro" \
  alpine:3.20 sh -ec '
    rm -f /data/transfer.db /data/transfer.db-wal /data/transfer.db-shm
    rm -rf /data/files
    cp /restore/transfer.db /data/transfer.db
    cp -a /restore/files /data/files
    mkdir -p /data/tmp
    chown -R 10001:10001 /data
  '
```

启动并检查：

```bash
docker compose up -d
docker compose ps
docker compose logs --tail=200 app ocr
```

必须同时恢复数据库和 `files/`；只恢复其中一项会造成记录与实际文件不一致。若跨大版本回滚，优先恢复该版本升级前生成的完整备份。

## 9. 升级与回滚

升级前先执行完整备份，然后拉取目标版本并重建：

```bash
git fetch --tags
git checkout v目标版本
docker compose build --pull
docker compose up -d
docker compose ps
docker compose logs --tail=200 app ocr caddy
```

构建成功后 Compose 会替换容器，但保留 `transfer_data`、`caddy_data` 和 `caddy_config` 卷。

仅切回旧代码不一定能回退数据库结构。需要回滚时，应切回旧标签并恢复升级前的完整备份。

## 10. 重置遗忘的口令

网页端不提供“忘记口令”。在服务器上重置主口令：

```bash
read -s -p '新主口令: ' NEW_MAIN; echo
docker compose exec -e RESET_MAIN_PASSWORD="$NEW_MAIN" app node scripts/reset-passwords.mjs
unset NEW_MAIN
```

重置管理口令：

```bash
read -s -p '新管理口令: ' NEW_ADMIN; echo
docker compose exec -e RESET_ADMIN_PASSWORD="$NEW_ADMIN" app node scripts/reset-passwords.mjs
unset NEW_ADMIN
```

口令至少 8 位。默认会注销所有临时会话和长期设备。仅重置主口令且确实希望保留长期设备时，可增加：

```bash
-e RESET_REVOKE_DEVICES=false
```

不要直接把真实口令写进长期保存的 shell 脚本。

## 11. 常见问题

### Caddy 无法签发证书

检查：

- 域名 `A`/`AAAA` 是否指向当前服务器。
- 云安全组和系统防火墙是否开放 TCP 80、443。
- 服务器是否已有 Nginx、Apache 或其他程序占用 80/443。
- 如果配置了 `AAAA`，服务器 IPv6 是否真的可达；错误的 `AAAA` 记录也会导致验证失败。

```bash
docker compose logs --tail=200 caddy
ss -lntup | grep -E ':80|:443'
```

### 应用显示 unhealthy

```bash
docker compose logs --tail=200 app
docker compose exec app node -e "fetch('http://127.0.0.1:3000/api/auth/status').then(r=>console.log(r.status)).catch(console.error)"
```

常见原因是 `.env` 仍有占位值、`COOKIE_SECRET` 太短、`PUBLIC_ORIGIN` 不是 HTTPS 源地址，或首次启动时缺少两个初始化口令。

### 出现 `csrf_rejected`

确认始终使用 `PUBLIC_ORIGIN` 对应的 HTTPS 域名访问，不要混用公网 IP、内网 IP、HTTP 地址或另一个域名。修改 `PUBLIC_ORIGIN` 后需要重建应用容器：

```bash
docker compose up -d --force-recreate app
```

### 出现 `Rate limit exceeded`

这是登录防暴力破解限流。停止重复提交并等待页面提示的时间后重试。若正确口令仍持续被限制，检查是否有其他人或自动程序正在尝试登录，并查看应用日志。

### OCR 一直没有结果

```bash
docker compose ps
docker compose logs --tail=200 ocr
docker stats --no-stream
```

确认 `.env` 中 `OCR_ENABLED=true`，并在长期设备的设置页确认“OCR 搜索开关”已打开。首次识别需要下载或加载模型，通常比后续任务慢。可在设置页使用“重新识别”。

### 大文件上传失败

检查 `MAX_FILE_SIZE` 是否大于文件大小、服务器磁盘是否充足，以及上传过程中网络是否中断：

```bash
df -h
docker compose logs --tail=200 app caddy
```

修改 `MAX_FILE_SIZE` 后重建应用容器。

### 修改 `.env` 后没有生效

`docker compose restart` 不会重新读取所有 Compose 环境配置。使用：

```bash
docker compose up -d --force-recreate 服务名
```

## 12. 数据与安全边界

| 内容 | 位置 |
| --- | --- |
| SQLite 数据库 | `transfer_data` 卷内 `/data/transfer.db` |
| 上传文件 | `transfer_data` 卷内 `/data/files` |
| 上传临时文件 | `transfer_data` 卷内 `/data/tmp` |
| Caddy 证书 | `caddy_data` 卷 |
| Caddy 配置状态 | `caddy_config` 卷 |
| 备份归档 | 宿主机项目目录下 `./backups` |

需要注意：

- OCR 必须读取原始图片，本项目不是服务器不可见的端到端加密系统。
- `.env`、数据库、上传文件、备份、Caddy 证书卷和 SSH 密钥都属于敏感数据。
- 推荐启用宿主机磁盘加密，并对异地备份再次加密。
- 临时分享和外部投递是公网能力链接，应使用较短有效期和合理的次数、大小限制，用完及时撤销。
- 隐私锁能阻止临时设备继续读取内容，但无法追回锁定前已经下载、复制或截屏的数据。
