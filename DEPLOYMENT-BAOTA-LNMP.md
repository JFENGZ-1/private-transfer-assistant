# 宝塔 Nginx 原生部署指南（自动安装脚本）

本文适用于“渡口 · 私人传输助手”1.0 主版本及包含本安装脚本的后续源码。服务器已经安装宝塔面板和 Nginx，但尚未安装 Docker、Node.js、Python OCR 或其他运行环境。

最终架构：

```text
手机 / 电脑
    │ HTTPS、WebSocket
    ▼
宝塔 Nginx（80/443）
    │ http://127.0.0.1:3000
    ▼
Node.js / Fastify（systemd）
    ├─ SQLite 与本地文件
    └─ RapidOCR / ONNX Runtime（独立 systemd 服务）
```

不使用 Docker 和 Caddy。Nginx站点及证书仍由宝塔管理，安装脚本不会直接修改宝塔生成的 Nginx配置。

## 1. 安装脚本做什么

[安装脚本](./scripts/install-baota-native.sh)会自动完成：

- 支持 `apt`、`dnf` 和 `yum` 的现代 64 位 Linux。
- 安装 Git、编译工具、SQLite、Python venv、OpenGL运行库等依赖。
- CentOS 8 使用归档 AppStream 中的 GCC Toolset 11 编译 C++20 Node 原生模块，并在启动前执行真实 SQLite 内存库测试。
- 检测 Node.js 22；没有时从 Node.js 官方下载并校验 SHA-256。
- 检测 Python 3.10–3.13并创建独立虚拟环境。
- 创建无登录权限的 `transfer` 用户。
- 将每次安装构建为独立 release，并通过软链接切换当前版本。
- 执行前后端类型检查、46 项自动测试和生产构建。
- 安装 RapidOCR、ONNX Runtime、Pillow和 NumPy。
- 以实际 `transfer` 用户加载 OCR 模型，生成测试图片并执行一次真实 OCR 推理。
- OCR 无法识别测试文字时终止安装，不切换正式版本。
- 创建 Node 与 OCR 两个 systemd 服务，并设置 CPU、内存和文件权限限制。
- 启动应用并检查 `/api/auth/status` 健康接口。
- 生成可复制到宝塔的 Nginx反向代理和安全配置片段。
- 重复执行时保留生产密钥和数据；新应用健康检查失败时尝试恢复上一 release。

## 2. 服务器要求

- 2 核 CPU、2 GB内存，建议配置 1–2 GB swap。
- 64 位 Debian、Ubuntu、Rocky Linux、AlmaLinux或其他现代发行版。
- systemd。
- 宝塔面板和 Nginx已经正常运行。
- 一个解析到服务器公网 IP 的域名。
- 出站网络能访问 Node.js 官方站点、npm 和 Python 包索引。

推荐 Debian 12、Ubuntu 22.04/24.04 或 Rocky Linux 9。过旧系统可能没有 Python 3.10，或无法运行 Node.js 22 官方二进制包。

> **CentOS 8.2 遗留兼容模式：** 因服务器必须保留 CentOS 8.2，安装脚本会自动备份原 CentOS 软件源，依次尝试阿里云 ECS VPC 内网、经典网络、阿里云公网和 CentOS 官方的 8.5.2111 Vault，并把系统包更新到最后的归档快照。脚本随后从 Python 官方源码安装独立的 Python 3.11.16，不替换系统 Python，再执行真实 OCR 推理测试。这个方案解决兼容性，不能补回 CentOS 停止维护后的系统安全更新。

CentOS 8 原始 repo 会保存在 `/etc/yum.repos.d/private-transfer-centos8-backup-时间/`，项目专用归档配置为 `/etc/yum.repos.d/private-transfer-centos8-vault.repo`。脚本不会修改宝塔 Nginx 的程序或站点配置。

检查架构和系统：

```bash
uname -m
cat /etc/os-release
systemctl --version
nginx -v
```

阿里云 ECS 安全组建议如下：

- 入方向 TCP 80、443：来源 `0.0.0.0/0`；启用 IPv6 时再添加 `::/0`。
- SSH 端口和实际宝塔面板端口：只允许你的固定公网 IP，例如 `你的IP/32`。
- 不要添加 TCP 3000 的入方向规则；应用只供同机 Nginx 访问。
- 出方向至少允许 DNS 以及 TCP 80、443，否则无法下载 Node.js、Python、npm、OCR 模型和证书。

宝塔“安全”页面同样放行 80、443，并保留实际 SSH、宝塔端口。不要在系统防火墙开放 3000。

## 3. 一键安装或手动上传

### 3.1 一键安装（推荐）

先创建阿里云 ECS 快照，再通过宝塔终端或 SSH 以 `root` 执行：

```bash
curl -fsSL https://raw.githubusercontent.com/JFENGZ-1/private-transfer-assistant/v1.3.1/scripts/bootstrap-baota-native.sh | bash
```

[一键引导脚本](./scripts/bootstrap-baota-native.sh)只负责：

1. 检查 `root`、`curl` 和 `tar`。
2. 从 GitHub 下载本仓库已发布的 `v1.3.1` 源码到一次性临时目录。
3. 校验压缩包能够被完整解开并检查关键项目文件。
4. 将终端重新连接给正式安装程序，以便隐藏输入域名和两个口令。
5. 安装结束后删除临时源码；正式 release 和数据不会被删除。

因此它最终执行的仍是本指南介绍的 `scripts/install-baota-native.sh`，OCR 自检、服务限制、数据目录及重复安装逻辑完全相同。

如果不希望把网络脚本直接交给 Bash，可先下载、查看再执行：

```bash
curl -fL https://raw.githubusercontent.com/JFENGZ-1/private-transfer-assistant/v1.3.1/scripts/bootstrap-baota-native.sh -o /root/bootstrap-baota-native.sh
less /root/bootstrap-baota-native.sh
bash /root/bootstrap-baota-native.sh
```

一键安装会继续执行第 4 节中的交互安装。完成后直接前往第 5 节配置宝塔站点，不需要保留下载的临时源码。

### 3.2 手动上传项目

将完整项目上传到服务器，例如：

```text
/root/private-transfer-assistant-source
```

可以使用宝塔文件管理器上传压缩包并解压，也可以通过 Git：

```bash
cd /root
git clone 你的仓库地址 private-transfer-assistant-source
cd private-transfer-assistant-source
```

本项目公开仓库可直接使用：

```bash
git clone https://github.com/JFENGZ-1/private-transfer-assistant.git private-transfer-assistant-source
cd private-transfer-assistant-source
```

请使用包含 `scripts/install-baota-native.sh` 的当前源码。最初的 `v1.0.0` 代码标签早于部署脚本，单独切回该旧标签不会包含本安装工具。

确认安装文件：

```bash
cd /root/private-transfer-assistant-source
ls package.json package-lock.json scripts/install-baota-native.sh ocr/worker.py
```

源码目录只是安装源。正式程序会部署到 `/opt/private-transfer-assistant`，数据位于 `/var/lib/private-transfer-assistant`。

## 4. 执行自动安装

使用第 3.1 节一键命令时，本节会由引导脚本自动执行；手动上传源码时再运行下面的命令。

使用 root 运行：

```bash
cd /root/private-transfer-assistant-source
bash scripts/install-baota-native.sh
```

首次运行会依次询问：

- 渡口域名，不带 `https://`。
- 主口令并二次确认。
- 管理口令并二次确认。

输入口令时终端不会显示字符。两个口令至少 8 位且不能相同。

安装时间取决于服务器网络和 CPU。CentOS 8.2 首次执行还会更新到 8.5.2111 归档快照并源码编译 Python 3.11，2 核服务器会比普通系统更久。建议先在宝塔“Linux 工具箱”或系统中配置 1–2 GB swap；安装完成前不要关闭终端。

CentOS 更新及 Python 安装均可重复执行。安装成功后，先确认宝塔和两个项目服务正常，再安排一次服务器重启，以加载最后归档快照中的内核；不要在脚本构建过程中重启。

### 4.1 非交互安装

也可以通过环境变量提供参数：

```bash
TRANSFER_DOMAIN=transfer.example.com \
TRANSFER_PORT=3000 \
TRANSFER_MAIN_PASSWORD='你的主口令' \
TRANSFER_ADMIN_PASSWORD='你的管理口令' \
bash scripts/install-baota-native.sh
```

非交互方式可能让口令进入 shell 历史或进程环境，不如交互输入安全。优先使用交互安装。

### 4.2 安装成功标志

脚本必须同时输出类似：

```text
OCR inference OK: OCR TEST 123456
安装完成
```

检查服务：

```bash
systemctl status private-transfer-assistant --no-pager
systemctl status private-transfer-assistant-ocr --no-pager
curl -i http://127.0.0.1:3000/api/auth/status
ss -lntp | grep ':3000 '
```

正确状态：

- 两个 systemd 服务都是 `active (running)`。
- 健康接口返回 HTTP 200。
- 3000 只监听 `127.0.0.1`，不是 `0.0.0.0`。

查看日志：

```bash
journalctl -u private-transfer-assistant -n 100 --no-pager
journalctl -u private-transfer-assistant-ocr -n 100 --no-pager
```

## 5. 在宝塔创建站点

### 5.1 添加独立站点

进入：

```text
宝塔 → 网站 → 添加站点
```

填写：

- 域名：安装时填写的域名。
- 根目录：`/www/wwwroot/transfer-proxy`。
- PHP：纯静态。
- 数据库：不创建。
- FTP：不创建。

该目录只供宝塔站点和证书验证使用，不放程序、数据和 `.env`。

### 5.2 申请 HTTPS

进入站点“SSL”页面，申请 Let's Encrypt 或宝塔提供的免费证书。证书成功后开启“强制 HTTPS”。

宝塔官方 SSL 文档：<https://docs.bt.cn/user-guide/site/php/site-config/ssl>。

申请失败时检查：

- 域名 `A` 记录是否指向当前服务器。
- TCP 80、443 是否在云安全组和宝塔防火墙放行。
- 是否添加了无法访问的错误 `AAAA` 记录。
- 域名是否已经被 CDN 或其他代理接管。

### 5.3 添加反向代理

安装脚本已经生成：

```text
/opt/private-transfer-assistant/nginx/location.conf
```

查看：

```bash
cat /opt/private-transfer-assistant/nginx/location.conf
```

在宝塔进入：

```text
网站 → 渡口域名 → 反向代理 → 添加反向代理
```

填写：

- 代理名称：`private-transfer-assistant`
- 代理目录：`/`
- 目标 URL：`http://127.0.0.1:3000`
- 发送域名：`$host`
- 内容替换：留空
- 缓存：关闭

如果安装时使用了其他端口，以脚本生成的 `location.conf` 为准。

打开该反向代理的配置文件，用生成的 `location / { ... }` 替换默认代理段。关键配置包括：

- WebSocket 的 `Upgrade` 和 `Connection`。
- `proxy_request_buffering off`，避免 Nginx先把大文件完整缓存到磁盘。
- 24 小时上传下载超时。
- 覆盖真实 IP 和代理协议头。

### 5.4 大文件和安全响应头

安装脚本还生成：

```text
/opt/private-transfer-assistant/nginx/server-directives.conf
```

查看：

```bash
cat /opt/private-transfer-assistant/nginx/server-directives.conf
```

把其中内容放进该站点 Nginx配置的 `server { ... }` 内、所有 `location` 外。不要删除宝塔生成的 SSL、证书续签和 include 配置。

配置默认允许最大 10 GiB 单文件。修改大小时要同时调整：

- Nginx 的 `client_max_body_size`。
- `/etc/private-transfer-assistant.env` 中的 `MAX_FILE_SIZE`，单位为字节。

保存前必须检查：

```bash
nginx -t
```

只有出现 `syntax is ok` 和 `test is successful` 后才重载：

```bash
nginx -s reload
```

## 6. 首次登录和删除初始化口令

打开：

```text
https://你的域名
```

完成：

1. 使用主口令登录。
2. 使用管理口令把当前浏览器设为长期设备。
3. 确认可以进入设置页。
4. 发送一条文本并上传一张图片。
5. 等待 OCR 完成并搜索图片文字。

初始化成功后，从生产配置中删除两个明文初始化口令：

```bash
sed -i '/^MAIN_PASSWORD=/d;/^ADMIN_PASSWORD=/d' /etc/private-transfer-assistant.env
systemctl restart private-transfer-assistant
```

不要删除或更换 `COOKIE_SECRET`。口令哈希已经保存在 SQLite 数据库中，之后可在设置页修改。

确认权限仍正确：

```bash
chown root:transfer /etc/private-transfer-assistant.env
chmod 0640 /etc/private-transfer-assistant.env
```

## 7. 安装后的目录

| 路径 | 用途 |
| --- | --- |
| `/opt/private-transfer-assistant/current` | 当前 release 软链接 |
| `/opt/private-transfer-assistant/releases` | 历次构建成功的 release |
| `/opt/private-transfer-assistant/current/.venv` | 与当前 release 配套的 OCR Python虚拟环境 |
| `/opt/private-transfer-assistant/bin/node` | 固定的 Node.js 22入口 |
| `/opt/private-transfer-assistant/nginx` | 宝塔 Nginx配置片段 |
| `/var/lib/private-transfer-assistant/transfer.db` | SQLite 数据库 |
| `/var/lib/private-transfer-assistant/files` | 上传文件 |
| `/var/lib/private-transfer-assistant/tmp` | 上传与数据库临时文件 |
| `/var/backups/private-transfer-assistant` | 备份目录 |
| `/etc/private-transfer-assistant.env` | 生产密钥与配置 |

## 8. 资源限制

systemd 配置的是上限，不会预先占满内存：

- Node 应用：`MemoryHigh=384M`、`MemoryMax=512M`、最多 1.25 CPU。
- OCR：`MemoryHigh=640M`、`MemoryMax=896M`、最多 1 CPU。
- OCR 只使用一个推理线程，空闲 5 分钟后释放模型。

查看实际占用：

```bash
systemd-cgtop
systemctl show private-transfer-assistant -p MemoryCurrent -p MemoryPeak
systemctl show private-transfer-assistant-ocr -p MemoryCurrent -p MemoryPeak
free -h
```

如果 OCR 影响其他网站，可编辑 `/etc/private-transfer-assistant.env`：

```dotenv
OCR_MAX_EDGE=1600
OCR_DET_LIMIT_SIDE=960
OCR_CPU_THREADS=1
```

然后：

```bash
systemctl restart private-transfer-assistant-ocr
```

也可以在长期设备设置页关闭 OCR，图片上传、预览和下载不受影响。

## 9. 日常运维

```bash
# 服务状态
systemctl status private-transfer-assistant --no-pager
systemctl status private-transfer-assistant-ocr --no-pager

# 实时日志
journalctl -u private-transfer-assistant -f
journalctl -u private-transfer-assistant-ocr -f

# 重启
systemctl restart private-transfer-assistant
systemctl restart private-transfer-assistant-ocr

# 暂停和恢复 OCR
systemctl stop private-transfer-assistant-ocr
systemctl start private-transfer-assistant-ocr
```

## 10. 升级

准备新版本完整源码，然后重新运行同一个安装脚本：

```bash
cd /root/private-transfer-assistant-new-source
bash scripts/install-baota-native.sh
```

脚本会：

- 保留 `/etc/private-transfer-assistant.env`。
- 保留 `/var/lib/private-transfer-assistant` 中的数据库和文件。
- 建立新的 release。
- 重新执行测试、构建和 OCR 推理测试。
- 成功后原子切换 `current` 软链接并重启服务。
- 应用健康检查失败时尝试恢复上一 release。
- 全部成功后保留当前 release 和最近两个旧 release，清理更早版本及其独立 OCR 虚拟环境。

升级前仍应完整备份。数据库迁移后，单纯切回旧代码不一定安全；跨版本回滚优先恢复升级前的完整备份。

## 11. 备份

为了保证数据库与文件一致，短暂停止应用和 OCR：

```bash
systemctl stop private-transfer-assistant-ocr
systemctl stop private-transfer-assistant

runuser -u transfer -- env \
  DATA_DIR=/var/lib/private-transfer-assistant \
  DB_PATH=/var/lib/private-transfer-assistant/transfer.db \
  FILES_DIR=/var/lib/private-transfer-assistant/files \
  BACKUP_DIR=/var/backups/private-transfer-assistant \
  BACKUP_RETENTION_DAYS=30 \
  bash /opt/private-transfer-assistant/current/scripts/backup.sh

systemctl start private-transfer-assistant
systemctl start private-transfer-assistant-ocr
```

验证：

```bash
ls -lh /var/backups/private-transfer-assistant/transfer-*.tar.gz
tar -tzf /var/backups/private-transfer-assistant/transfer-YYYYmmddTHHMMSSZ.tar.gz | head
```

单独加密备份：

- `/etc/private-transfer-assistant.env`
- 宝塔中该域名的 Nginx站点配置
- 必要时备份 SSL 证书

把备份复制到其他服务器、NAS 或对象存储。同一块硬盘上的备份无法防范硬盘故障。

## 12. 恢复

恢复会覆盖现有消息和文件。先确认归档可解压，并再次备份当前数据。

```bash
mkdir -p /root/transfer-restore
tar -xzf /var/backups/private-transfer-assistant/transfer-YYYYmmddTHHMMSSZ.tar.gz \
  -C /root/transfer-restore
ls /root/transfer-restore/transfer.db /root/transfer-restore/files
```

确认路径无误后：

```bash
systemctl stop private-transfer-assistant-ocr
systemctl stop private-transfer-assistant

rm -f /var/lib/private-transfer-assistant/transfer.db
rm -f /var/lib/private-transfer-assistant/transfer.db-wal
rm -f /var/lib/private-transfer-assistant/transfer.db-shm
rm -rf /var/lib/private-transfer-assistant/files

cp /root/transfer-restore/transfer.db /var/lib/private-transfer-assistant/transfer.db
cp -a /root/transfer-restore/files /var/lib/private-transfer-assistant/files
install -d -o transfer -g transfer -m 0750 /var/lib/private-transfer-assistant/tmp
chown -R transfer:transfer /var/lib/private-transfer-assistant

systemctl start private-transfer-assistant
systemctl start private-transfer-assistant-ocr
```

数据库和 `files/` 必须来自同一次备份。

## 13. 重置遗忘的口令

主口令：

```bash
cd /opt/private-transfer-assistant/current
read -s -p '新主口令: ' NEW_MAIN; echo
runuser -u transfer -- env \
  DB_PATH=/var/lib/private-transfer-assistant/transfer.db \
  RESET_MAIN_PASSWORD="$NEW_MAIN" \
  /opt/private-transfer-assistant/bin/node scripts/reset-passwords.mjs
unset NEW_MAIN
```

管理口令：

```bash
read -s -p '新管理口令: ' NEW_ADMIN; echo
runuser -u transfer -- env \
  DB_PATH=/var/lib/private-transfer-assistant/transfer.db \
  RESET_ADMIN_PASSWORD="$NEW_ADMIN" \
  /opt/private-transfer-assistant/bin/node scripts/reset-passwords.mjs
unset NEW_ADMIN
```

默认会注销全部临时会话和长期设备。

## 14. 常见问题

### 安装脚本提示 Python 版本过低

OCR 依赖需要 Python 3.10–3.13。CentOS 8.2 会自动编译项目专用的 `/opt/private-transfer-python-3.11.16/bin/python3.11`，不会替换 `/usr/bin/python3`。如果仍出现版本过低，查看脚本前面的 Python 下载、SHA-256 校验或编译错误；不要修改系统 Python 软链接。

### CentOS 8 软件源不可用

脚本依次探测阿里云 ECS VPC 地址 `mirrors.cloud.aliyuncs.com`、经典网络地址 `mirrors.aliyuncs.com`、公网 `mirrors.aliyun.com` 和 CentOS 官方 Vault。检查：

```bash
curl -I http://mirrors.cloud.aliyuncs.com/centos-vault/8.5.2111/BaseOS/x86_64/os/repodata/repomd.xml
curl -I https://mirrors.aliyun.com/centos-vault/8.5.2111/BaseOS/x86_64/os/repodata/repomd.xml
cat /etc/yum.repos.d/private-transfer-centos8-vault.repo
```

原配置保存在 `/etc/yum.repos.d/private-transfer-centos8-backup-时间/`。不要删除备份；Vault 只是一份 2021 年的冻结快照，不会获得新安全补丁。

### Node.js 下载失败

检查服务器 DNS 和出站 HTTPS：

```bash
curl -I https://nodejs.org/dist/latest-v22.x/
```

脚本会校验官方 `SHASUMS256.txt`，校验失败不会安装。

### `better-sqlite3` 提示 `GLIBC_2.29` 或 `-std=c++20`

CentOS 8 的 GLIBC 版本低于部分预编译 Node 原生包的要求，系统自带 GCC 8 也不接受正式的 `-std=c++20` 参数。新版安装脚本会自动安装 GCC Toolset 11，将 `better-sqlite3` 改为本机源码编译，并在继续部署前实际打开一次 SQLite 内存数据库。

如果使用旧脚本遇到此错误，不要升级或手动替换系统 GLIBC，也不要修改 `/usr/bin/g++`。直接重新执行最新一键命令：

```bash
curl -fsSL https://raw.githubusercontent.com/JFENGZ-1/private-transfer-assistant/v1.3.1/scripts/bootstrap-baota-native.sh | bash
```

脚本会保留 `/etc/private-transfer-assistant.env`、数据库和文件，复用已经编译好的独立 Python，然后创建新的 release 继续安装。

### 自动测试大量返回 `403`

如果测试汇总显示 `29 failed | 6 passed`，并且多数断言实际收到 `403`，这是旧版安装脚本把正式域名 `PUBLIC_ORIGIN` 带进了隔离测试，触发了 CSRF 生产校验，并非项目数据或口令错误。最新版脚本已将构建测试和正式运行环境完全隔离。重新执行最新一键命令即可；已有 `/etc/private-transfer-assistant.env`、数据库和上传文件都会保留。

### OCR 推理测试失败

脚本不会启用失败的 release。查看输出中的 Python、ONNX或模型错误，并确认内存、磁盘和出站网络：

```bash
free -h
df -h
```

如果服务安装后才异常：

```bash
journalctl -u private-transfer-assistant-ocr -n 200 --no-pager
```

如果错误是 RapidOCR 下载模型时无法写入 `.venv/.../site-packages/rapidocr/models`，并显示 `PermissionError: [Errno 13]`，说明使用了先锁定虚拟环境权限、后下载模型的旧安装脚本。最新版会先在新 release 内预下载模型，随后将程序目录设为只读，最后再以低权限 `transfer` 用户执行真实 OCR 推理测试。重新运行最新一键安装命令即可，现有配置和数据不会被覆盖。

### 502 Bad Gateway

```bash
curl -i http://127.0.0.1:3000/api/auth/status
systemctl status private-transfer-assistant --no-pager
journalctl -u private-transfer-assistant -n 100 --no-pager
```

本机接口正常时，检查宝塔反向代理端口和 `nginx -t`。

### 413 Request Entity Too Large

Nginx 的 `client_max_body_size` 小于上传文件。同步调整 Nginx 和环境文件中的 `MAX_FILE_SIZE`，然后重启应用。

### 消息不能实时同步

确认反向代理使用脚本生成的 `location.conf`，特别是：

```nginx
proxy_http_version 1.1;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
proxy_buffering off;
```

### `csrf_rejected`

只通过环境文件中 `PUBLIC_ORIGIN` 对应的 HTTPS 域名访问，不混用 IP、HTTP 或其他域名。确认 Nginx传递 `Host` 和 `X-Forwarded-Proto`。

### `Rate limit exceeded`

登录接口正在执行防暴力破解限流。停止重复提交，等待提示时间后再试，并检查是否有自动程序持续尝试登录。

## 15. 安全注意事项

- 3000 只能监听 `127.0.0.1`，防火墙不要开放公网 3000。
- 程序和数据不放在宝塔网站根目录。
- 服务使用无登录权限的 `transfer` 用户，不与 Nginx/PHP共享写权限。
- `/etc/private-transfer-assistant.env` 保持 `root:transfer`、`0640`。
- Nginx反向代理缓存必须关闭。
- 定期更新宝塔、Nginx、Node.js、Python依赖和系统安全补丁。
- OCR 必须读取原始图片，所以数据库、文件和备份都属于敏感数据。
- 若启用宝塔 WAF，必须测试 WebSocket、大文件上传、临时分享和外部投递。
- 建议暂不为该域名套 CDN；CDN 可能限制上传大小、WebSocket 时长并改变客户端 IP。
