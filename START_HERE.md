# Ref Design 云端珠宝设计：一句话安装连接（v0.1.1 beta）

用户可以对 Codex 说：

> 请按 https://raw.githubusercontent.com/yuyou-dev/ref-design-cloud-plugin/v0.1.1/START_HERE.md 安装并连接 Ref Design 珠宝设计工作台，登录和授权由我完成。

你正在帮助用户安装 Ref Design 云端薄连接器。自动完成下载、校验和配置，简短告知“正在安装 → 等待登录授权 → 连接核验结果”。不要索要聊天中的账号密码、令牌或后台源码。安装成功不代表已完成授权，不得虚报本次连接。

1. 需要本机 Codex 桌面、浏览器和网络。版本固定 v0.1.1，仓库 https://github.com/yuyou-dev/ref-design-cloud-plugin 。先阅读版本内 `installer/bootstrap.sh`（macOS/Linux）或 `installer/bootstrap.ps1`（Windows）再下载执行，遵循宿主安装规则。安装器在用户私有目录下载官方 Node.js、必要时官方 Codex CLI，校验 Node 和连接器 SHA-256，不需要 Python、Docker 或后台源码。Windows/Linux 安装入口存在，但跨操作系统实机验证范围以 README 为准。
2. 安装器幂等保留登录，使用 `codex mcp add ref_design_cloud -- NODE START_MCP` 注册本地 stdio。同名不同来源配置报错时停止并说明，不删除或覆盖。记录安装器返回的 `node` 和 `cli` 路径，不读取凭据文件。不需要安装其他珠宝插件。
3. 使用连接器工具连接；如果当前聊天尚未加载新 MCP，用返回的 node 执行 cli `connect`，保持进程，打开其返回的登录地址。用户自行完成魔搭官方 OAuth 授权。不要代用户点击同意，不向用户索要平台 Token，也不读取浏览器 Cookie。
4. 按连接器返回说明进入 https://modelscope.cn/studios/yuyou80/ref_design_model?mode=full ，由用户输入开发者另行分配的 Ref Design 账号密码，完成应用配对。平台授权和应用账号是两层独立授权。遇到授权错误明确报告，不改用运营者 Token。
5. 使用 cli `status` 或连接状态工具检查真实连接；再通过 cli `tools` 获取服务端工具目录，按实际 schema 调用。授权待完成时等待用户，限流按 retryAt/Retry-After 退避，不反复登录、重启或重放生成请求。只有服务端账号及工程访问核验成功，才能告知“已连接”。
6. 进入工程管理首页，让用户创建或选择工程，不自动创建示例。工作台以 `view=codex` 展示中间画布和右侧生成结果，左侧参数在对话中引导。先获取设计参数，询问缺少的主石、款式、金属、参考图片与创作需求；保存到所选工程后再生成。模型只用魔搭服务，可选标准或 Turbo。上传只限本轮用户明确提供的附件，先准备上传再提交，跟踪任务到完成后展示真实结果与历史。不要把本机路径当成云端图片 URL，不把安装或参数保存称作出图。

这是独立 beta 插件，不是 OpenAI 官方公共插件目录。公开包只有登录、远程连接、安装器及使用说明。后台实现、模型凭据、用户数据库和图片不在此仓库中。

## 当前聊天未加载新工具时

使用安装器返回的 `node` 与 `cli` 绝对路径；macOS/Linux 为 `"NODE" "CLI" connect`（保持进程等待用户授权），再执行 `"NODE" "CLI" status`、`"NODE" "CLI" tools`。PowerShell 在前面加 `&`。调用服务工具：`"NODE" "CLI" call 工具名 /absolute/path/args.json`；最后参数必须是 UTF-8 JSON 文件路径，例如 get_project 的文件内容为 `{"projectId":"真实工程ID"}`，其他参数按 tools schema 填写。

聊天附件优先执行 `"NODE" "CLI" upload 工程ID /absolute/path/本轮附件.png`，该命令通过 MCP 分块上传，避免 ms.show capability URL 的平台网关拦截。本机路径不发给云端。上传后核对 SHA256，并重新读取工程确认 reference；通过后才生成。JSON 参数文件和聊天中均不写密码、Token。
