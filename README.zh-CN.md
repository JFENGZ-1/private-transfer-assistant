<div align="center">
  <img src="apps/web/public/icon.svg" width="88" alt="渡口图标">
  <h1>渡口 · 私人传输助手</h1>
  <p>无需注册账号、无需位于同一局域网的个人自托管文件传输与跨设备粘贴板。</p>

  [English](./README.md) · [在线演示](https://jfengz-1.github.io/private-transfer-assistant/) · [部署指南](./DEPLOYMENT-BAOTA-LNMP.md)

  [![Release](https://img.shields.io/github/v/release/JFENGZ-1/private-transfer-assistant?style=flat-square&label=release)](https://github.com/JFENGZ-1/private-transfer-assistant/releases/latest)
  [![Stars](https://img.shields.io/github/stars/JFENGZ-1/private-transfer-assistant?style=flat-square)](https://github.com/JFENGZ-1/private-transfer-assistant/stargazers)
  [![Node.js](https://img.shields.io/badge/Node.js-22%2B-177245?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/)
  [![Vue](https://img.shields.io/badge/Vue-3-42b883?style=flat-square&logo=vue.js&logoColor=white)](https://vuejs.org/)
  [![Self-hosted](https://img.shields.io/badge/deploy-self--hosted-0f766e?style=flat-square)](#linux-原生一键安装宝塔可选)

  [界面预览](#界面预览) · [核心能力](#核心能力) · [一键安装](#linux-原生一键安装宝塔可选) · [宝塔部署指南](./DEPLOYMENT-BAOTA-LNMP.md) · [最新版本](https://github.com/JFENGZ-1/private-transfer-assistant/releases/latest)
</div>

## 渡口能解决什么问题？

- **手机和电脑不在同一网络**：通过自己的 HTTPS 域名发送文本、图片、视频和任意文件，不依赖局域网发现。
- **不想在临时设备登录第三方账号**：输入主口令即可临时进入，刷新或关闭页面后退出；可信浏览器可用独立管理口令设为长期设备。
- **文件多了以后难以查找**：支持文件名、图片原始名称、标签、来源设备和 OCR 图片文字搜索，并可按内容类型快速筛选。
- **需要把内容安全地交给别人**：单条或多条内容可生成临时分享、二维码；也可建立外部投递入口接收文件或纯文本。

数据、文件和 OCR 均保存在你自己的服务器。当前稳定版本为 **v1.4.4**；应用不依赖宝塔，核心服务由 systemd 运行。公网部署需要 Nginx 或其他反向代理提供 HTTPS；本仓库已经实际验证并详细记录的是 [宝塔 LNMP 配置方式](./DEPLOYMENT-BAOTA-LNMP.md)。

## 界面预览

<table>
  <tr>
    <td align="center" width="50%">
      <strong>桌面对话与文件传输</strong><br><br>
      <img src="docs/screenshots/assistant-desktop.png" alt="渡口桌面对话界面" width="680">
    </td>
    <td align="center" width="50%">
      <strong>分类搜索</strong><br><br>
      <img src="docs/screenshots/search-desktop.png" alt="渡口分类搜索界面" width="680">
    </td>
  </tr>
  <tr>
    <td align="center" width="50%">
      <strong>手机端自适应界面</strong><br><br>
      <img src="docs/screenshots/assistant-mobile.png" alt="渡口手机端界面" width="300">
    </td>
    <td align="center" width="50%">
      <strong>OCR 与存储设置</strong><br><br>
      <img src="docs/screenshots/settings-desktop.png" alt="渡口 OCR 与存储设置界面" width="680">
    </td>
  </tr>
</table>

> 截图使用隔离的演示数据生成，不包含真实口令或用户文件。界面会随版本继续调整。

## 核心能力

- **聊天式跨设备传输**：发送文本、图片、视频和任意文件，显示来源设备名称、上传进度，并实时同步到其他设备。
- **两级设备授权**：主口令用于临时会话，管理口令用于长期设备；设置页和隐私内容仅长期设备可访问。
- **消息整理**：收藏、置顶、标签、备注、消息合并、自由复制与编辑、回收站恢复及批量操作。
- **全文与分类搜索**：搜索文本、链接、文件名、图片名称和 OCR 识别内容，并按日期、图片与视频、文件、链接、音频及来源设备浏览。
- **分享与投递**：多条文本和文件共用一个临时分享链接，支持有效期、下载次数、二维码和参数编辑；外部投递可接收文件或纯文本。
- **统一预览**：图片、视频、音频、PDF 与隔离 HTML 均可在站内预览；PDF 使用客户端 PDF.js，兼容没有内置 PDF 阅读器的手机浏览器。
- **轻量自托管**：Fastify、Vue 3、SQLite、本地文件存储和 RapidOCR，面向 2 核 2 GB 小型服务器调优。

新消息系统通知暂未启用，页面内实时同步不受影响。

## Linux 原生一键安装（宝塔可选）

适用于使用 systemd，且带有 `apt`、`dnf` 或 `yum` 的 64 位 Linux，也包含阿里云 CentOS 8.2 遗留兼容流程。**不要求安装宝塔，也不要求执行脚本前已经安装 Nginx**；脚本负责应用、数据库运行库、Node.js、Python/OCR 和 systemd 服务，不会自动签发证书或配置公网反向代理。

先创建服务器快照、解析好域名，并建议为 2 GB 内存服务器配置 1–2 GB swap。然后通过任意 root 终端或 SSH 执行：

```bash
curl -fsSL https://raw.githubusercontent.com/JFENGZ-1/private-transfer-assistant/v1.4.4/scripts/bootstrap-baota-native.sh | bash
```

脚本文件名中的 `baota-native` 为兼容既有安装命令而保留，不表示宝塔是运行依赖。

引导脚本会从本仓库下载已发布的 `v1.4.4` 源码，再调用 [原生安装脚本](./scripts/install-baota-native.sh)。安装过程中依次输入：

1. 已解析到服务器的域名，不带 `https://`。
2. 主口令，至少 8 位，并再次确认。
3. 管理口令，至少 8 位、不能与主口令相同，并再次确认。

输入口令时终端不会显示字符。CentOS 8.2 会先切换阿里云/CentOS 8.5.2111 归档源，再独立编译 Python 3.11；不会替换系统 Python。脚本完成依赖安装、完整测试、生产构建和真实 OCR 图片识别后，必须看到：

```text
OCR inference OK: OCR TEST 123456
安装完成
```

安装后需要让 Nginx 或其他反向代理把 HTTPS 域名转发到 `http://127.0.0.1:3000`。使用宝塔时可创建纯静态站点、申请 SSL 后粘贴脚本生成的配置；不使用宝塔时可用系统 Nginx 配合 Certbot/acme.sh，并在站点的 `server` 配置中引用同一组片段：

```text
/opt/private-transfer-assistant/nginx/location.conf
/opt/private-transfer-assistant/nginx/server-directives.conf
```

阿里云安全组只需向公网开放 80、443；SSH 和面板端口（如有）应限制为自己的 IP，**不要开放 3000**。宝塔用户的完整步骤、升级、备份和故障排查见 [宝塔 LNMP 部署指南](./DEPLOYMENT-BAOTA-LNMP.md)。

不希望直接执行网络脚本时，可先下载并检查：

```bash
curl -fL https://raw.githubusercontent.com/JFENGZ-1/private-transfer-assistant/v1.4.4/scripts/bootstrap-baota-native.sh -o /root/bootstrap-baota-native.sh
less /root/bootstrap-baota-native.sh
bash /root/bootstrap-baota-native.sh
```

## Linux 原生一键升级

适用于已经通过上述脚本部署、且存在 `/etc/private-transfer-assistant.env` 的服务器。升级会复用现有域名、端口、Cookie 密钥和运行参数，不会要求重新输入主口令或管理口令，也不会删除数据库和上传文件。

升级前建议先在阿里云控制台创建 ECS 快照。也可以在服务器中额外生成一份一致性备份：

```bash
systemctl stop private-transfer-assistant private-transfer-assistant-ocr

tar -czf /root/private-transfer-backup-$(date +%Y%m%d-%H%M%S).tar.gz \
  /var/lib/private-transfer-assistant \
  /etc/private-transfer-assistant.env

systemctl start private-transfer-assistant private-transfer-assistant-ocr
```

然后在任意 root 终端或 SSH 中执行：

```bash
curl -fsSL https://raw.githubusercontent.com/JFENGZ-1/private-transfer-assistant/v1.4.4/scripts/bootstrap-baota-native.sh | bash
```

脚本会下载已发布的 `v1.4.4` 源码、运行服务端和前端测试、执行生产构建与真实 OCR 推理测试，然后创建新的 release。只有本机健康检查通过后才会原子切换 `/opt/private-transfer-assistant/current` 并重启两个 systemd 服务；健康检查失败时会尝试恢复上一 release。升级全部成功后自动保留当前 release 和最近两个旧 release，并清理更早版本，避免 OCR 虚拟环境持续占用磁盘。

出现“安装完成”后执行：

```bash
grep '"version"' /opt/private-transfer-assistant/current/package.json | head -1
systemctl is-active private-transfer-assistant
systemctl is-active private-transfer-assistant-ocr
curl -s http://127.0.0.1:3000/api/auth/status
```

v1.4.4 正常结果应包含 `"version": "1.4.4"`、两个 `active`，以及 `{"initialized":true,...}`。如果异常，查看最近日志：

```bash
journalctl -u private-transfer-assistant -n 100 --no-pager
journalctl -u private-transfer-assistant-ocr -n 100 --no-pager
```

升级完成后，手机浏览器或已安装的 PWA 如仍显示旧界面，请彻底关闭后重新打开。不要手动删除 `/var/lib/private-transfer-assistant`、`/etc/private-transfer-assistant.env` 或当前 release 目录。

## 更多功能细节

- 隐私锁会在消息列表、搜索、缩略图、下载和实时推送各层隐藏锁定内容，仅长期设备可见。
- OCR 后台队列支持查看识别结果、重新识别历史图片，以及执行包含真实图片推理和结果返回的状态测试。
- 长期设备可在设置页修改主口令与管理口令；完全遗忘后可由服务器管理员执行安全重置。
- PWA 支持安装、系统分享目标、自定义应用图标、站点标题和浏览器标签标题。

## 服务器要求

- 2 核 CPU、2 GB 内存，建议额外配置 1–2 GB swap
- 使用 systemd，且提供 `apt`、`dnf` 或 `yum` 的 64 位 Linux
- 一个解析到服务器公网 IP 的域名和有效 HTTPS 证书
- Nginx 或其他支持 WebSocket 与流式上传的 HTTPS 反向代理；宝塔面板可选
- 阿里云安全组与系统防火墙开放 TCP 80、443；3000 端口不得向公网开放
- 足够保存数据库、上传文件、临时文件和异地备份的磁盘空间

安装脚本兼容阿里云 CentOS 8.2 遗留环境，会独立安装应用需要的 Node.js 和 Python，不替换系统运行时。

## OCR 配置

全局 OCR 开关和“重新识别”可在长期设备的设置页操作。搜索框齿轮中的“图片中的文字”只改变本次搜索范围，不会触发现场识别。

OCR 使用 RapidOCR 的轻量模型与 ONNX Runtime。图片上传后进入后台队列异步建立索引，搜索时不会临时运行识别。默认单任务、单推理线程，连续空闲 5 分钟后释放模型内存，适合 2 核 2 GB 服务器。

常用配置位于 `/etc/private-transfer-assistant.env`：

| 变量 | 默认值 | 说明 |
| --- | ---: | --- |
| `OCR_ENABLED` | `true` | 服务级总开关；设置页开关会在此基础上生效 |
| `OCR_MAX_EDGE` | `2200` | 识别前缩放后的最长边，增大可提高小字召回但更慢 |
| `OCR_DET_LIMIT_SIDE` | `1280` | 检测模型输入的最长边，速度与小字召回的主要平衡项 |
| `OCR_MAX_IMAGE_PIXELS` | `40000000` | 拒绝异常超大像素图，防止解压炸弹 |
| `OCR_MIN_SCORE` | `0.45` | 写入搜索索引的最低置信度 |
| `OCR_MAX_ATTEMPTS` | `3` | 单张图片最大尝试次数 |
| `OCR_CPU_THREADS` | `1` | ONNX 与数学库线程数；2 核机器不建议提高 |
| `OCR_RELEASE_MODEL_AFTER_SECONDS` | `300` | 队列空闲后释放模型；设 `0` 为常驻 |

若 OCR 影响同一服务器上的其他网站，可把 `OCR_MAX_EDGE` 降至 `1600`，并保持 `OCR_CPU_THREADS=1`。修改后重启 OCR 服务：

```bash
systemctl restart private-transfer-assistant-ocr
journalctl -u private-transfer-assistant-ocr -n 100 --no-pager
```

OCR 失败不会影响图片预览或下载。长期设备可在设置页查看排队、处理中、完成和失败项目，展开已完成图片查看识别文字，重新识别历史图片，或执行包含真实图片识别与结果返回的状态测试。

## 备份

完整备份必须同时包含 SQLite 数据库、原始文件和生产配置。为避免备份期间发生上传或永久删除而产生不一致，请短暂停止两个服务：

```bash
systemctl stop private-transfer-assistant private-transfer-assistant-ocr

tar -czf /root/private-transfer-backup-$(date +%Y%m%d-%H%M%S).tar.gz \
  /var/lib/private-transfer-assistant \
  /etc/private-transfer-assistant.env

systemctl start private-transfer-assistant private-transfer-assistant-ocr
```

将归档复制到另一台服务器、NAS 或对象存储，并额外备份宝塔中的站点 Nginx 配置和 SSL 证书。同一硬盘上的备份无法防范硬盘故障。使用项目备份脚本、设置自动保留天数以及执行恢复的完整步骤见 [部署指南的备份与恢复章节](./DEPLOYMENT-BAOTA-LNMP.md#11-备份)。

## 忘记口令与安全重置

项目支持口令修改和遗忘后的重置，但不会保存或显示原口令明文：

- 当前浏览器仍是长期设备且记得管理口令时，可在“设置 → 修改口令”中修改主口令或管理口令。
- 无法进入设置页、管理口令也已遗忘，或所有长期设备均已失效时，由服务器管理员使用随应用提供的脚本设置新口令。

在服务器的 root 终端或 SSH 中重置主口令如下。`read -s` 输入时不会显示字符：

```bash
cd /opt/private-transfer-assistant/current
read -s -p '新主口令: ' NEW_MAIN; echo
runuser -u transfer -- env \
  DB_PATH=/var/lib/private-transfer-assistant/transfer.db \
  RESET_MAIN_PASSWORD="$NEW_MAIN" \
  /opt/private-transfer-assistant/bin/node scripts/reset-passwords.mjs
unset NEW_MAIN
```

重置管理口令：

```bash
read -s -p '新管理口令: ' NEW_ADMIN; echo
runuser -u transfer -- env \
  DB_PATH=/var/lib/private-transfer-assistant/transfer.db \
  RESET_ADMIN_PASSWORD="$NEW_ADMIN" \
  /opt/private-transfer-assistant/bin/node scripts/reset-passwords.mjs
unset NEW_ADMIN
```

口令至少 8 位，主口令和管理口令不能相同。服务器脚本默认注销所有临时会话和长期设备，需要重新登录并授权长期设备；这能避免遗失设备继续使用旧会话访问。

## 运维

```bash
# 服务状态
systemctl status private-transfer-assistant --no-pager
systemctl status private-transfer-assistant-ocr --no-pager

# 最近日志
journalctl -u private-transfer-assistant -n 100 --no-pager
journalctl -u private-transfer-assistant-ocr -n 100 --no-pager

# 重启服务
systemctl restart private-transfer-assistant
systemctl restart private-transfer-assistant-ocr

# 本机健康检查
curl -i http://127.0.0.1:3000/api/auth/status

# 实际资源占用
systemctl show private-transfer-assistant -p MemoryCurrent -p MemoryPeak
systemctl show private-transfer-assistant-ocr -p MemoryCurrent -p MemoryPeak
```

应用异常但本机健康检查正常时，应检查宝塔反向代理、Nginx 配置和 SSL；完整排障命令见 [宝塔 LNMP 部署指南](./DEPLOYMENT-BAOTA-LNMP.md#14-故障排查)。

## 安全说明

- 必须通过 HTTPS 使用。应用只监听 `127.0.0.1:3000`，阿里云安全组和防火墙不得向公网开放 3000。
- 临时凭证不写入 Cookie、`localStorage` 或 `sessionStorage`；长期设备使用签名的 HttpOnly、Secure、SameSite=Strict Cookie，可在设置页逐台撤销。使用 Cookie 的写请求还会校验浏览器的 `Origin` 与 `Sec-Fetch-Site`，阻断跨站请求伪造。
- 仅允许宝塔 Nginx 反向代理应用端口，并使用安装脚本生成的安全配置片段；其中同源预览必须保留 `X-Frame-Options: SAMEORIGIN` 与 `frame-ancestors 'self'`，不要改为 `DENY`/`'none'`。不要缓存 API、临时分享、外部投递或带能力令牌的请求。
- 设置、设备管理、OCR 全局开关和投递链接只允许长期设备操作。修改口令与注销全部设备需要再次验证管理口令。
- 隐私锁由服务端在消息列表、搜索、文件下载和实时推送各层过滤。锁定前已经下载、复制或截屏的内容无法追回。
- OCR 必须读取原始图片，因此本项目不是服务器不可见的端到端加密方案。数据库、上传文件与备份都应视为敏感数据；推荐启用宿主机磁盘加密，并对异地备份额外加密。
- 程序与数据均位于宝塔网站根目录之外，systemd 服务使用无登录权限的 `transfer` 用户运行，不与 Nginx 或 PHP 共享写权限。
- 临时分享与外部投递属于公网入口，应设置短有效期、次数和大小限制，并定期在设置页撤销不再使用的链接。
- `/etc/private-transfer-assistant.env` 必须保持 `root:transfer`、`0640` 权限；`COOKIE_SECRET`、生产配置、备份、SSL 证书和服务器 SSH 密钥均不得提交到版本库或发送给他人。

## 数据位置

| 内容 | 服务器路径 |
| --- | --- |
| 当前版本 | `/opt/private-transfer-assistant/current` |
| 当前版本与最近两个旧版本 | `/opt/private-transfer-assistant/releases` |
| Node.js 与 Python | `/opt/private-transfer-assistant/bin`、`/opt/private-transfer-python-3.11.16` |
| Nginx 配置片段 | `/opt/private-transfer-assistant/nginx` |
| SQLite 数据库 | `/var/lib/private-transfer-assistant/transfer.db` |
| 上传文件 | `/var/lib/private-transfer-assistant/files` |
| 临时文件 | `/var/lib/private-transfer-assistant/tmp` |
| 自动备份 | `/var/backups/private-transfer-assistant` |
| 生产配置与密钥 | `/etc/private-transfer-assistant.env` |

不要把网站根目录当作数据目录，也不要只恢复数据库而遗漏同一次备份中的 `files/`。安装脚本升级时会保留生产配置、数据库和上传文件，并通过 `current` 软链接切换 release。
