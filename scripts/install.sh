#!/bin/sh
# Tunnet installer - download from GitHub Releases, verify, install.
# Usage:
#   curl -fsSL https://github.com/tunnetio/Tunnet/releases/latest/download/install.sh | sh
#
# Environment:
#   TUNNET_REPO          Override repository (default: tunnetio/Tunnet)
#   TUNNET_INSTALL_DIR   Override install path (default: /usr/local/bin)
#   TUNNET_NO_SERVICE    Set to 1 to skip service installation
#   TUNNET_VERIFY        Set to 0 to skip attestation verification
set -eu

main() {

REPO="${TUNNET_REPO:-tunnetio/Tunnet}"
INSTALL_DIR="${TUNNET_INSTALL_DIR:-/usr/local/bin}"
SERVICE_NAME="tunnet"
VERSION=""
INSTALL_SERVICE="${TUNNET_NO_SERVICE:+0}"
INSTALL_SERVICE="${INSTALL_SERVICE:-1}"
VERIFY="${TUNNET_VERIFY:-1}"
BINS="tunnet tunnet-control tunnet-relay"
GITHUB_API="${GITHUB_API:-https://api.github.com}"
GITHUB_DOWNLOAD="${GITHUB_DOWNLOAD:-https://github.com}"

RED=""
GREEN=""
YELLOW=""
BOLD=""
RESET=""

if [ -t 1 ]; then
  RED='\033[0;31m'
  GREEN='\033[0;32m'
  YELLOW='\033[0;33m'
  BOLD='\033[1m'
  RESET='\033[0m'
fi

info()  { printf "${GREEN}=>${RESET} %s\n" "$*"; }
warn()  { printf "${YELLOW}warning:${RESET} %s\n" "$*" >&2; }
die()   { printf "${RED}error:${RESET} %s\n" "$*" >&2; exit 1; }

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "required command not found: $1"
}

usage() {
  cat <<EOF
Tunnet installer

Usage: install.sh [options]

Options:
  --version <tag>   Install a specific release (e.g. v1.0.0 or 1.0.0). Default: latest
  --install-dir <d> Binary install directory (default: ${INSTALL_DIR})
  --no-service      Skip systemd / launchd service unit
  --no-verify       Skip attestation verification
  --bins <list>     Space-separated binaries to install (default: all three)
  -h, --help        Show this help

Environment:
  TUNNET_REPO         Repository to download from (default: tunnetio/Tunnet)
  TUNNET_INSTALL_DIR  Override install directory
  TUNNET_NO_SERVICE   Set to 1 to skip service installation
  TUNNET_VERIFY       Set to 0 to skip attestation verification
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --version)
      [ $# -ge 2 ] || die "--version requires a value"
      VERSION="$2"
      shift 2
      ;;
    --install-dir)
      [ $# -ge 2 ] || die "--install-dir requires a value"
      INSTALL_DIR="$2"
      shift 2
      ;;
    --no-service)
      INSTALL_SERVICE=0
      shift
      ;;
    --no-verify)
      VERIFY=0
      shift
      ;;
    --bins)
      [ $# -ge 2 ] || die "--bins requires a value"
      BINS="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      die "unknown option: $1 (try --help)"
      ;;
  esac
done

need_cmd uname
need_cmd tar
need_cmd mktemp

FETCH=""
FETCH_TO_FILE=""
if command -v curl >/dev/null 2>&1; then
  FETCH="curl -fsSL"
  FETCH_TO_FILE="curl -fsSL -o"
elif command -v wget >/dev/null 2>&1; then
  FETCH="wget -qO-"
  FETCH_TO_FILE="wget -qO"
else
  die "curl or wget is required"
fi

OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"

case "$OS" in
  linux)  ;;
  darwin) ;;
  *)      die "unsupported OS: $OS (use install.ps1 on Windows)" ;;
esac

case "$ARCH" in
  x86_64|amd64)  ARCH="x86_64" ;;
  aarch64|arm64)  ARCH="aarch64" ;;
  *)              die "unsupported architecture: $ARCH" ;;
esac

if [ "$OS" = "linux" ]; then
  LIBC="gnu"
  if [ -f /etc/alpine-release ]; then
    LIBC="musl"
  elif command -v ldd >/dev/null 2>&1; then
    case "$(ldd --version 2>&1 || true)" in
      *musl*) LIBC="musl" ;;
    esac
  fi
  TARGET="${ARCH}-unknown-linux-${LIBC}"
else
  TARGET="${ARCH}-apple-darwin"
fi

SUDO=""
if [ "$(id -u)" -ne 0 ]; then
  if command -v sudo >/dev/null 2>&1; then
    SUDO="sudo"
  elif command -v doas >/dev/null 2>&1; then
    SUDO="doas"
  else
    die "root required to install into ${INSTALL_DIR} (re-run as root or set --install-dir to a writable path)"
  fi
fi

resolve_latest_tag() {
  $FETCH "${GITHUB_API}/repos/${REPO}/releases/latest" \
    | sed -n 's/.*"tag_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' \
    | head -n 1
}

if [ -z "$VERSION" ]; then
  info "Resolving latest release…"
  VERSION="$(resolve_latest_tag)" || die "could not reach GitHub API"
  [ -n "$VERSION" ] || die "could not resolve latest release tag"
fi

case "$VERSION" in
  v*) TAG="$VERSION"; VERSION="${VERSION#v}" ;;
  *)  TAG="v${VERSION}" ;;
esac

if command -v tunnet >/dev/null 2>&1; then
  INSTALLED="$(tunnet --version 2>/dev/null | sed -n 's/.*[[:space:]]\([0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*\).*/\1/p' | head -1)"
  if [ "$INSTALLED" = "$VERSION" ]; then
    info "Tunnet v${VERSION} is already installed"
    exit 0
  fi
  if [ -n "$INSTALLED" ]; then
    info "Upgrading Tunnet v${INSTALLED} -> v${VERSION}"
  fi
fi

ARCHIVE="tunnet-${VERSION}-${TARGET}.tar.gz"
URL="${GITHUB_DOWNLOAD}/${REPO}/releases/download/${TAG}/${ARCHIVE}"
CHECKSUM_URL="${URL}.sha256"

info "Installing Tunnet ${TAG} (${TARGET})"

TMP="$(mktemp -d)"
# shellcheck disable=SC2064
trap 'rm -rf "$TMP"' EXIT

info "Downloading ${ARCHIVE}…"
$FETCH_TO_FILE "${TMP}/${ARCHIVE}" "$URL" || die "download failed: ${URL}"

if $FETCH_TO_FILE "${TMP}/${ARCHIVE}.sha256" "$CHECKSUM_URL" 2>/dev/null; then
  HASH="$(awk '{print $1}' "${TMP}/${ARCHIVE}.sha256" | head -n 1)"
  [ -n "$HASH" ] || die "empty checksum file"
  printf '%s  %s\n' "$HASH" "$ARCHIVE" > "${TMP}/SHA256SUMS"
  cd "$TMP"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum -c SHA256SUMS >/dev/null 2>&1 || die "checksum verification failed"
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 -c SHA256SUMS >/dev/null 2>&1 || die "checksum verification failed"
  else
    warn "no sha256 tool found; skipping checksum verification"
  fi
  info "Checksum verified"
else
  warn "checksum file not available; skipping verification"
fi

if [ "$VERIFY" = "1" ] && command -v gh >/dev/null 2>&1; then
  info "Verifying build provenance…"
  cd "$TMP"
  if gh attestation verify "$ARCHIVE" --repo "$REPO" >/dev/null 2>&1; then
    info "Attestation verified"
  else
    warn "attestation verification failed (the binary is still checksum-verified)"
  fi
fi

cd "$TMP"
tar xzf "$ARCHIVE"
EXTRACTED="tunnet-${VERSION}-${TARGET}"
[ -d "$EXTRACTED" ] || die "unexpected archive layout (missing ${EXTRACTED}/)"

$SUDO mkdir -p "$INSTALL_DIR"

INSTALLED_COUNT=0
for bin in $BINS; do
  src="${EXTRACTED}/${bin}"
  if [ ! -f "$src" ]; then
    warn "skipping missing binary: ${bin}"
    continue
  fi
  $SUDO install -m 755 "$src" "${INSTALL_DIR}/${bin}"
  info "Installed ${bin} -> ${INSTALL_DIR}/${bin}"
  INSTALLED_COUNT=$((INSTALLED_COUNT + 1))
done

[ "$INSTALLED_COUNT" -gt 0 ] || die "no binaries were installed"

if [ "$INSTALL_SERVICE" -eq 1 ] && [ -x "${INSTALL_DIR}/tunnet" ]; then
  if [ "$OS" = "linux" ] && command -v systemctl >/dev/null 2>&1 && [ -d /run/systemd/system ]; then
    if $SUDO "${INSTALL_DIR}/tunnet" service install 2>/dev/null; then
      info "systemd service installed"
    else
      warn "could not install systemd service (run: sudo tunnet service install)"
    fi
  elif [ "$OS" = "darwin" ]; then
    if $SUDO "${INSTALL_DIR}/tunnet" service install 2>/dev/null; then
      info "launchd service installed"
    else
      warn "could not install launchd service (run: sudo tunnet service install)"
    fi
  fi
fi

info ""
info "${BOLD}Tunnet ${TAG} installed successfully!${RESET}"
info ""
info "Next steps:"
info "  tunnet --version                                        # verify"
info "  sudo tunnet enroll --control-url <url> --token <token>  # enroll"
info "  sudo tunnet service start                               # start"

}

main "$@"
