$ErrorActionPreference = 'Stop'
$base = if ($env:REF_DESIGN_CONNECTOR_HOME) { $env:REF_DESIGN_CONNECTOR_HOME } else { Join-Path $env:USERPROFILE '.ref-design-cloud' }
New-Item -ItemType Directory -Force "$base/downloads", "$base/tools" | Out-Null
$identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
& icacls $base /inheritance:r /grant:r "${identity}:(OI)(CI)F" | Out-Null
if ($LASTEXITCODE -ne 0) { throw '无法限制用户目录权限' }
$arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'arm64' } else { 'x64' }
$name = "node-v22.23.3-win-$arch"
$node = "$base/tools/$name/node.exe"
if (!(Test-Path $node)) {
 Invoke-WebRequest "https://nodejs.org/dist/v22.23.3/$name.zip" -OutFile "$base/downloads/node.zip"
 Invoke-WebRequest 'https://nodejs.org/dist/v22.23.3/SHASUMS256.txt' -OutFile "$base/downloads/node.sha256"
 $line = Get-Content "$base/downloads/node.sha256" | Where-Object { $_ -match "\s+$([regex]::Escape($name)).zip$" }
 $expected = ($line -split '\s+')[0]
 if (!$expected -or (Get-FileHash "$base/downloads/node.zip" -Algorithm SHA256).Hash -ne $expected) { throw 'Node SHA256 校验失败' }
 Expand-Archive "$base/downloads/node.zip" "$base/tools" -Force
}
$env:PATH = "$(Split-Path $node);$env:PATH"
if (!(Get-Command codex -ErrorAction SilentlyContinue) -and !$env:REF_DESIGN_CODEX_BIN) {
 & "$base/tools/$name/npm.cmd" install --prefix "$base/tools/codex" --no-audit --no-fund '@openai/codex@0.153.4'
 if ($LASTEXITCODE -ne 0) { throw 'Codex CLI 安装失败' }
 $env:REF_DESIGN_CODEX_BIN = "$base/tools/codex/node_modules/.bin/codex.cmd"
}
$release = 'https://github.com/yuyou-dev/ref-design-cloud-plugin/releases/download/v0.1.2'
Invoke-WebRequest "$release/ref-design-cloud-0.1.2.tar.gz" -OutFile "$base/downloads/plugin.tar.gz"
Invoke-WebRequest "$release/ref-design-cloud-0.1.2.sha256" -OutFile "$base/downloads/plugin.sha256"
$line = Get-Content "$base/downloads/plugin.sha256" | Where-Object { $_ -match '\s+ref-design-cloud-0.1.2.tar.gz$' }
$expected = ($line -split '\s+')[0]
if (!$expected -or (Get-FileHash "$base/downloads/plugin.tar.gz" -Algorithm SHA256).Hash -ne $expected) { throw '插件 SHA256 校验失败' }
New-Item -ItemType Directory -Force "$base/packages/0.1.2" | Out-Null
& tar -xzf "$base/downloads/plugin.tar.gz" -C "$base/packages/0.1.2"
if ($LASTEXITCODE -ne 0) { throw '插件解包失败' }
& $node "$base/packages/0.1.2/installer/install.mjs"
if ($LASTEXITCODE -ne 0) { throw '插件注册失败' }
