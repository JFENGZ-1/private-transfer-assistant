#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'
umask 022

readonly REPOSITORY="JFENGZ-1/private-transfer-assistant"
readonly DEFAULT_REF="v1.4.5"

log() { printf '\n\033[1;32m[渡口一键安装]\033[0m %s\n' "$*"; }
die() { printf '\n\033[1;31m[渡口一键安装] 错误：\033[0m%s\n' "$*" >&2; exit 1; }

TEMP_ROOT=""
cleanup() {
  if [[ -n "${TEMP_ROOT}" && -d "${TEMP_ROOT}" && "${TEMP_ROOT}" == /tmp/private-transfer-bootstrap-* ]]; then
    rm -rf -- "${TEMP_ROOT}"
  fi
}
trap cleanup EXIT

[[ "${EUID}" -eq 0 ]] || die "请使用 root 运行，或在命令末尾使用 sudo bash"
command -v curl >/dev/null 2>&1 || die "系统缺少 curl，请先通过系统包管理器安装 curl"
command -v tar >/dev/null 2>&1 || die "系统缺少 tar，请先通过系统包管理器安装 tar"

SOURCE_REF="${TRANSFER_GITHUB_REF:-${DEFAULT_REF}}"
[[ "${SOURCE_REF}" =~ ^[A-Za-z0-9._/-]+$ ]] || die "TRANSFER_GITHUB_REF 格式无效"
[[ "${SOURCE_REF}" != /* && "${SOURCE_REF}" != */ && "${SOURCE_REF}" != *..* ]] || die "TRANSFER_GITHUB_REF 不能包含危险路径"

TEMP_ROOT="$(mktemp -d /tmp/private-transfer-bootstrap-XXXXXXXX)"
SOURCE_ROOT="${TEMP_ROOT}/source"
ARCHIVE="${TEMP_ROOT}/source.tar.gz"
install -d -m 0700 "${SOURCE_ROOT}"

log "下载 ${REPOSITORY}@${SOURCE_REF}"
curl \
  --fail \
  --silent \
  --show-error \
  --location \
  --retry 3 \
  --retry-delay 2 \
  --retry-connrefused \
  --connect-timeout 15 \
  --proto '=https' \
  --tlsv1.2 \
  "https://codeload.github.com/${REPOSITORY}/tar.gz/${SOURCE_REF}" \
  -o "${ARCHIVE}"

tar -tzf "${ARCHIVE}" >/dev/null || die "下载的源码压缩包校验失败"
tar -xzf "${ARCHIVE}" -C "${SOURCE_ROOT}" --strip-components=1
[[ -f "${SOURCE_ROOT}/package.json" && -f "${SOURCE_ROOT}/scripts/install-baota-native.sh" ]] \
  || die "源码包不完整"

log "源码下载完成，进入原生安装程序"
if [[ -t 0 ]]; then
  TRANSFER_SOURCE_DIR="${SOURCE_ROOT}" bash "${SOURCE_ROOT}/scripts/install-baota-native.sh"
elif [[ -r /dev/tty && -w /dev/tty ]]; then
  # curl | bash 会占用标准输入；重新连接当前 SSH 终端以便安全输入隐藏口令。
  TRANSFER_SOURCE_DIR="${SOURCE_ROOT}" bash "${SOURCE_ROOT}/scripts/install-baota-native.sh" </dev/tty
else
  TRANSFER_SOURCE_DIR="${SOURCE_ROOT}" bash "${SOURCE_ROOT}/scripts/install-baota-native.sh"
fi

log "一键安装流程完成"
