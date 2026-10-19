# Ref Design Cloud Plugin

通过 Codex 对话连接魔搭上的 Ref Design 1+1+1 珠宝设计工作台。公开仓库只包含薄连接器和安装文件，业务服务及源码保留在 protected 创空间。

## 分享入口

> 请按 https://raw.githubusercontent.com/yuyou-dev/ref-design-cloud-plugin/v0.1.1/START_HERE.md 安装并连接 Ref Design 珠宝设计工作台，登录和授权由我完成。

详细流程见 [START_HERE.md](START_HERE.md)。需要管理员分配的应用账号；用户自行完成魔搭官方授权和应用登录。不会向使用者分发运营者平台 Token。

## 安装与验证

先阅读 `installer/bootstrap.sh` 或 `installer/bootstrap.ps1` 再执行。版本固定 0.1.1；下载发布包和 SHA256 清单，安装至 `~/.ref-design-cloud`（Windows 为用户配置目录中的 `.ref-design-cloud`）。输出准确的 node/cli 路径；使用 `NODE CLI connect`、`NODE CLI status`、`NODE CLI tools`。工具调用参数由 `tools` 返回的 schema 决定。

同名不同来源 MCP 会停止安装；不改写其他 MCP 或已有登录。应用首先进入工程首页；工程的素材、草稿、参数和历史独立保存。Codex 工作台仅中间画布、右侧生成区域，参数通过对话引导。

本版本为 beta。安装器提供 macOS/Linux/Windows 入口；Windows 和 Linux 尚未实机验证，不能据此承诺全部平台通过。真实云端登录与生图验证结果见发布说明。无登录浏览器或无法接收本机 OAuth 回调的纯远程环境不支持此交互登录。

## 公开包边界

允许内容：安装器、远程 API/MCP 代理、授权客户端、对话技能、文档及第三方依赖许可证。禁止后台源码、模型服务密钥、账号密码、数据库、用户图片、私有路径和运行日志。SHA256 校验确认发布资产完整性；安装信任来源为上述固定版本 GitHub 仓库。

## 当前聊天未加载新工具时

使用安装器返回的 `node` 与 `cli` 绝对路径；macOS/Linux 为 `"NODE" "CLI" connect`（保持进程等待用户授权），再执行 `"NODE" "CLI" status`、`"NODE" "CLI" tools`。PowerShell 在前面加 `&`。调用服务工具：`"NODE" "CLI" call 工具名 /absolute/path/args.json`；最后参数必须是 UTF-8 JSON 文件路径，例如 get_project 的文件内容为 `{"projectId":"真实工程ID"}`，其他参数按 tools schema 填写。

聊天附件优先执行 `"NODE" "CLI" upload 工程ID /absolute/path/本轮附件.png`，该命令通过 MCP 分块上传，避免 ms.show capability URL 的平台网关拦截。本机路径不发给云端。上传后核对 SHA256，并重新读取工程确认 reference；通过后才生成。JSON 参数文件和聊天中均不写密码、Token。
