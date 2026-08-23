#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'
umask 022

readonly APP_NAME="private-transfer-assistant"
readonly SERVICE_NAME="private-transfer-assistant"
readonly OCR_SERVICE_NAME="private-transfer-assistant-ocr"
readonly INSTALL_ROOT="/opt/private-transfer-assistant"
readonly RELEASES_DIR="${INSTALL_ROOT}/releases"
readonly CURRENT_LINK="${INSTALL_ROOT}/current"
readonly BIN_DIR="${INSTALL_ROOT}/bin"
readonly NODE_LINK="${BIN_DIR}/node"
readonly DATA_DIR="/var/lib/private-transfer-assistant"
readonly BACKUP_DIR="/var/backups/private-transfer-assistant"
readonly ENV_FILE="/etc/private-transfer-assistant.env"
readonly APP_UNIT="/etc/systemd/system/${SERVICE_NAME}.service"
readonly OCR_UNIT="/etc/systemd/system/${OCR_SERVICE_NAME}.service"
readonly LEGACY_PYTHON_VERSION="3.11.16"
readonly LEGACY_PYTHON_SHA256="91bcdebfdde239a003ae93738a7fce0f9230fee5c4bc2b86f6e6e8c6f98aabe8"
readonly LEGACY_PYTHON_ROOT="/opt/private-transfer-python-${LEGACY_PYTHON_VERSION}"
readonly CENTOS8_VAULT_REPO="/etc/yum.repos.d/private-transfer-centos8-vault.repo"

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
SOURCE_DIR="${TRANSFER_SOURCE_DIR:-$(cd -- "${SCRIPT_DIR}/.." && pwd -P)}"
TEMP_DIR=""
VENV_DIR=""
OS_ID=""
OS_VERSION_ID=""
OS_PRETTY_NAME="未知系统"
LEGACY_CENTOS8=false
CENTOS8_VAULT_BASE=""

log() { printf '\n\033[1;32m[%s]\033[0m %s\n' "${APP_NAME}" "$*"; }
warn() { printf '\n\033[1;33m[%s] 警告：\033[0m%s\n' "${APP_NAME}" "$*" >&2; }
die() { printf '\n\033[1;31m[%s] 错误：\033[0m%s\n' "${APP_NAME}" "$*" >&2; exit 1; }

cleanup() {
  if [[ -n "${TEMP_DIR}" && -d "${TEMP_DIR}" && "${TEMP_DIR}" == /tmp/private-transfer-install-* ]]; then
    rm -rf -- "${TEMP_DIR}"
  fi
}

trap cleanup EXIT
trap 'status=$?; printf "\n安装在第 %s 行失败（退出码 %s）。\n" "$LINENO" "$status" >&2; exit "$status"' ERR

[[ "${EUID}" -eq 0 ]] || die "请使用 root 运行：sudo bash scripts/install-baota-native.sh"
[[ -f "${SOURCE_DIR}/package.json" && -f "${SOURCE_DIR}/package-lock.json" ]] || die "未找到项目根目录；请从项目目录运行脚本"
[[ -f "${SOURCE_DIR}/ocr/requirements.txt" && -f "${SOURCE_DIR}/ocr/worker.py" ]] || die "OCR 文件不完整"
[[ -d /run/systemd/system ]] || die "系统未使用 systemd，无法安装守护服务"

TEMP_DIR="$(mktemp -d /tmp/private-transfer-install-XXXXXXXX)"

detect_os() {
  if [[ -r /etc/os-release ]]; then
    # shellcheck disable=SC1091
    . /etc/os-release
    OS_ID="${ID:-}"
    OS_VERSION_ID="${VERSION_ID:-}"
    OS_PRETTY_NAME="${PRETTY_NAME:-${NAME:-未知系统}}"
  fi

  if [[ "${OS_ID}" == "centos" && "${OS_VERSION_ID%%.*}" == "8" ]]; then
    LEGACY_CENTOS8=true
    warn "检测到 ${OS_PRETTY_NAME}：将启用阿里云 CentOS 8.5.2111 归档源和独立 Python。该归档不包含 2021-12-31 之后的系统安全更新。"
  fi
}

centos8_dnf() {
  dnf -y \
    --disablerepo='*' \
    --enablerepo='private-transfer-vault-*' \
    --setopt=install_weak_deps=False \
    "$@"
}

configure_centos8_vault() {
  [[ "${LEGACY_CENTOS8}" == true ]] || return
  command -v curl >/dev/null 2>&1 || die "CentOS 8 归档源初始化需要 curl"
  command -v dnf >/dev/null 2>&1 || die "CentOS 8 系统缺少 dnf"
  [[ -f /etc/pki/rpm-gpg/RPM-GPG-KEY-centosofficial ]] || die "缺少 CentOS 官方 RPM 签名密钥：/etc/pki/rpm-gpg/RPM-GPG-KEY-centosofficial"

  local arch backup_dir repo_file candidate
  arch="$(uname -m)"
  case "${arch}" in
    x86_64|aarch64) ;;
    *) die "CentOS 8 归档源不支持当前架构：${arch}" ;;
  esac

  for candidate in \
    "http://mirrors.cloud.aliyuncs.com/centos-vault/8.5.2111" \
    "http://mirrors.aliyuncs.com/centos-vault/8.5.2111" \
    "https://mirrors.aliyun.com/centos-vault/8.5.2111" \
    "https://vault.centos.org/8.5.2111"; do
    if curl --fail --silent --location --connect-timeout 5 --max-time 20 \
      "${candidate}/BaseOS/${arch}/os/repodata/repomd.xml" -o /dev/null; then
      CENTOS8_VAULT_BASE="${candidate}"
      break
    fi
  done
  [[ -n "${CENTOS8_VAULT_BASE}" ]] || die "阿里云内网、公网及 CentOS 官方 Vault 均不可用"
  log "使用 CentOS Vault：${CENTOS8_VAULT_BASE}"

  backup_dir="/etc/yum.repos.d/private-transfer-centos8-backup-$(date -u +%Y%m%dT%H%M%SZ)"
  install -d -o root -g root -m 0700 "${backup_dir}"
  shopt -s nullglob
  for repo_file in /etc/yum.repos.d/CentOS*.repo /etc/yum.repos.d/centos*.repo; do
    [[ "${repo_file}" == "${CENTOS8_VAULT_REPO}" ]] && continue
    mv -- "${repo_file}" "${backup_dir}/"
  done
  shopt -u nullglob

  cat >"${CENTOS8_VAULT_REPO}" <<EOF
[private-transfer-vault-baseos]
name=CentOS 8.5.2111 Vault - BaseOS - Aliyun
baseurl=${CENTOS8_VAULT_BASE}/BaseOS/\$basearch/os/
enabled=1
gpgcheck=1
repo_gpgcheck=0
gpgkey=file:///etc/pki/rpm-gpg/RPM-GPG-KEY-centosofficial

[private-transfer-vault-appstream]
name=CentOS 8.5.2111 Vault - AppStream - Aliyun
baseurl=${CENTOS8_VAULT_BASE}/AppStream/\$basearch/os/
enabled=1
gpgcheck=1
repo_gpgcheck=0
gpgkey=file:///etc/pki/rpm-gpg/RPM-GPG-KEY-centosofficial

[private-transfer-vault-powertools]
name=CentOS 8.5.2111 Vault - PowerTools - Aliyun
baseurl=${CENTOS8_VAULT_BASE}/PowerTools/\$basearch/os/
enabled=1
gpgcheck=1
repo_gpgcheck=0
gpgkey=file:///etc/pki/rpm-gpg/RPM-GPG-KEY-centosofficial

[private-transfer-vault-extras]
name=CentOS 8.5.2111 Vault - Extras - Aliyun
baseurl=${CENTOS8_VAULT_BASE}/extras/\$basearch/os/
enabled=1
gpgcheck=1
repo_gpgcheck=0
gpgkey=file:///etc/pki/rpm-gpg/RPM-GPG-KEY-centosofficial
EOF
  chmod 0644 "${CENTOS8_VAULT_REPO}"

  centos8_dnf clean all
  centos8_dnf makecache
  log "将 CentOS 8.2 软件包更新到最后的 8.5.2111 归档快照"
  centos8_dnf upgrade --refresh
  # centos-linux-repos 升级时可能重新生成已经失效的默认 repo；归档后只保留本脚本验证过的 Vault。
  shopt -s nullglob
  for repo_file in /etc/yum.repos.d/CentOS*.repo /etc/yum.repos.d/centos*.repo; do
    mv -- "${repo_file}" "${backup_dir}/post-upgrade-$(basename -- "${repo_file}")"
  done
  shopt -u nullglob
}

install_system_packages() {
  log "安装系统依赖"
  if [[ "${LEGACY_CENTOS8}" == true ]]; then
    centos8_dnf install \
      ca-certificates curl git tar xz gcc gcc-c++ make findutils sqlite openssl iproute \
      glib2 libgomp dejavu-sans-fonts mesa-libGL \
      openssl-devel bzip2-devel libffi-devel zlib-devel xz-devel readline-devel \
      sqlite-devel ncurses-devel gdbm-devel libuuid-devel expat-devel
  elif command -v apt-get >/dev/null 2>&1; then
    export DEBIAN_FRONTEND=noninteractive
    apt-get update
    apt-get install -y --no-install-recommends \
      ca-certificates curl git tar xz-utils build-essential sqlite3 openssl iproute2 \
      python3 python3-venv python3-pip libgl1 libglib2.0-0 libgomp1 fonts-dejavu-core
  elif command -v dnf >/dev/null 2>&1; then
    dnf install -y \
      ca-certificates curl git tar xz gcc gcc-c++ make sqlite openssl iproute \
      python3 python3-pip glib2 libgomp dejavu-sans-fonts
    dnf install -y mesa-libGL >/dev/null 2>&1 || true
    dnf install -y python3.11 python3.11-pip >/dev/null 2>&1 || true
  elif command -v yum >/dev/null 2>&1; then
    yum install -y \
      ca-certificates curl git tar xz gcc gcc-c++ make sqlite openssl iproute \
      python3 python3-pip glib2 libgomp dejavu-sans-fonts
    yum install -y mesa-libGL >/dev/null 2>&1 || true
    yum install -y python3.11 python3.11-pip >/dev/null 2>&1 || true
  else
    die "仅自动支持 apt、dnf 或 yum；请先手动安装 Node 构建工具、Python venv、SQLite、curl、tar 和 xz"
  fi
}

install_legacy_python() {
  [[ "${LEGACY_CENTOS8}" == true ]] || return
  local python_bin="${LEGACY_PYTHON_ROOT}/bin/python3.11"
  local archive="Python-${LEGACY_PYTHON_VERSION}.tar.xz"
  local source_dir="${TEMP_DIR}/Python-${LEGACY_PYTHON_VERSION}"
  local jobs=1

  if [[ -x "${python_bin}" ]] && "${python_bin}" -c \
    'import ssl, sqlite3, sys, venv; raise SystemExit(0 if sys.version_info[:3] == (3, 11, 16) else 1)' 2>/dev/null; then
    log "复用已安装的独立 Python ${LEGACY_PYTHON_VERSION}"
    return
  fi

  log "下载、校验并编译独立 Python ${LEGACY_PYTHON_VERSION}（不会替换系统 Python）"
  curl --fail --silent --show-error --location \
    "https://www.python.org/ftp/python/${LEGACY_PYTHON_VERSION}/${archive}" \
    -o "${TEMP_DIR}/${archive}"
  printf '%s  %s\n' "${LEGACY_PYTHON_SHA256}" "${TEMP_DIR}/${archive}" \
    | sha256sum --check --status || die "Python 源码包 SHA-256 校验失败"
  tar -xJf "${TEMP_DIR}/${archive}" -C "${TEMP_DIR}"
  [[ -d "${source_dir}" ]] || die "Python 源码解压失败"
  if [[ "$(nproc)" -ge 2 ]]; then jobs=2; fi
  (
    cd "${source_dir}"
    ./configure \
      --prefix="${LEGACY_PYTHON_ROOT}" \
      --with-ensurepip=install
    make -j "${jobs}"
    make altinstall
  )
  "${python_bin}" -c \
    'import bz2, ctypes, lzma, ssl, sqlite3, sys, venv; print(sys.version); print(ssl.OPENSSL_VERSION)'
  [[ "$("${python_bin}" -c 'import sys; print(".".join(map(str, sys.version_info[:3])))')" == "${LEGACY_PYTHON_VERSION}" ]] \
    || die "独立 Python 版本验证失败"
}

select_python() {
  local candidate resolved
  # 优先选择项目容器基线 Python 3.12，其次使用成熟且有预编译轮子的 3.11/3.10。
  for candidate in "${LEGACY_PYTHON_ROOT}/bin/python3.11" python3.12 python3.11 python3.10 python3.13 python3; do
    resolved=""
    if [[ "${candidate}" == /* && -x "${candidate}" ]]; then
      resolved="${candidate}"
    elif command -v "${candidate}" >/dev/null 2>&1; then
      resolved="$(command -v "${candidate}")"
    fi
    if [[ -n "${resolved}" ]] && "${resolved}" -c 'import ssl, sqlite3, sys, venv; raise SystemExit(0 if (3,10) <= sys.version_info[:2] < (3,14) else 1)' 2>/dev/null; then
      PYTHON_BIN="${resolved}"
      export PYTHON_BIN
      log "使用 OCR Python：$(${PYTHON_BIN} --version 2>&1)"
      return
    fi
  done
  die "OCR 需要 Python 3.10–3.13；当前系统未找到兼容版本。推荐使用 Debian 12、Ubuntu 22.04/24.04 或 Rocky Linux 9"
}

ensure_python_venv() {
  if ! "${PYTHON_BIN}" -m venv "${TEMP_DIR}/venv-check" >/dev/null 2>&1; then
    if [[ "${LEGACY_CENTOS8}" == true ]]; then
      die "独立 Python venv 自检失败"
    elif command -v dnf >/dev/null 2>&1; then
      dnf install -y python3.11 python3.11-pip || true
    elif command -v yum >/dev/null 2>&1; then
      yum install -y python3.11 python3.11-pip || true
    fi
    select_python
    "${PYTHON_BIN}" -m venv "${TEMP_DIR}/venv-check" >/dev/null 2>&1 || die "Python venv 不可用，请安装对应版本的 venv/ensurepip 组件"
  fi
  rm -rf -- "${TEMP_DIR}/venv-check"
}

ensure_node_22() {
  local existing="" major="" arch="" sums="" tarball="" checksum="" node_dir=""
  if command -v node >/dev/null 2>&1; then
    existing="$(readlink -f "$(command -v node)")"
    major="$("${existing}" -p 'process.versions.node.split(".")[0]' 2>/dev/null || true)"
  fi

  if [[ "${major}" == "22" ]]; then
    NODE_BIN="${existing}"
    NODE_BIN_DIR="$(dirname -- "${NODE_BIN}")"
    export NODE_BIN NODE_BIN_DIR
    log "使用已有 Node.js：$(${NODE_BIN} --version)"
    return
  fi

  case "$(uname -m)" in
    x86_64|amd64) arch="x64" ;;
    aarch64|arm64) arch="arm64" ;;
    *) die "Node.js 自动安装暂不支持架构：$(uname -m)" ;;
  esac

  log "下载并校验 Node.js 22 官方二进制包"
  sums="${TEMP_DIR}/SHASUMS256.txt"
  curl --fail --silent --show-error --location \
    https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt -o "${sums}"
  tarball="$(awk -v suffix="linux-${arch}.tar.xz" '$2 ~ suffix "$" {print $2; exit}' "${sums}")"
  checksum="$(awk -v file="${tarball}" '$2 == file {print $1; exit}' "${sums}")"
  [[ -n "${tarball}" && -n "${checksum}" ]] || die "无法从 Node.js 校验文件确定安装包"
  curl --fail --silent --show-error --location \
    "https://nodejs.org/dist/latest-v22.x/${tarball}" -o "${TEMP_DIR}/${tarball}"
  printf '%s  %s\n' "${checksum}" "${TEMP_DIR}/${tarball}" | sha256sum --check --status || die "Node.js 安装包校验失败"

  node_dir="/opt/${tarball%.tar.xz}"
  if [[ ! -x "${node_dir}/bin/node" ]]; then
    tar -xJf "${TEMP_DIR}/${tarball}" -C /opt
  fi
  NODE_BIN="${node_dir}/bin/node"
  NODE_BIN_DIR="${node_dir}/bin"
  export NODE_BIN NODE_BIN_DIR
  [[ "$("${NODE_BIN}" -p 'process.versions.node.split(".")[0]')" == "22" ]] || die "Node.js 22 安装验证失败"
}

validate_domain() {
  local value="$1" label
  [[ "${value}" =~ ^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$ ]] || die "域名格式无效：${value}"
  [[ "${value}" == *.* ]] || die "请输入完整域名，例如 transfer.example.com"
  [[ "${value}" != *..* && "${value}" != *://* && "${value}" != */* ]] || die "域名不能包含协议、路径或连续点"
  while IFS= read -r label; do
    [[ "${label}" =~ ^[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?$ ]] || die "域名标签无效：${label}"
  done < <(printf '%s' "${value}" | tr '.' '\n')
}

escape_systemd_value() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

read_secret_twice() {
  local prompt="$1" first="" second=""
  [[ -t 0 ]] || die "非交互安装请设置 TRANSFER_MAIN_PASSWORD 和 TRANSFER_ADMIN_PASSWORD"
  read -r -s -p "${prompt}: " first; printf '\n'
  read -r -s -p "再次输入${prompt}: " second; printf '\n'
  [[ "${first}" == "${second}" ]] || die "两次输入不一致"
  [[ "${#first}" -ge 8 ]] || die "${prompt}至少需要 8 个字符"
  REPLY="${first}"
}

read_env_value() {
  local key="$1"
  sed -n "s/^${key}=//p" "${ENV_FILE}" | tail -n 1 | sed 's/^"//; s/"$//'
}

create_runtime_config() {
  local domain="${TRANSFER_DOMAIN:-}" port="${TRANSFER_PORT:-3000}"
  local main_password="${TRANSFER_MAIN_PASSWORD:-}" admin_password="${TRANSFER_ADMIN_PASSWORD:-}"
  local cookie_secret="" temp_env="${TEMP_DIR}/runtime.env"

  if [[ -f "${ENV_FILE}" ]]; then
    log "保留现有生产配置：${ENV_FILE}"
    chown root:transfer "${ENV_FILE}"
    chmod 0640 "${ENV_FILE}"
    APP_PORT="$(read_env_value PORT)"
    PUBLIC_ORIGIN="$(read_env_value PUBLIC_ORIGIN)"
    DOMAIN="${PUBLIC_ORIGIN#https://}"
    export APP_PORT PUBLIC_ORIGIN DOMAIN
    [[ "${APP_PORT}" =~ ^[0-9]+$ ]] || die "现有配置中的 PORT 无效"
    validate_domain "${DOMAIN}"
    return
  fi

  if [[ -z "${domain}" ]]; then
    [[ -t 0 ]] || die "非交互安装请设置 TRANSFER_DOMAIN"
    read -r -p '请输入渡口域名（不带 https://）: ' domain
  fi
  validate_domain "${domain}"
  [[ "${port}" =~ ^[0-9]+$ && "${port}" -ge 1024 && "${port}" -le 65535 ]] || die "端口必须是 1024–65535 的数字"
  if ss -lntH "sport = :${port}" 2>/dev/null | grep -q .; then
    die "127.0.0.1:${port} 已被占用，请设置其他 TRANSFER_PORT"
  fi

  if [[ -z "${main_password}" ]]; then
    read_secret_twice '主口令'
    main_password="${REPLY}"
  fi
  if [[ -z "${admin_password}" ]]; then
    read_secret_twice '管理口令'
    admin_password="${REPLY}"
  fi
  [[ "${#main_password}" -ge 8 && "${#admin_password}" -ge 8 ]] || die "两个口令都至少需要 8 个字符"
  [[ "${main_password}" != "${admin_password}" ]] || die "主口令和管理口令不能相同"
  [[ "${main_password}" != *$'\n'* && "${main_password}" != *$'\r'* && "${admin_password}" != *$'\n'* && "${admin_password}" != *$'\r'* ]] || die "口令不能包含换行符"
  cookie_secret="$(openssl rand -base64 48)"

  cat >"${temp_env}" <<EOF
NODE_ENV=production
HOST=127.0.0.1
PORT=${port}
DATA_DIR=${DATA_DIR}
DB_PATH=${DATA_DIR}/transfer.db
FILES_DIR=${DATA_DIR}/files
UPLOAD_DIR=${DATA_DIR}/files
TEMP_DIR=${DATA_DIR}/tmp
PUBLIC_ORIGIN=https://${domain}
TRUST_PROXY=true
COOKIE_SECRET="$(escape_systemd_value "${cookie_secret}")"
MAIN_PASSWORD="$(escape_systemd_value "${main_password}")"
ADMIN_PASSWORD="$(escape_systemd_value "${admin_password}")"
MAX_FILE_SIZE=10737418240
TEMP_SESSION_HOURS=12
DEVICE_DAYS=90
OCR_ENABLED=true
OCR_POLL_SECONDS=3
OCR_MAX_EDGE=2200
OCR_DET_LIMIT_SIDE=1280
OCR_MAX_IMAGE_PIXELS=40000000
OCR_MIN_SCORE=0.45
OCR_MAX_ATTEMPTS=3
OCR_STALE_AFTER_SECONDS=900
OCR_RELEASE_MODEL_AFTER_SECONDS=300
OCR_CPU_THREADS=1
OMP_NUM_THREADS=1
OPENBLAS_NUM_THREADS=1
MKL_NUM_THREADS=1
NUMEXPR_NUM_THREADS=1
EOF
  install -o root -g transfer -m 0640 "${temp_env}" "${ENV_FILE}"
  unset TRANSFER_MAIN_PASSWORD TRANSFER_ADMIN_PASSWORD main_password admin_password cookie_secret
  APP_PORT="${port}"
  DOMAIN="${domain}"
  PUBLIC_ORIGIN="https://${domain}"
  export APP_PORT DOMAIN PUBLIC_ORIGIN
}

prepare_user_and_directories() {
  log "创建低权限用户与持久化目录"
  if ! getent group transfer >/dev/null; then
    groupadd --system transfer
  fi
  if ! id transfer >/dev/null 2>&1; then
    useradd --system --gid transfer --home-dir "${DATA_DIR}" --shell /usr/sbin/nologin transfer
  fi
  install -d -o root -g transfer -m 0750 "${INSTALL_ROOT}" "${RELEASES_DIR}" "${BIN_DIR}"
  install -d -o transfer -g transfer -m 0750 "${DATA_DIR}" "${DATA_DIR}/files" "${DATA_DIR}/tmp"
  install -d -o transfer -g transfer -m 0750 "${BACKUP_DIR}"
  ln -sfnT "${NODE_BIN}" "${NODE_LINK}"
  chown -h root:transfer "${NODE_LINK}"
  runuser -u transfer -- "${NODE_LINK}" --version >/dev/null
}

copy_and_build_release() {
  local release_id git_id
  git_id="$(git -C "${SOURCE_DIR}" rev-parse --short HEAD 2>/dev/null || printf 'source')"
  release_id="$(date -u +%Y%m%dT%H%M%SZ)-${git_id}-$$"
  RELEASE_DIR="${RELEASES_DIR}/${release_id}"
  VENV_DIR="${RELEASE_DIR}/.venv"
  export RELEASE_DIR VENV_DIR
  install -d -o root -g transfer -m 0750 "${RELEASE_DIR}"

  log "复制并构建发布版本：${release_id}"
  tar \
    --exclude='./.git' \
    --exclude='./.env' \
    --exclude='./node_modules' \
    --exclude='./apps/web/dist' \
    --exclude='./apps/server/dist' \
    --exclude='./backups' \
    --exclude='./restore' \
    --exclude='./data' \
    --exclude='./data-dev' \
    -C "${SOURCE_DIR}" -cf - . | tar -C "${RELEASE_DIR}" -xf -

  export PATH="${NODE_BIN_DIR}:${PATH}"
  export PYTHON="${PYTHON_BIN}"
  export npm_config_python="${PYTHON_BIN}"
  local npm_bin="${NODE_BIN_DIR}/npm"
  [[ -x "${npm_bin}" ]] || die "Node.js 安装中缺少 npm：${npm_bin}"
  (
    cd "${RELEASE_DIR}"
    "${npm_bin}" ci --no-audit --no-fund
    "${npm_bin}" run typecheck
    "${npm_bin}" test
    "${npm_bin}" run build
    "${npm_bin}" prune --omit=dev --no-audit --no-fund
  )
  [[ -f "${RELEASE_DIR}/apps/server/dist/index.js" ]] || die "后端构建产物缺失"
  [[ -f "${RELEASE_DIR}/apps/web/dist/index.html" ]] || die "前端构建产物缺失"
  chown -R root:transfer "${RELEASE_DIR}"
  chmod -R go-w,o-rwx,g+rX "${RELEASE_DIR}"
}

install_and_test_ocr() {
  log "安装 OCR 依赖并执行真实 ONNX 推理测试"
  if [[ ! -x "${VENV_DIR}/bin/python" ]]; then
    "${PYTHON_BIN}" -m venv "${VENV_DIR}"
  fi
  "${VENV_DIR}/bin/python" -m pip install --upgrade pip setuptools wheel
  "${VENV_DIR}/bin/pip" install -r "${RELEASE_DIR}/ocr/requirements.txt"
  chown -R root:transfer "${VENV_DIR}"
  chmod -R go-w,o-rwx,g+rX "${VENV_DIR}"

  runuser -u transfer -- env \
    HOME="${DATA_DIR}" \
    OCR_CPU_THREADS=1 OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 MKL_NUM_THREADS=1 NUMEXPR_NUM_THREADS=1 \
    timeout 300s "${VENV_DIR}/bin/rapidocr" check

  (
    cd "${RELEASE_DIR}"
    runuser -u transfer -- env \
      HOME="${DATA_DIR}" \
      OCR_CPU_THREADS=1 OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 MKL_NUM_THREADS=1 NUMEXPR_NUM_THREADS=1 \
      timeout 300s "${VENV_DIR}/bin/python" - <<'PY'
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from rapidocr import RapidOCR

image = Image.new("RGB", (900, 220), "white")
draw = ImageDraw.Draw(image)
font = ImageFont.load_default(size=64)
draw.text((35, 65), "OCR TEST 123456", fill="black", font=font)
engine = RapidOCR(params={
    "EngineConfig.onnxruntime.intra_op_num_threads": 1,
    "EngineConfig.onnxruntime.inter_op_num_threads": 1,
    "EngineConfig.onnxruntime.enable_cpu_mem_arena": False,
    "Global.log_level": "warning",
    "Det.limit_side_len": 1280,
    "Det.limit_type": "max",
})
result = engine(np.asarray(image))
texts = [str(value).strip() for value in (getattr(result, "txts", ()) or ()) if str(value).strip()]
if not texts:
    raise SystemExit("OCR inference returned no text")
print("OCR inference OK:", " | ".join(texts))
PY
  )
}

write_systemd_units() {
  log "安装 systemd 服务与资源限制"
  cat >"${TEMP_DIR}/${SERVICE_NAME}.service" <<EOF
[Unit]
Description=Private Transfer Assistant
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=transfer
Group=transfer
WorkingDirectory=${CURRENT_LINK}
EnvironmentFile=${ENV_FILE}
Environment=HOME=${DATA_DIR}
ExecStart=${NODE_LINK} apps/server/dist/index.js
Restart=on-failure
RestartSec=5s
TimeoutStopSec=30s
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictSUIDSGID=true
LockPersonality=true
CapabilityBoundingSet=
ReadWritePaths=${DATA_DIR}
MemoryHigh=384M
MemoryMax=512M
CPUQuota=125%
TasksMax=128
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
EOF

  cat >"${TEMP_DIR}/${OCR_SERVICE_NAME}.service" <<EOF
[Unit]
Description=Private Transfer Assistant OCR Worker
After=${SERVICE_NAME}.service
Wants=${SERVICE_NAME}.service

[Service]
Type=simple
User=transfer
Group=transfer
WorkingDirectory=${CURRENT_LINK}
EnvironmentFile=${ENV_FILE}
Environment=HOME=${DATA_DIR}
ExecStart=${CURRENT_LINK}/.venv/bin/python ocr/worker.py
Restart=on-failure
RestartSec=5s
TimeoutStopSec=30s
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictSUIDSGID=true
LockPersonality=true
CapabilityBoundingSet=
ReadWritePaths=${DATA_DIR}
MemoryHigh=640M
MemoryMax=896M
CPUQuota=100%
TasksMax=64

[Install]
WantedBy=multi-user.target
EOF

  install -o root -g root -m 0644 "${TEMP_DIR}/${SERVICE_NAME}.service" "${APP_UNIT}"
  install -o root -g root -m 0644 "${TEMP_DIR}/${OCR_SERVICE_NAME}.service" "${OCR_UNIT}"
}

activate_release() {
  local previous="" new_link="${INSTALL_ROOT}/.current-new-$$"
  if [[ -e "${CURRENT_LINK}" && ! -L "${CURRENT_LINK}" ]]; then
    die "${CURRENT_LINK} 已存在且不是软链接，请人工检查"
  fi
  previous="$(readlink -f "${CURRENT_LINK}" 2>/dev/null || true)"
  ln -s "${RELEASE_DIR}" "${new_link}"
  mv -Tf "${new_link}" "${CURRENT_LINK}"
  chown -h root:transfer "${CURRENT_LINK}"

  systemctl daemon-reload
  systemctl enable "${SERVICE_NAME}.service" "${OCR_SERVICE_NAME}.service" >/dev/null
  systemctl restart "${SERVICE_NAME}.service"

  local healthy=false attempt
  for attempt in $(seq 1 45); do
    if curl --fail --silent --show-error "http://127.0.0.1:${APP_PORT}/api/auth/status" >/dev/null 2>&1; then
      healthy=true
      break
    fi
    sleep 1
  done
  if [[ "${healthy}" != true ]]; then
    journalctl -u "${SERVICE_NAME}" -n 100 --no-pager >&2 || true
    if [[ -n "${previous}" && "${previous}" == "${RELEASES_DIR}/"* && -d "${previous}" ]]; then
      warn "新版本健康检查失败，恢复上一版本：${previous}"
      ln -s "${previous}" "${new_link}"
      mv -Tf "${new_link}" "${CURRENT_LINK}"
      systemctl restart "${SERVICE_NAME}.service" || true
    fi
    die "应用健康检查失败"
  fi

  systemctl restart "${OCR_SERVICE_NAME}.service"
  sleep 3
  local ocr_pid_before ocr_pid_after
  ocr_pid_before="$(systemctl show "${OCR_SERVICE_NAME}.service" --property MainPID --value)"
  sleep 5
  ocr_pid_after="$(systemctl show "${OCR_SERVICE_NAME}.service" --property MainPID --value)"
  if ! systemctl is-active --quiet "${OCR_SERVICE_NAME}.service" || [[ -z "${ocr_pid_before}" || "${ocr_pid_before}" == "0" || "${ocr_pid_before}" != "${ocr_pid_after}" ]]; then
    journalctl -u "${OCR_SERVICE_NAME}" -n 100 --no-pager >&2 || true
    die "OCR 服务未能稳定运行；推理自检已通过，请根据日志检查数据库或目录权限"
  fi
}

write_nginx_snippets() {
  local nginx_dir="${INSTALL_ROOT}/nginx"
  install -d -o root -g root -m 0755 "${nginx_dir}"
  cat >"${nginx_dir}/location.conf" <<EOF
location / {
    proxy_pass http://127.0.0.1:${APP_PORT};
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$remote_addr;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_request_buffering off;
    proxy_buffering off;
    proxy_read_timeout 24h;
    proxy_send_timeout 24h;
}
EOF
  cat >"${nginx_dir}/server-directives.conf" <<'EOF'
client_max_body_size 10g;
client_body_timeout 24h;
send_timeout 24h;
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "DENY" always;
add_header Referrer-Policy "no-referrer" always;
add_header Permissions-Policy "camera=(self), microphone=(), geolocation=(), payment=(), usb=()" always;
add_header Content-Security-Policy "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' ws: wss:; worker-src 'self' blob:; manifest-src 'self'" always;
EOF
  chmod 0644 "${nginx_dir}"/*.conf
}

main() {
  detect_os
  configure_centos8_vault
  install_system_packages
  install_legacy_python
  select_python
  ensure_python_venv
  ensure_node_22
  prepare_user_and_directories
  create_runtime_config
  copy_and_build_release
  install_and_test_ocr
  write_systemd_units
  activate_release
  write_nginx_snippets

  log "安装完成"
  printf '%s\n' \
    "应用地址（仅本机）：http://127.0.0.1:${APP_PORT}" \
    "公网域名：${PUBLIC_ORIGIN}" \
    "应用状态：systemctl status ${SERVICE_NAME} --no-pager" \
    "OCR 状态：systemctl status ${OCR_SERVICE_NAME} --no-pager" \
    "应用日志：journalctl -u ${SERVICE_NAME} -f" \
    "OCR 日志：journalctl -u ${OCR_SERVICE_NAME} -f" \
    "Nginx 反代片段：${INSTALL_ROOT}/nginx/location.conf" \
    "Nginx 安全片段：${INSTALL_ROOT}/nginx/server-directives.conf"
  printf '\n下一步：在宝塔为 %s 创建纯静态站点、申请 SSL，并把反向代理指向 http://127.0.0.1:%s。\n' "${DOMAIN}" "${APP_PORT}"
  printf '首次登录并设为长期设备后，请删除 %s 中的 MAIN_PASSWORD 和 ADMIN_PASSWORD 两行，再重启应用。\n' "${ENV_FILE}"
  if [[ "${LEGACY_CENTOS8}" == true ]]; then
    printf 'CentOS 已更新到可获得的最后归档快照；确认宝塔和应用正常后，请安排一次服务器重启以加载最新归档内核。\n'
  fi
}

main "$@"
