#!/bin/sh
set -eu
umask 077
base="${REF_DESIGN_CONNECTOR_HOME:-$HOME/.ref-design-cloud}"
mkdir -p "$base/downloads" "$base/tools"
chmod 700 "$base"
case "$(uname -s)" in Darwin) os=darwin;; Linux) os=linux;; *) echo '请使用 Windows bootstrap.ps1'; exit 1;; esac
case "$(uname -m)" in arm64|aarch64) arch=arm64;; x86_64) arch=x64;; *) echo '处理器不受支持'; exit 1;; esac
hash(){ if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1"; else shasum -a 256 "$1"; fi; }
version=v22.23.3
name="node-$version-$os-$arch"
node="$base/tools/$name/bin/node"
if [ ! -x "$node" ]; then
 curl -fSsL "https://nodejs.org/dist/$version/$name.tar.gz" -o "$base/downloads/node.tar.gz"
 curl -fSsL "https://nodejs.org/dist/$version/SHASUMS256.txt" -o "$base/downloads/node.sha256"
 expected=$(awk -v f="$name.tar.gz" '$2==f {print $1}' "$base/downloads/node.sha256")
 actual=$(hash "$base/downloads/node.tar.gz" | awk '{print $1}')
 [ -n "$expected" ] && [ "$expected" = "$actual" ] || { echo 'Node SHA256 校验失败'; exit 1; }
 tar -xzf "$base/downloads/node.tar.gz" -C "$base/tools"
fi
PATH="$(dirname "$node"):$PATH"; export PATH
if ! command -v codex >/dev/null 2>&1 && [ -z "${REF_DESIGN_CODEX_BIN:-}" ]; then
 npm install --prefix "$base/tools/codex" --no-audit --no-fund @openai/codex@0.153.4
 REF_DESIGN_CODEX_BIN="$base/tools/codex/node_modules/.bin/codex"; export REF_DESIGN_CODEX_BIN
fi
release=https://github.com/yuyou-dev/ref-design-cloud-plugin/releases/download/v0.1.2
curl -fSsL "$release/ref-design-cloud-0.1.2.tar.gz" -o "$base/downloads/plugin.tar.gz"
curl -fSsL "$release/ref-design-cloud-0.1.2.sha256" -o "$base/downloads/plugin.sha256"
expected=$(awk '$2=="ref-design-cloud-0.1.2.tar.gz" {print $1}' "$base/downloads/plugin.sha256")
actual=$(hash "$base/downloads/plugin.tar.gz" | awk '{print $1}')
[ -n "$expected" ] && [ "$expected" = "$actual" ] || { echo '插件 SHA256 校验失败'; exit 1; }
mkdir -p "$base/packages/0.1.2"
tar -xzf "$base/downloads/plugin.tar.gz" -C "$base/packages/0.1.2"
"$node" "$base/packages/0.1.2/installer/install.mjs"
