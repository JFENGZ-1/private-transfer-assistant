# 渡口 · 私人传输助手

一个面向个人自托管的跨设备文件传输与粘贴板。手机和电脑不必位于同一局域网；输入主口令可临时访问，使用独立管理口令可把浏览器授权为长期设备。

生产环境请参阅 [Docker + Caddy 部署指南](./DEPLOYMENT.md)；已有宝塔 LNMP 的服务器请使用 [宝塔 LNMP 部署指南](./DEPLOYMENT-BAOTA-LNMP.md)。

## 宝塔原生一键安装

适用于已经安装宝塔面板和 Nginx 的 64 位 Linux，也包含阿里云 CentOS 8.2 遗留兼容流程。先创建 ECS 快照、解析好域名，并建议为 2 GB 内存服务器配置 1–2 GB swap。然后在宝塔终端或 SSH 中以 `root` 执行：

```bash
curl -fsSL https://raw.githubusercontent.com/JFENGZ-1/private-transfer-assistant/main/scripts/bootstrap-baota-native.sh | bash
```

引导脚本会从本仓库下载当前 `main` 源码，再调用 [原生安装脚本](./scripts/install-baota-native.sh)。安装过程中依次输入：

1. 已解析到服务器的域名，不带 `https://`。
2. 主口令，至少 8 位，并再次确认。
3. 管理口令，至少 8 位、不能与主口令相同，并再次确认。

输入口令时终端不会显示字符。CentOS 8.2 会先切换阿里云/CentOS 8.5.2111 归档源，再独立编译 Python 3.11；不会替换宝塔或系统 Python。脚本完成 Node.js 构建、46 项测试、OCR 依赖安装和真实图片识别后，必须看到：

```text
OCR inference OK: OCR TEST 123456
安装完成
```

安装后在宝塔创建纯静态站点并申请 SSL，将反向代理目标设为 `http://127.0.0.1:3000`。脚本生成的完整 Nginx 片段位于：

```text
/opt/private-transfer-assistant/nginx/location.conf
/opt/private-transfer-assistant/nginx/server-directives.conf
```

阿里云安全组只需向公网开放 80、443；SSH 和宝塔端口应限制为自己的 IP，**不要开放 3000**。完整步骤、升级、备份和故障排查见 [宝塔 LNMP 部署指南](./DEPLOYMENT-BAOTA-LNMP.md)。

不希望直接执行网络脚本时，可先下载并检查：

```bash
curl -fL https://raw.githubusercontent.com/JFENGZ-1/private-transfer-assistant/main/scripts/bootstrap-baota-native.sh -o /root/bootstrap-baota-native.sh
less /root/bootstrap-baota-native.sh
bash /root/bootstrap-baota-native.sh
```

## 功能

- 聊天式发送文本、图片和任意文件，支持上传进度与跨设备实时同步
- 主口令临时会话：凭证只保存在当前页面内存，刷新或关闭后退出
- 管理口令授权长期设备，设置页仅长期设备可访问
- 隐私锁：锁定消息只对长期设备可见，包含搜索、缩略图和下载权限
- 文本、文件名及图片 OCR 内容搜索；搜索面板可单独关闭图片搜索
- 收藏、置顶、标签、备注、回收站、批量操作和指定设备投递
- 单条消息临时分享，以及只允许外部上传的投递链接
- PWA 安装与系统分享目标
- SQLite、本地文件卷、自动 HTTPS，适合 2 核 2 GB 的小型服务器

新消息系统通知暂未启用，页面内实时同步不受影响。

## 服务器要求（Docker 方案）

- 2 核 CPU、2 GB 内存，建议额外配置 1–2 GB swap
- 64 位 Linux 与 Docker Engine / Docker Compose v2
- 一个解析到服务器公网 IP 的域名
- 防火墙开放 TCP 80、TCP 443 和 UDP 443
- 足够的磁盘空间；文件保存在 Docker 的 `transfer_data` 卷

OCR 使用 RapidOCR 的 PaddleOCR 系轻量模型与 ONNX Runtime。它只在上传后异步建立索引，搜索请求不会即时运行 OCR。默认只有一个任务和一个推理线程，连续空闲 5 分钟后释放模型内存。

## 首次部署（Docker）

```bash
cp .env.example .env
openssl rand -base64 48
```

把生成的随机值写入 `.env` 的 `COOKIE_SECRET`，再填写域名、`PUBLIC_ORIGIN`、主口令与管理口令。`PUBLIC_ORIGIN` 必须是该站点完整的 HTTPS 源地址（例如 `https://transfer.example.com`，末尾不要加 `/`）。两个口令必须不同且至少 8 位，建议使用密码管理器生成 16 位以上随机口令。

生产模式会拒绝示例占位值、过短的 Cookie 密钥、缺失的首次初始化口令或不安全的公网源地址，并直接终止启动。生产环境也不开放网页首次初始化接口；数据库首次建库只能通过 `.env` 中的两个初始化口令完成，避免尚未配置完成的公网实例被他人抢先接管。

```bash
docker compose build
docker compose up -d
docker compose ps
docker compose logs -f app ocr caddy
```

Caddy 会在域名正确解析且 80/443 可从公网访问时自动申请证书。首次启动成功且能够登录后，建议从 `.env` 删除 `MAIN_PASSWORD` 和 `ADMIN_PASSWORD` 两行，再执行：

```bash
docker compose up -d --force-recreate app
```

口令只在数据库尚未初始化时读取；删除初始化环境变量可减少它们出现在容器配置中的时间。不要删除或随意更换 `COOKIE_SECRET`。

升级代码时执行：

```bash
docker compose build --pull
docker compose up -d
```

## OCR 配置

全局 OCR 开关和“重新识别”可在长期设备的设置页操作。搜索框齿轮中的“图片中的文字”只改变本次搜索范围，不会触发现场识别。

常用环境变量：

| 变量 | 默认值 | 说明 |
| --- | ---: | --- |
| `OCR_ENABLED` | `true` | 容器级总开关；设置页开关会在此基础上生效 |
| `OCR_MAX_EDGE` | `2200` | 识别前缩放后的最长边，增大可提高小字召回但更慢 |
| `OCR_DET_LIMIT_SIDE` | `1280` | 检测模型输入的最长边，速度与小字召回的主要平衡项 |
| `OCR_MAX_IMAGE_PIXELS` | `40000000` | 拒绝异常超大像素图，防止解压炸弹 |
| `OCR_MIN_SCORE` | `0.45` | 写入搜索索引的最低置信度 |
| `OCR_MAX_ATTEMPTS` | `3` | 单张图片最大尝试次数 |
| `OCR_CPU_THREADS` | `1` | ONNX 与数学库线程数；2 核机器不建议提高 |
| `OCR_RELEASE_MODEL_AFTER_SECONDS` | `300` | 队列空闲后释放模型；设 `0` 为常驻 |

OCR 容器限制为 896 MB，应用限制为 512 MB，Caddy 限制为 128 MB。若宿主机还运行其他服务，可把 `OCR_MAX_EDGE` 降至 `1600`，或在 `.env` 设置 `OCR_ENABLED=false` 后重建容器。

```bash
docker compose up -d --force-recreate ocr
docker compose logs -f ocr
```

OCR 失败不会影响图片下载。可在设置页查看待处理、完成和失败数量，重新识别失败图片或全部历史图片。

## 备份

完整备份包含 SQLite 快照和原始文件。为避免备份期间恰好发生上传或永久删除而产生不一致，先暂停应用与 OCR，再运行备份容器：

```bash
mkdir -p backups
docker compose stop app ocr
BACKUP_UID="$(id -u)" BACKUP_GID="$(id -g)" docker compose --profile tools run --rm backup
docker compose start app ocr
```

输出的 `transfer-YYYYmmddTHHMMSSZ.tar.gz` 不包含 `.env`。`BACKUP_UID/BACKUP_GID` 应填写运行 Docker 的宿主机用户 ID，确保归档可写且不会变成 root 所有。请单独加密保存 `.env`，并把备份复制到另一台机器或对象存储。可在 `.env` 设置 `BACKUP_RETENTION_DAYS=30` 自动清理同目录内超过期限、且文件名符合 `transfer-*.tar.gz` 的旧备份；默认 `0` 不自动删除。

恢复前先停止服务并备份当前卷。解压归档后，将 `transfer.db` 放回 `/data/transfer.db`，将 `files/` 放回 `/data/files/`，确保属主为容器 UID/GID `10001:10001`，再启动应用。不要只恢复数据库而遗漏文件目录。

## 在服务器上重置口令

网页端不提供“忘记口令”。服务器管理员可使用随应用镜像提供的脚本。以下命令不会在脚本输出中打印口令，但口令仍可能进入当前 shell 历史；建议先用 `read -s`：

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

也可设置 `RESET_MAIN_PASSWORD_FILE` / `RESET_ADMIN_PASSWORD_FILE` 指向容器内的 secret 文件。默认会注销所有临时会话与长期设备；仅重置主口令且确实需要保留长期设备时，可额外传入 `-e RESET_REVOKE_DEVICES=false`。

## 运维

```bash
# 服务状态与资源占用
docker compose ps
docker stats --no-stream

# 查看最近日志
docker compose logs --tail=200 app ocr caddy

# 仅重启 OCR，不中断文件传输
docker compose restart ocr

# 完全停止（数据卷仍保留）
docker compose down
```

不要执行 `docker compose down -v`，除非你已确认要删除数据库、消息和所有上传文件。升级前先做一次备份。

## 安全说明

- 必须通过 HTTPS 使用。不要直接暴露应用容器的 3000 端口；Compose 默认只公开 Caddy 的 80/443。
- 临时凭证不写入 Cookie、`localStorage` 或 `sessionStorage`；长期设备使用签名的 HttpOnly、Secure、SameSite=Strict Cookie，可在设置页逐台撤销。使用 Cookie 的写请求还会校验浏览器的 `Origin` 与 `Sec-Fetch-Site`，阻断跨站请求伪造。
- Compose 中只有 Caddy 能连接应用端口。Caddy 会覆盖客户端提供的转发头，应用据此取得真实公网 IP 做登录限流。`TRUST_PROXY=true` 仅适用于这一拓扑；如果直接暴露应用端口，应设为 `false`。
- 设置、设备管理、OCR 全局开关和投递链接只允许长期设备操作。修改口令与注销全部设备需要再次验证管理口令。
- 隐私锁由服务端在消息列表、搜索、文件下载和实时推送各层过滤。锁定前已经下载、复制或截屏的内容无法追回。
- OCR 必须读取原始图片，因此本项目不是服务器不可见的端到端加密方案。数据库、上传卷与备份都应视为敏感数据；推荐启用宿主机磁盘加密，并对异地备份额外加密。
- 上传文件保存在 Web 根目录之外，且容器以无特权用户、只读根文件系统和最小 Linux capabilities 运行。
- 临时分享与外部投递属于公网入口，应设置短有效期、次数和大小限制，并定期在设置页撤销不再使用的链接。
- Caddy 访问日志默认关闭，避免把临时分享与投递链接中的能力令牌写入日志；容器运行日志仍可用于故障排查。
- `COOKIE_SECRET`、`.env`、备份、Caddy 证书卷和服务器 SSH 密钥均不得提交到版本库或发送给他人。

## 数据位置

| 内容 | 容器路径 / 卷 |
| --- | --- |
| SQLite 数据库 | `/data/transfer.db` |
| SQLite WAL/SHM | `/data/transfer.db-wal`、`/data/transfer.db-shm` |
| 上传文件 | `/data/files` |
| 上传临时文件 | `/data/tmp` |
| Caddy 证书 | `caddy_data` 卷 |
| 宿主机备份 | `./backups` |

应用也兼容 `DATA_DIR`、`DB_PATH`、`FILES_DIR`、`UPLOAD_DIR`、`TEMP_DIR` 的自定义部署；Compose 已把 `FILES_DIR` 与 `UPLOAD_DIR` 指向同一目录。
